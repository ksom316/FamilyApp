import { and, desc, eq, gt, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { familyFindMeRequests, familyLocationShares, familyMembers, users } from '@familyapp/db/schema';

import { requireFamilyMembership } from './family-service';

export const ALLOWED_SHARE_DURATION_MINUTES = [15, 60, 240] as const;

export type LocationErrorCode =
  | 'invalid_location'
  | 'invalid_duration'
  | 'invalid_member'
  | 'invalid_response'
  | 'share_not_active'
  | 'request_not_found';

export class LocationServiceError extends Error {
  constructor(public readonly code: LocationErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'LocationServiceError';
  }
}

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new LocationServiceError('invalid_member', 'That identifier is not valid.');
  }
}

function readLatitude(value: unknown) {
  const num = typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(num) || num < -90 || num > 90) {
    throw new LocationServiceError('invalid_location', 'Latitude is not valid.');
  }
  return num;
}

function readLongitude(value: unknown) {
  const num = typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(num) || num < -180 || num > 180) {
    throw new LocationServiceError('invalid_location', 'Longitude is not valid.');
  }
  return num;
}

function readAccuracy(value: unknown) {
  if (value === undefined || value === null) return null;
  const num = typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(num) || num < 0 || num > 50_000) {
    throw new LocationServiceError('invalid_location', 'Accuracy is not valid.');
  }
  return num;
}

// The client may only choose from this fixed allowlist — an arbitrary client-supplied
// expiry timestamp or duration is never trusted; the server always computes expiresAt.
function readDurationMinutes(value: unknown) {
  if (typeof value !== 'number' || !ALLOWED_SHARE_DURATION_MINUTES.includes(value as (typeof ALLOWED_SHARE_DURATION_MINUTES)[number])) {
    throw new LocationServiceError('invalid_duration', 'Choose a valid sharing duration.');
  }
  return value;
}

const shareSelection = {
  memberId: familyLocationShares.memberId,
  latitude: familyLocationShares.latitude,
  longitude: familyLocationShares.longitude,
  accuracyMeters: familyLocationShares.accuracyMeters,
  expiresAt: familyLocationShares.expiresAt,
  updatedAt: familyLocationShares.updatedAt,
  member: {
    memberId: familyMembers.id,
    displayName: users.name,
    avatar: users.image,
    role: familyMembers.role
  }
};

type ShareRow = Awaited<ReturnType<typeof selectShareByMember>>;
export type ActiveLocationShare = Omit<NonNullable<ShareRow>, 'latitude' | 'longitude'> & { latitude: number; longitude: number };

// A row is only ever a real "active share" to the outside world if it still carries
// coordinates. Lazy cleanup (below) and an explicit stop both null lat/lng out, so this
// guard is what keeps a cleared-but-not-yet-expired row from ever being returned by a
// public API as if it were live.
function toActiveShare(row: NonNullable<ShareRow>): ActiveLocationShare | null {
  if (row.latitude === null || row.longitude === null) return null;
  return { ...row, latitude: row.latitude, longitude: row.longitude };
}

// Lightweight lazy cleanup: expiration can happen between requests with nothing to
// trigger it, so every entry point that touches this family's shares first sweeps any
// rows that expired but still carry coordinates and clears them. No cron job — this
// piggybacks on normal traffic (list/start/ping/find-me), which is enough since expired
// coordinates are never served anyway; this just stops them being retained at rest.
async function cleanupExpiredShares(db: Database, familyId: string) {
  await db
    .update(familyLocationShares)
    .set({ latitude: null, longitude: null, accuracyMeters: null, updatedAt: new Date() })
    .where(and(
      eq(familyLocationShares.familyId, familyId),
      lte(familyLocationShares.expiresAt, new Date()),
      isNotNull(familyLocationShares.latitude)
    ));
}

async function selectShareByMember(db: Database, familyId: string, memberId: string) {
  const [share] = await db
    .select(shareSelection)
    .from(familyLocationShares)
    .innerJoin(
      familyMembers,
      and(eq(familyLocationShares.memberId, familyMembers.id), eq(familyLocationShares.familyId, familyMembers.familyId))
    )
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(and(eq(familyLocationShares.memberId, memberId), eq(familyLocationShares.familyId, familyId)))
    .limit(1);
  return share ?? null;
}

export async function listActiveShares(db: Database, userId: string, familyId: string) {
  await requireFamilyMembership(db, userId, familyId);
  await cleanupExpiredShares(db, familyId);
  const now = new Date();
  const rows = await db
    .select(shareSelection)
    .from(familyLocationShares)
    .innerJoin(
      familyMembers,
      and(eq(familyLocationShares.memberId, familyMembers.id), eq(familyLocationShares.familyId, familyMembers.familyId))
    )
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(and(
      eq(familyLocationShares.familyId, familyId),
      isNull(familyLocationShares.stoppedAt),
      gt(familyLocationShares.expiresAt, now)
    ))
    .orderBy(desc(familyLocationShares.updatedAt));

  return rows.flatMap((row) => {
    const share = toActiveShare(row);
    return share ? [share] : [];
  });
}

