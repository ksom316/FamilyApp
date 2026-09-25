import { and, asc, eq, sql } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { familyMembers, householdMembers, households, users } from '@familyapp/db/schema';

import { requireFamilyMembership } from './family-service';

export type HouseholdErrorCode =
  | 'invalid_household'
  | 'invalid_member'
  | 'invalid_name'
  | 'invalid_description'
  | 'duplicate_name'
  | 'household_not_found'
  | 'member_not_found'
  | 'forbidden_role';

export class HouseholdServiceError extends Error {
  constructor(public readonly code: HouseholdErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'HouseholdServiceError';
  }
}

function assertUuid(value: string, kind: 'household' | 'member' = 'household') {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new HouseholdServiceError(
      kind === 'household' ? 'invalid_household' : 'invalid_member',
      `The ${kind} identifier is not valid.`
    );
  }
}

// Creation/rename/delete/membership changes are owner-or-guardian only. Regular members
// get a read-only view of the family's groups — there is no separate subgroup-admin role
// in this phase, deliberately, per scope.
function requireManager(role: 'owner' | 'guardian' | 'member') {
  if (role !== 'owner' && role !== 'guardian') {
    throw new HouseholdServiceError('forbidden_role', 'Only owners and guardians can manage the family network.', 403);
  }
}

function readName(value: unknown) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 80) {
    throw new HouseholdServiceError('invalid_name', 'Name must be between 1 and 80 characters.');
  }
  return value.trim();
}

function readDescription(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 500) {
    throw new HouseholdServiceError('invalid_description', 'Description must be 500 characters or fewer.');
  }
  return value.trim() || null;
}

// Case-insensitive pre-check for a friendlier error than the raw unique-index violation;
// the DB-level unique(familyId, name) index is the actual source of truth/enforcement.
async function assertNameAvailable(db: Database, familyId: string, name: string, excludeHouseholdId?: string) {
  const existing = await db
    .select({ id: households.id })
    .from(households)
    .where(and(eq(households.familyId, familyId), sql`lower(${households.name}) = lower(${name})`));
  if (existing.some((row) => row.id !== excludeHouseholdId)) {
    throw new HouseholdServiceError('duplicate_name', 'A group with that name already exists in your family.', 409);
  }
}

const memberSummarySelection = {
  memberId: familyMembers.id,
  displayName: users.name,
  avatar: users.image,
  role: familyMembers.role
};

export async function listHouseholds(db: Database, userId: string, familyId: string) {
  await requireFamilyMembership(db, userId, familyId);
  return db
    .select({
      id: households.id,
      familyId: households.familyId,
      name: households.name,
      description: households.description,
      createdByMemberId: households.createdByMemberId,
      createdAt: households.createdAt,
      updatedAt: households.updatedAt,
      memberCount: sql<number>`count(${householdMembers.id})::int`
    })
    .from(households)
    .leftJoin(householdMembers, and(eq(householdMembers.householdId, households.id), eq(householdMembers.familyId, households.familyId)))
    .where(eq(households.familyId, familyId))
    .groupBy(households.id)
    .orderBy(asc(households.createdAt));
}

export async function getHousehold(db: Database, userId: string, familyId: string, householdId: string) {
  assertUuid(householdId);
  await requireFamilyMembership(db, userId, familyId);

  const [household] = await db.select().from(households).where(and(eq(households.id, householdId), eq(households.familyId, familyId))).limit(1);
  if (!household) throw new HouseholdServiceError('household_not_found', 'Group not found.', 404);

  const members = await db
    .select(memberSummarySelection)
    .from(householdMembers)
    .innerJoin(familyMembers, and(eq(householdMembers.familyMemberId, familyMembers.id), eq(householdMembers.familyId, familyMembers.familyId)))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.familyId, familyId)))
    .orderBy(asc(users.name));

  return { household, members };
}

type HouseholdInput = { name?: unknown; description?: unknown };

