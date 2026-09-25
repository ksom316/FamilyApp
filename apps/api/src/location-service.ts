import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import {
  familyFindMeRequests,
  familyLocationShareMembers,
  familyLocationShares,
  familyMembers,
  householdMembers,
  households,
  users
} from '@familyapp/db/schema';

import { requireFamilyMembership } from './family-service';
import { createNotifications, familyMemberIds, householdMemberIds, recipientsExcluding } from './notifications-service';

export const ALLOWED_SHARE_DURATION_MINUTES = [15, 60, 240] as const;
const AUDIENCE_TYPES = ['family', 'household', 'members'] as const;
type AudienceType = typeof AUDIENCE_TYPES[number];

export type LocationErrorCode =
  | 'invalid_location'
  | 'invalid_duration'
  | 'invalid_member'
  | 'invalid_audience'
  | 'invalid_household'
  | 'household_not_eligible'
  | 'invalid_response'
  | 'share_not_active'
  | 'share_not_found'
  | 'request_not_found';

export class LocationServiceError extends Error {
  constructor(public readonly code: LocationErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'LocationServiceError';
  }
}

function assertUuid(value: string, code: LocationErrorCode = 'invalid_member') {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new LocationServiceError(code, code === 'share_not_found' ? 'Location share not found.' : 'That identifier is not valid.', code === 'share_not_found' ? 404 : 400);
  }
}

function readLatitude(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -90 || value > 90) {
    throw new LocationServiceError('invalid_location', 'Latitude is not valid.');
  }
  return value;
}

function readLongitude(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -180 || value > 180) {
    throw new LocationServiceError('invalid_location', 'Longitude is not valid.');
  }
  return value;
}

function readAccuracy(value: unknown) {
  if (value === undefined || value === null) return null;
  // Accuracy is optional platform metadata, not the location itself. Browsers and
  // native providers may return an unavailable/non-finite value or an extremely coarse
  // estimate. Normalize anything outside the nullable DB constraint instead of
  // rejecting otherwise valid coordinates.
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 50_000
    ? value
    : null;
}

function readDurationMinutes(value: unknown) {
  if (typeof value !== 'number' || !ALLOWED_SHARE_DURATION_MINUTES.includes(value as (typeof ALLOWED_SHARE_DURATION_MINUTES)[number])) {
    throw new LocationServiceError('invalid_duration', 'Choose a valid sharing duration.');
  }
  return value;
}

function readAudienceType(value: unknown) {
  if (typeof value !== 'string' || !AUDIENCE_TYPES.includes(value as AudienceType)) {
    throw new LocationServiceError('invalid_audience', 'Choose who can see your location.');
  }
  return value as AudienceType;
}

function readMemberIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) throw new LocationServiceError('invalid_audience', 'Choose at least one person.');
  const ids = value.map((id) => {
    if (typeof id !== 'string') throw new LocationServiceError('invalid_audience', 'Choose valid family members.');
    assertUuid(id);
    return id;
  });
  return [...new Set(ids)];
}

type AudienceInput = { audienceType?: unknown; householdId?: unknown; memberIds?: unknown };

async function readAudience(db: Database, familyId: string, sharingMemberId: string, input: AudienceInput) {
  const audienceType = readAudienceType(input.audienceType);
  if (audienceType === 'family') return { audienceType, householdId: null, memberIds: [] as string[] };
  if (audienceType === 'household') {
    if (typeof input.householdId !== 'string') throw new LocationServiceError('invalid_household', 'Choose a valid family group.');
    assertUuid(input.householdId);
    const [eligible] = await db.select({ id: householdMembers.id }).from(householdMembers).where(and(
      eq(householdMembers.familyId, familyId),
      eq(householdMembers.householdId, input.householdId),
      eq(householdMembers.familyMemberId, sharingMemberId)
    )).limit(1);
    if (!eligible) throw new LocationServiceError('household_not_eligible', 'You can only share with a family group you belong to.', 403);
    return { audienceType, householdId: input.householdId, memberIds: [] as string[] };
  }
  const memberIds = readMemberIds(input.memberIds);
  const rows = await db.select({ id: familyMembers.id }).from(familyMembers).where(and(
    eq(familyMembers.familyId, familyId), inArray(familyMembers.id, memberIds)
  ));
  if (rows.length !== memberIds.length) throw new LocationServiceError('invalid_member', 'Choose people from your family.');
  return { audienceType, householdId: null, memberIds };
}