type StartShareInput = { latitude: unknown; longitude: unknown; accuracyMeters?: unknown; durationMinutes: unknown };

export async function startShare(db: Database, userId: string, familyId: string, input: StartShareInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  await cleanupExpiredShares(db, familyId);
  const latitude = readLatitude(input.latitude);
  const longitude = readLongitude(input.longitude);
  const accuracyMeters = readAccuracy(input.accuracyMeters);
  const durationMinutes = readDurationMinutes(input.durationMinutes);
  const expiresAt = new Date(Date.now() + durationMinutes * 60_000);

  // Starting repopulates the same per-member row with a fresh fix and a new bounded
  // expiration, regardless of whether the previous session had already been cleared.
  await db
    .insert(familyLocationShares)
    .values({ familyId, memberId: membership.id, latitude, longitude, accuracyMeters, expiresAt })
    .onConflictDoUpdate({
      target: familyLocationShares.memberId,
      set: { familyId, latitude, longitude, accuracyMeters, expiresAt, stoppedAt: null, updatedAt: new Date() }
    });

  const row = await selectShareByMember(db, familyId, membership.id);
  const share = row && toActiveShare(row);
  if (!share) throw new Error('Location share could not be loaded after starting.');
  return share;
}

type PingShareInput = { latitude: unknown; longitude: unknown; accuracyMeters?: unknown };

// A foreground position refresh. This intentionally never touches expiresAt — letting a
// steady stream of pings quietly extend the session would turn a bounded share into
// indefinite sharing, which this phase explicitly does not implement.
export async function updateShare(db: Database, userId: string, familyId: string, input: PingShareInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  await cleanupExpiredShares(db, familyId);
  const latitude = readLatitude(input.latitude);
  const longitude = readLongitude(input.longitude);
  const accuracyMeters = readAccuracy(input.accuracyMeters);
  const now = new Date();

  const updated = await db
    .update(familyLocationShares)
    .set({ latitude, longitude, accuracyMeters, updatedAt: now })
    .where(and(
      eq(familyLocationShares.memberId, membership.id),
      eq(familyLocationShares.familyId, familyId),
      isNull(familyLocationShares.stoppedAt),
      gt(familyLocationShares.expiresAt, now)
    ))
    .returning({ memberId: familyLocationShares.memberId });

  if (!updated[0]) {
    // Either never started, already stopped, or just swept up as expired above — either
    // way there is nothing active to ping, so the caller must start a new share.
    throw new LocationServiceError('share_not_active', 'Start sharing again to keep sending updates.', 409);
  }

  const row = await selectShareByMember(db, familyId, membership.id);
  const share = row && toActiveShare(row);
  if (!share) throw new Error('Location share could not be loaded after updating.');
  return share;
}

// Explicit stop clears the precise coordinates immediately — it does not merely flip a
// flag while leaving latitude/longitude sitting in the row. Nothing after this point can
// read a location out of this member's share until they start again.
export async function stopShare(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  await db
    .update(familyLocationShares)
    .set({ latitude: null, longitude: null, accuracyMeters: null, stoppedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(familyLocationShares.memberId, membership.id), eq(familyLocationShares.familyId, familyId)));
}

const outgoingSelection = {
  id: familyFindMeRequests.id,
  expiresAt: familyFindMeRequests.expiresAt,
  response: familyFindMeRequests.response,
  respondedAt: familyFindMeRequests.respondedAt,
  createdAt: familyFindMeRequests.createdAt,
  recipient: {
    memberId: familyMembers.id,
    displayName: users.name,
    avatar: users.image
  }
};

async function selectOutgoingRequest(db: Database, familyId: string, requesterMemberId: string) {
  const [row] = await db
    .select(outgoingSelection)
    .from(familyFindMeRequests)
    .innerJoin(
      familyMembers,
      and(eq(familyFindMeRequests.recipientMemberId, familyMembers.id), eq(familyFindMeRequests.familyId, familyMembers.familyId))
    )
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(and(eq(familyFindMeRequests.requesterMemberId, requesterMemberId), eq(familyFindMeRequests.familyId, familyId)))
    .limit(1);
  return row ?? null;
}

type FindMeInput = {
  recipientMemberId: unknown;
  durationMinutes: unknown;
  latitude: unknown;
  longitude: unknown;
  accuracyMeters?: unknown;
};