export async function createHousehold(db: Database, userId: string, familyId: string, input: HouseholdInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  requireManager(membership.role);
  const name = readName(input.name);
  const description = readDescription(input.description);
  await assertNameAvailable(db, familyId, name);

  const [created] = await db
    .insert(households)
    .values({ familyId, name, description, createdByMemberId: membership.id })
    .returning({ id: households.id });
  if (!created) throw new Error('Group creation did not return the created record.');
  return getHousehold(db, userId, familyId, created.id);
}

export async function updateHousehold(db: Database, userId: string, familyId: string, householdId: string, input: HouseholdInput) {
  assertUuid(householdId);
  const membership = await requireFamilyMembership(db, userId, familyId);
  requireManager(membership.role);

  const [existing] = await db.select().from(households).where(and(eq(households.id, householdId), eq(households.familyId, familyId))).limit(1);
  if (!existing) throw new HouseholdServiceError('household_not_found', 'Group not found.', 404);

  const name = input.name === undefined ? existing.name : readName(input.name);
  const description = input.description === undefined ? existing.description : readDescription(input.description);
  if (name.toLowerCase() !== existing.name.toLowerCase()) await assertNameAvailable(db, familyId, name, householdId);

  await db.update(households).set({ name, description, updatedAt: new Date() }).where(and(eq(households.id, householdId), eq(households.familyId, familyId)));
  return getHousehold(db, userId, familyId, householdId);
}

// Deleting a group only removes the household row (and its membership join rows via
// cascade) — family members themselves are never touched.
export async function deleteHousehold(db: Database, userId: string, familyId: string, householdId: string) {
  assertUuid(householdId);
  const membership = await requireFamilyMembership(db, userId, familyId);
  requireManager(membership.role);

  const [existing] = await db.select({ id: households.id }).from(households).where(and(eq(households.id, householdId), eq(households.familyId, familyId))).limit(1);
  if (!existing) throw new HouseholdServiceError('household_not_found', 'Group not found.', 404);

  await db.delete(households).where(and(eq(households.id, householdId), eq(households.familyId, familyId)));
}

export async function addHouseholdMember(db: Database, userId: string, familyId: string, householdId: string, rawMemberId: unknown) {
  assertUuid(householdId);
  const membership = await requireFamilyMembership(db, userId, familyId);
  requireManager(membership.role);

  if (typeof rawMemberId !== 'string') throw new HouseholdServiceError('invalid_member', 'Choose a family member to add.');
  assertUuid(rawMemberId, 'member');

  const [household] = await db.select({ id: households.id }).from(households).where(and(eq(households.id, householdId), eq(households.familyId, familyId))).limit(1);
  if (!household) throw new HouseholdServiceError('household_not_found', 'Group not found.', 404);

  // Both the household and the target member are re-verified against this familyId, so a
  // member id from a different family can never be attached here.
  const [target] = await db.select({ id: familyMembers.id }).from(familyMembers).where(and(eq(familyMembers.id, rawMemberId), eq(familyMembers.familyId, familyId))).limit(1);
  if (!target) throw new HouseholdServiceError('member_not_found', 'That person is not in your family.', 404);

  await db.insert(householdMembers).values({ familyId, householdId, familyMemberId: rawMemberId }).onConflictDoNothing();
  return getHousehold(db, userId, familyId, householdId);
}

export async function removeHouseholdMember(db: Database, userId: string, familyId: string, householdId: string, memberId: string) {
  assertUuid(householdId);
  assertUuid(memberId, 'member');
  const membership = await requireFamilyMembership(db, userId, familyId);
  requireManager(membership.role);

  const [household] = await db.select({ id: households.id }).from(households).where(and(eq(households.id, householdId), eq(households.familyId, familyId))).limit(1);
  if (!household) throw new HouseholdServiceError('household_not_found', 'Group not found.', 404);

  await db
    .delete(householdMembers)
    .where(and(
      eq(householdMembers.householdId, householdId),
      eq(householdMembers.familyId, familyId),
      eq(householdMembers.familyMemberId, memberId)
    ));
  return getHousehold(db, userId, familyId, householdId);
}