const shareSelection = {
  id: familyLocationShares.id,
  memberId: familyLocationShares.memberId,
  purpose: familyLocationShares.purpose,
  audienceType: familyLocationShares.audienceType,
  householdId: familyLocationShares.householdId,
  householdName: households.name,
  latitude: familyLocationShares.latitude,
  longitude: familyLocationShares.longitude,
  accuracyMeters: familyLocationShares.accuracyMeters,
  startedAt: familyLocationShares.startedAt,
  expiresAt: familyLocationShares.expiresAt,
  stoppedAt: familyLocationShares.stoppedAt,
  updatedAt: familyLocationShares.updatedAt,
  member: {
    memberId: familyMembers.id,
    displayName: users.name,
    avatar: users.image,
    role: familyMembers.role,
    identityType: users.identityType,
    avatarConfig: users.avatarConfig,
    hasPhoto: sql<boolean>`${users.photoObjectKey} is not null`
  }
};

async function selectShareByMember(db: Database, familyId: string, memberId: string) {
  const [share] = await db.select(shareSelection).from(familyLocationShares)
    .innerJoin(familyMembers, and(eq(familyLocationShares.memberId, familyMembers.id), eq(familyLocationShares.familyId, familyMembers.familyId)))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .leftJoin(households, and(eq(familyLocationShares.householdId, households.id), eq(familyLocationShares.familyId, households.familyId)))
    .where(and(eq(familyLocationShares.memberId, memberId), eq(familyLocationShares.familyId, familyId))).limit(1);
  return share ?? null;
}

type ShareRow = NonNullable<Awaited<ReturnType<typeof selectShareByMember>>>;

async function hydrateShares(db: Database, rows: ShareRow[]) {
  const targetedIds = rows.filter((row) => row.audienceType === 'members').map((row) => row.id);
  const membersByShare = new Map<string, Array<{ memberId: string; displayName: string; avatar: string | null }>>();
  if (targetedIds.length) {
    const targets = await db.select({
      shareId: familyLocationShareMembers.shareId,
      memberId: familyMembers.id,
      displayName: users.name,
      avatar: users.image
    }).from(familyLocationShareMembers)
      .innerJoin(familyMembers, and(eq(familyLocationShareMembers.memberId, familyMembers.id), eq(familyLocationShareMembers.familyId, familyMembers.familyId)))
      .innerJoin(users, eq(familyMembers.userId, users.id))
      .where(inArray(familyLocationShareMembers.shareId, targetedIds));
    for (const target of targets) {
      const current = membersByShare.get(target.shareId) ?? [];
      current.push({ memberId: target.memberId, displayName: target.displayName, avatar: target.avatar });
      membersByShare.set(target.shareId, current);
    }
  }
  return rows.flatMap((row) => {
    if (row.latitude === null || row.longitude === null) return [];
    return [{
      id: row.id,
      memberId: row.memberId,
      purpose: row.purpose as 'location' | 'come_find_me',
      latitude: row.latitude,
      longitude: row.longitude,
      accuracyMeters: row.accuracyMeters,
      startedAt: row.startedAt,
      expiresAt: row.expiresAt,
      updatedAt: row.updatedAt,
      member: row.member,
      audience: row.audienceType === 'household'
        ? { type: 'household' as const, household: { id: row.householdId as string, name: row.householdName ?? 'Family group' } }
        : row.audienceType === 'members'
          ? { type: 'members' as const, members: membersByShare.get(row.id) ?? [] }
          : { type: 'family' as const }
    }];
  });
}

async function cleanupExpiredShares(db: Database, familyId: string) {
  await db.update(familyLocationShares).set({ latitude: null, longitude: null, accuracyMeters: null, updatedAt: new Date() })
    .where(and(eq(familyLocationShares.familyId, familyId), lte(familyLocationShares.expiresAt, new Date()), isNotNull(familyLocationShares.latitude)));
}