export async function createFindMeRequest(db: Database, userId: string, familyId: string, input: FindMeInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  await cleanupExpiredShares(db, familyId);

  if (typeof input.recipientMemberId !== 'string') {
    throw new LocationServiceError('invalid_member', 'Choose who should come find you.');
  }
  assertUuid(input.recipientMemberId);
  if (input.recipientMemberId === membership.id) {
    throw new LocationServiceError('invalid_member', 'Choose someone else to come find you.');
  }

  const [recipient] = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(and(eq(familyMembers.id, input.recipientMemberId), eq(familyMembers.familyId, familyId)))
    .limit(1);
  if (!recipient) throw new LocationServiceError('invalid_member', 'That person is not in your family.');

  const durationMinutes = readDurationMinutes(input.durationMinutes);
  const latitude = readLatitude(input.latitude);
  const longitude = readLongitude(input.longitude);
  const accuracyMeters = readAccuracy(input.accuracyMeters);
  const expiresAt = new Date(Date.now() + durationMinutes * 60_000);

  // Come Find Me always keeps the requester's own location share active for at least as
  // long as the request — the recipient needs somewhere to look — but never shortens an
  // already-longer running share.
  await db
    .insert(familyLocationShares)
    .values({ familyId, memberId: membership.id, latitude, longitude, accuracyMeters, expiresAt })
    .onConflictDoUpdate({
      target: familyLocationShares.memberId,
      set: {
        familyId,
        latitude,
        longitude,
        accuracyMeters,
        expiresAt: sql`greatest(${familyLocationShares.expiresAt}, excluded.expires_at)`,
        stoppedAt: null,
        updatedAt: new Date()
      }
    });

  await db
    .insert(familyFindMeRequests)
    .values({ familyId, requesterMemberId: membership.id, recipientMemberId: input.recipientMemberId, expiresAt })
    .onConflictDoUpdate({
      target: familyFindMeRequests.requesterMemberId,
      set: {
        familyId,
        recipientMemberId: input.recipientMemberId,
        expiresAt,
        response: null,
        respondedAt: null
      }
    });

  const request = await selectOutgoingRequest(db, familyId, membership.id);
  if (!request) throw new Error('Come Find Me request could not be loaded after creating.');
  return request;
}

export async function getOutgoingFindMeRequest(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const request = await selectOutgoingRequest(db, familyId, membership.id);
  if (!request || request.expiresAt.getTime() <= Date.now()) return null;
  return request;
}

const incomingSelection = {
  id: familyFindMeRequests.id,
  expiresAt: familyFindMeRequests.expiresAt,
  response: familyFindMeRequests.response,
  respondedAt: familyFindMeRequests.respondedAt,
  createdAt: familyFindMeRequests.createdAt,
  requester: {
    memberId: familyMembers.id,
    displayName: users.name,
    avatar: users.image
  }
};

export async function listIncomingFindMeRequests(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const now = new Date();
  return db
    .select(incomingSelection)
    .from(familyFindMeRequests)
    .innerJoin(
      familyMembers,
      and(eq(familyFindMeRequests.requesterMemberId, familyMembers.id), eq(familyFindMeRequests.familyId, familyMembers.familyId))
    )
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(and(
      eq(familyFindMeRequests.familyId, familyId),
      eq(familyFindMeRequests.recipientMemberId, membership.id),
      gt(familyFindMeRequests.expiresAt, now),
      or(isNull(familyFindMeRequests.response), eq(familyFindMeRequests.response, 'coming'))
    ))
    .orderBy(desc(familyFindMeRequests.createdAt));
}

// The WHERE clause below doubles as the authorization check: only a row where the caller
// is the recipient can ever match, so an unrelated member gets an identical 404 instead
// of a 403 that would otherwise confirm the request exists.
export async function respondToFindMeRequest(db: Database, userId: string, familyId: string, requestId: string, response: unknown) {
  assertUuid(requestId);
  if (response !== 'coming' && response !== 'dismissed') {
    throw new LocationServiceError('invalid_response', 'Choose a valid response.');
  }
  const membership = await requireFamilyMembership(db, userId, familyId);

  const updated = await db
    .update(familyFindMeRequests)
    .set({ response, respondedAt: new Date() })
    .where(and(
      eq(familyFindMeRequests.id, requestId),
      eq(familyFindMeRequests.familyId, familyId),
      eq(familyFindMeRequests.recipientMemberId, membership.id)
    ))
    .returning({ id: familyFindMeRequests.id });

  if (!updated[0]) throw new LocationServiceError('request_not_found', 'That request is no longer available.', 404);
}

export async function cancelOutgoingFindMeRequest(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  await db
    .delete(familyFindMeRequests)
    .where(and(eq(familyFindMeRequests.requesterMemberId, membership.id), eq(familyFindMeRequests.familyId, familyId)));
}
