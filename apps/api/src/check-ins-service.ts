import { and, desc, eq } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { familyCheckIns, familyMembers, users } from '@familyapp/db/schema';

import { requireFamilyMembership } from './family-service';

export const CHECK_IN_STATUSES = ['safe', 'arrived'] as const;
export type CheckInStatus = (typeof CHECK_IN_STATUSES)[number];

const RECENT_CHECK_INS_LIMIT = 30;
const MAX_MESSAGE_LENGTH = 200;

export type CheckInErrorCode = 'invalid_status' | 'invalid_message';

export class CheckInServiceError extends Error {
  constructor(public readonly code: CheckInErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'CheckInServiceError';
  }
}

function readStatus(value: unknown): CheckInStatus {
  if (typeof value !== 'string' || !CHECK_IN_STATUSES.includes(value as CheckInStatus)) {
    throw new CheckInServiceError('invalid_status', 'Choose a valid check-in status.');
  }
  return value as CheckInStatus;
}

function readMessage(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new CheckInServiceError('invalid_message', 'That note is not valid.');
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new CheckInServiceError('invalid_message', `Notes can be up to ${MAX_MESSAGE_LENGTH} characters.`);
  }
  return trimmed;
}

const checkInSelection = {
  id: familyCheckIns.id,
  status: familyCheckIns.status,
  message: familyCheckIns.message,
  createdAt: familyCheckIns.createdAt,
  member: {
    memberId: familyMembers.id,
    displayName: users.name,
    avatar: users.image
  }
};

function selectCheckIns(db: Database) {
  return db
    .select(checkInSelection)
    .from(familyCheckIns)
    .innerJoin(
      familyMembers,
      and(eq(familyCheckIns.memberId, familyMembers.id), eq(familyCheckIns.familyId, familyMembers.familyId))
    )
    .innerJoin(users, eq(familyMembers.userId, users.id));
}

export async function listRecentCheckIns(db: Database, userId: string, familyId: string) {
  await requireFamilyMembership(db, userId, familyId);
  return selectCheckIns(db)
    .where(eq(familyCheckIns.familyId, familyId))
    .orderBy(desc(familyCheckIns.createdAt))
    .limit(RECENT_CHECK_INS_LIMIT);
}

type CreateCheckInInput = { status: unknown; message?: unknown };

// Actor identity always comes from the authenticated session's own membership row — a
// member can only ever post a check-in as themselves, never on someone else's behalf.
export async function createCheckIn(db: Database, userId: string, familyId: string, input: CreateCheckInInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const status = readStatus(input.status);
  const message = readMessage(input.message);

  const [inserted] = await db
    .insert(familyCheckIns)
    .values({ familyId, memberId: membership.id, status, message })
    .returning({ id: familyCheckIns.id });

  const [checkIn] = await selectCheckIns(db).where(eq(familyCheckIns.id, inserted.id)).limit(1);
  if (!checkIn) throw new Error('Check-in could not be loaded after creating.');
  return checkIn;
}