async function visibilityConditions(db: Database, familyId: string, memberId: string) {
  const myHouseholds = await db.select({ householdId: householdMembers.householdId }).from(householdMembers)
    .where(and(eq(householdMembers.familyId, familyId), eq(householdMembers.familyMemberId, memberId)));
  const conditions: SQL[] = [eq(familyLocationShares.memberId, memberId), eq(familyLocationShares.audienceType, 'family')];
  if (myHouseholds.length) conditions.push(and(
    eq(familyLocationShares.audienceType, 'household'),
    inArray(familyLocationShares.householdId, myHouseholds.map((row) => row.householdId))
  )!);
  return conditions;
}

async function selectVisibleShares(db: Database, familyId: string, memberId: string, extra?: SQL) {
  const conditions = await visibilityConditions(db, familyId, memberId);
  return db.select(shareSelection).from(familyLocationShares)
    .innerJoin(familyMembers, and(eq(familyLocationShares.memberId, familyMembers.id), eq(familyLocationShares.familyId, familyMembers.familyId)))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .leftJoin(households, and(eq(familyLocationShares.householdId, households.id), eq(familyLocationShares.familyId, households.familyId)))
    .leftJoin(familyLocationShareMembers, and(
      eq(familyLocationShareMembers.shareId, familyLocationShares.id),
      eq(familyLocationShareMembers.familyId, familyLocationShares.familyId),
      eq(familyLocationShareMembers.memberId, memberId)
    ))
    .where(and(
      eq(familyLocationShares.familyId, familyId),
      isNull(familyLocationShares.stoppedAt),
      gt(familyLocationShares.expiresAt, new Date()),
      isNotNull(familyLocationShares.latitude),
      extra,
      or(...conditions, and(eq(familyLocationShares.audienceType, 'members'), isNotNull(familyLocationShareMembers.id)))
    )).orderBy(desc(familyLocationShares.updatedAt));
}

export async function listActiveShares(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  await cleanupExpiredShares(db, familyId);
  return hydrateShares(db, await selectVisibleShares(db, familyId, membership.id));
}

export async function getActiveShare(db: Database, userId: string, familyId: string, shareId: string) {
  assertUuid(shareId, 'share_not_found');
  const membership = await requireFamilyMembership(db, userId, familyId);
  await cleanupExpiredShares(db, familyId);
  const rows = await selectVisibleShares(db, familyId, membership.id, eq(familyLocationShares.id, shareId));
  const [share] = await hydrateShares(db, rows);
  if (!share) throw new LocationServiceError('share_not_found', 'Location share not found.', 404);
  return share;
}

type CoordinatesInput = { latitude: unknown; longitude: unknown; accuracyMeters?: unknown; durationMinutes: unknown };

async function persistShare(
  db: Database,
  familyId: string,
  memberId: string,
  input: CoordinatesInput,
  purpose: 'location' | 'come_find_me',
  audience: { audienceType: AudienceType; householdId: string | null; memberIds: string[] }
) {
  const latitude = readLatitude(input.latitude);
  const longitude = readLongitude(input.longitude);
  const accuracyMeters = readAccuracy(input.accuracyMeters);
  const durationMinutes = readDurationMinutes(input.durationMinutes);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMinutes * 60_000);
  const existing = await selectShareByMember(db, familyId, memberId);
  const shareId = existing?.id ?? crypto.randomUUID();
  const upsert = db.insert(familyLocationShares).values({
    id: shareId, familyId, memberId, purpose, audienceType: audience.audienceType,
    householdId: audience.householdId, latitude, longitude, accuracyMeters, startedAt: now, expiresAt
  }).onConflictDoUpdate({
    target: familyLocationShares.memberId,
    set: {
      familyId, purpose, audienceType: audience.audienceType, householdId: audience.householdId,
      latitude, longitude, accuracyMeters, startedAt: now, expiresAt, stoppedAt: null, updatedAt: now
    }
  });
  const removeTargets = db.delete(familyLocationShareMembers).where(and(
    eq(familyLocationShareMembers.shareId, shareId), eq(familyLocationShareMembers.familyId, familyId)
  ));
  if (audience.memberIds.length) {
    const addTargets = db.insert(familyLocationShareMembers).values(
      audience.memberIds.map((targetMemberId) => ({ familyId, shareId, memberId: targetMemberId }))
    );
    await db.batch([upsert, removeTargets, addTargets] as const);
  } else await db.batch([upsert, removeTargets] as const);
  const row = await selectShareByMember(db, familyId, memberId);
  const [share] = row ? await hydrateShares(db, [row]) : [];
  if (!share) throw new Error('Location share could not be loaded after starting.');
  return share;
}

export async function startShare(db: Database, userId: string, familyId: string, input: CoordinatesInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  await cleanupExpiredShares(db, familyId);
  return persistShare(db, familyId, membership.id, input, 'location', { audienceType: 'family', householdId: null, memberIds: [] });
}

type ComeFindMeInput = CoordinatesInput & AudienceInput;

export async function startComeFindMe(db: Database, userId: string, familyId: string, input: ComeFindMeInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  await cleanupExpiredShares(db, familyId);
  const audience = await readAudience(db, familyId, membership.id, input);
  const share = await persistShare(db, familyId, membership.id, input, 'come_find_me', audience);
  const recipients = audience.audienceType === 'family'
    ? await familyMemberIds(db, familyId)
    : audience.audienceType === 'household'
      ? await householdMemberIds(db, familyId, audience.householdId as string)
      : audience.memberIds;
  await createNotifications(db, recipientsExcluding(recipients, membership.id).map((recipientMemberId) => ({
    familyId,
    recipientMemberId,
    actorMemberId: membership.id,
    type: 'come_find_me_started',
    title: `${share.member.displayName} is sharing their location`,
    message: 'Open Come Find Me to view their latest location.',
    entityType: 'location_share',
    entityId: share.id,
    route: '/(family)/location'
  })));
  return share;
}

export async function updateComeFindMeAudience(db: Database, userId: string, familyId: string, input: AudienceInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const existing = await selectShareByMember(db, familyId, membership.id);
  if (!existing || existing.purpose !== 'come_find_me' || existing.stoppedAt !== null || existing.expiresAt.getTime() <= Date.now() || existing.latitude === null) {
    throw new LocationServiceError('share_not_active', 'Start Come Find Me before changing its audience.', 409);
  }
  const audience = await readAudience(db, familyId, membership.id, input);
  const update = db.update(familyLocationShares).set({
    audienceType: audience.audienceType, householdId: audience.householdId, updatedAt: new Date()
  }).where(and(eq(familyLocationShares.id, existing.id), eq(familyLocationShares.familyId, familyId), eq(familyLocationShares.memberId, membership.id)));
  const removeTargets = db.delete(familyLocationShareMembers).where(and(
    eq(familyLocationShareMembers.shareId, existing.id), eq(familyLocationShareMembers.familyId, familyId)
  ));
  if (audience.memberIds.length) {
    const addTargets = db.insert(familyLocationShareMembers).values(audience.memberIds.map((memberId) => ({ familyId, shareId: existing.id, memberId })));
    await db.batch([update, removeTargets, addTargets] as const);
  } else await db.batch([update, removeTargets] as const);
  const row = await selectShareByMember(db, familyId, membership.id);
  const [share] = row ? await hydrateShares(db, [row]) : [];
  if (!share) throw new LocationServiceError('share_not_active', 'That sharing session is no longer active.', 409);
  return share;
}

type PingShareInput = { latitude: unknown; longitude: unknown; accuracyMeters?: unknown };

export async function updateShare(db: Database, userId: string, familyId: string, input: PingShareInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  await cleanupExpiredShares(db, familyId);
  const now = new Date();
  const updated = await db.update(familyLocationShares).set({
    latitude: readLatitude(input.latitude), longitude: readLongitude(input.longitude),
    accuracyMeters: readAccuracy(input.accuracyMeters), updatedAt: now
  }).where(and(
    eq(familyLocationShares.memberId, membership.id), eq(familyLocationShares.familyId, familyId),
    isNull(familyLocationShares.stoppedAt), gt(familyLocationShares.expiresAt, now)
  )).returning({ id: familyLocationShares.id });
  if (!updated[0]) throw new LocationServiceError('share_not_active', 'Start sharing again to keep sending updates.', 409);
  const row = await selectShareByMember(db, familyId, membership.id);
  const [share] = row ? await hydrateShares(db, [row]) : [];
  if (!share) throw new Error('Location share could not be loaded after updating.');
  return share;
}

export async function stopShare(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  await db.update(familyLocationShares)
    .set({ latitude: null, longitude: null, accuracyMeters: null, stoppedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(familyLocationShares.memberId, membership.id), eq(familyLocationShares.familyId, familyId)));
}

const outgoingSelection = {
  id: familyFindMeRequests.id,
  expiresAt: familyFindMeRequests.expiresAt,
  response: familyFindMeRequests.response,
  respondedAt: familyFindMeRequests.respondedAt,
  createdAt: familyFindMeRequests.createdAt,
  recipient: { memberId: familyMembers.id, displayName: users.name, avatar: users.image }
};

async function selectOutgoingRequest(db: Database, familyId: string, requesterMemberId: string) {
  const [row] = await db.select(outgoingSelection).from(familyFindMeRequests)
    .innerJoin(familyMembers, and(eq(familyFindMeRequests.recipientMemberId, familyMembers.id), eq(familyFindMeRequests.familyId, familyMembers.familyId)))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(and(eq(familyFindMeRequests.requesterMemberId, requesterMemberId), eq(familyFindMeRequests.familyId, familyId))).limit(1);
  return row ?? null;
}

type FindMeInput = CoordinatesInput & { recipientMemberId: unknown };

// Compatibility for the original one-recipient request API. It now starts the same
// audience-protected Come Find Me share instead of exposing the requester family-wide.
export async function createFindMeRequest(db: Database, userId: string, familyId: string, input: FindMeInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  if (typeof input.recipientMemberId !== 'string') throw new LocationServiceError('invalid_member', 'Choose who should come find you.');
  assertUuid(input.recipientMemberId);
  if (input.recipientMemberId === membership.id) throw new LocationServiceError('invalid_member', 'Choose someone else to come find you.');
  const share = await startComeFindMe(db, userId, familyId, { ...input, audienceType: 'members', memberIds: [input.recipientMemberId] });
  await db.insert(familyFindMeRequests).values({
    familyId, requesterMemberId: membership.id, recipientMemberId: input.recipientMemberId, expiresAt: share.expiresAt
  }).onConflictDoUpdate({
    target: familyFindMeRequests.requesterMemberId,
    set: { familyId, recipientMemberId: input.recipientMemberId, expiresAt: share.expiresAt, response: null, respondedAt: null }
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
  requester: { memberId: familyMembers.id, displayName: users.name, avatar: users.image }
};

export async function listIncomingFindMeRequests(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  return db.select(incomingSelection).from(familyFindMeRequests)
    .innerJoin(familyMembers, and(eq(familyFindMeRequests.requesterMemberId, familyMembers.id), eq(familyFindMeRequests.familyId, familyMembers.familyId)))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(and(
      eq(familyFindMeRequests.familyId, familyId), eq(familyFindMeRequests.recipientMemberId, membership.id),
      gt(familyFindMeRequests.expiresAt, new Date()), or(isNull(familyFindMeRequests.response), eq(familyFindMeRequests.response, 'coming'))
    )).orderBy(desc(familyFindMeRequests.createdAt));
}

export async function respondToFindMeRequest(db: Database, userId: string, familyId: string, requestId: string, response: unknown) {
  assertUuid(requestId);
  if (response !== 'coming' && response !== 'dismissed') throw new LocationServiceError('invalid_response', 'Choose a valid response.');
  const membership = await requireFamilyMembership(db, userId, familyId);
  const updated = await db.update(familyFindMeRequests).set({ response, respondedAt: new Date() }).where(and(
    eq(familyFindMeRequests.id, requestId), eq(familyFindMeRequests.familyId, familyId),
    eq(familyFindMeRequests.recipientMemberId, membership.id)
  )).returning({ id: familyFindMeRequests.id });
  if (!updated[0]) throw new LocationServiceError('request_not_found', 'That request is no longer available.', 404);
}

export async function cancelOutgoingFindMeRequest(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  await db.delete(familyFindMeRequests).where(and(
    eq(familyFindMeRequests.requesterMemberId, membership.id), eq(familyFindMeRequests.familyId, familyId)
  ));
}
