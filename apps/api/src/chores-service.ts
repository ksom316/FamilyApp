import { and, asc, desc, eq, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { familyChoreAssignments, familyChores, familyMembers, householdMembers, households, users } from '@familyapp/db/schema';

import { requireFamilyMembership } from './family-service';
import { createNotifications, familyMemberIds, householdMemberIds, recipientsExcluding } from './notifications-service';

const AUDIENCE_TYPES = ['family', 'household', 'members'] as const;
type AudienceType = (typeof AUDIENCE_TYPES)[number];

const MAX_TITLE_LENGTH = 140;
const MAX_DESCRIPTION_LENGTH = 2000;

export type ChoreErrorCode =
  | 'invalid_chore'
  | 'invalid_title'
  | 'invalid_description'
  | 'invalid_due_at'
  | 'invalid_audience'
  | 'invalid_household'
  | 'invalid_member'
  | 'household_not_eligible'
  | 'forbidden_audience'
  | 'chore_not_found'
  | 'forbidden_chore_action'
  | 'not_assigned';

export class ChoreServiceError extends Error {
  constructor(public readonly code: ChoreErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'ChoreServiceError';
  }
}

function assertUuid(value: string, label = 'task') {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ChoreServiceError('invalid_chore', `The ${label} identifier is not valid.`);
  }
}

function readTitle(value: unknown) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > MAX_TITLE_LENGTH) {
    throw new ChoreServiceError('invalid_title', `Title must be between 1 and ${MAX_TITLE_LENGTH} characters.`);
  }
  return value.trim();
}

function readDescription(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > MAX_DESCRIPTION_LENGTH) {
    throw new ChoreServiceError('invalid_description', `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
  }
  return value.trim() || null;
}

function readDueAt(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new ChoreServiceError('invalid_due_at', 'Choose a valid due date.');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ChoreServiceError('invalid_due_at', 'Choose a valid due date.');
  return date;
}

function readAudienceType(value: unknown) {
  if (typeof value !== 'string' || !AUDIENCE_TYPES.includes(value as AudienceType)) {
    throw new ChoreServiceError('invalid_audience', 'Choose who this task is for.');
  }
  return value as AudienceType;
}

function readMemberIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ChoreServiceError('invalid_audience', 'Choose at least one person.');
  }
  const ids = value.map((id) => {
    if (typeof id !== 'string') throw new ChoreServiceError('invalid_member', 'Choose valid people.');
    assertUuid(id, 'member');
    return id;
  });
  return [...new Set(ids)];
}

async function assertMembersEligible(db: Database, familyId: string, memberIds: string[]) {
  const rows = await db.select({ id: familyMembers.id }).from(familyMembers)
    .where(and(eq(familyMembers.familyId, familyId), inArray(familyMembers.id, memberIds)));
  if (rows.length !== memberIds.length) {
    throw new ChoreServiceError('invalid_member', 'Choose people from your family.');
  }
}

async function assertHouseholdEligible(db: Database, familyId: string, householdId: string, memberId: string) {
  assertUuid(householdId, 'group');
  const [row] = await db.select({ id: householdMembers.id }).from(householdMembers).where(and(
    eq(householdMembers.householdId, householdId),
    eq(householdMembers.familyId, familyId),
    eq(householdMembers.familyMemberId, memberId)
  )).limit(1);
  if (!row) throw new ChoreServiceError('household_not_eligible', 'You can only assign a task to a group you belong to.', 403);
}

type AudienceInput = { audienceType?: unknown; householdId?: unknown; memberIds?: unknown };

// A normal member may only assign a whole-family task or a personal (self-only) task.
// Assigning a household, or specific people other than themselves, requires owner/guardian
// — enforced here, not just hidden in the UI.
async function resolveAudience(
  db: Database,
  familyId: string,
  membership: { id: string; role: string },
  input: AudienceInput
) {
  const audienceType = readAudienceType(input.audienceType);
  const isPrivileged = membership.role === 'owner' || membership.role === 'guardian';

  if (audienceType === 'family') {
    return { audienceType, householdId: null as string | null, memberIds: await familyMemberIds(db, familyId) };
  }

  if (audienceType === 'household') {
    if (!isPrivileged) throw new ChoreServiceError('forbidden_audience', 'Only an owner or guardian can assign a task to a family group.', 403);
    if (typeof input.householdId !== 'string') throw new ChoreServiceError('invalid_household', 'Choose a valid family group.');
    await assertHouseholdEligible(db, familyId, input.householdId, membership.id);
    return { audienceType, householdId: input.householdId, memberIds: await householdMemberIds(db, familyId, input.householdId) };
  }

  const memberIds = readMemberIds(input.memberIds);
  const isSelfOnly = memberIds.length === 1 && memberIds[0] === membership.id;
  if (!isSelfOnly && !isPrivileged) {
    throw new ChoreServiceError('forbidden_audience', 'Only an owner or guardian can assign a task to other specific people.', 403);
  }
  await assertMembersEligible(db, familyId, memberIds);
  return { audienceType, householdId: null as string | null, memberIds };
}

const choreBaseSelection = {
  id: familyChores.id,
  familyId: familyChores.familyId,
  createdByMemberId: familyChores.createdByMemberId,
  audienceType: familyChores.audienceType,
  householdId: familyChores.householdId,
  householdName: households.name,
  title: familyChores.title,
  description: familyChores.description,
  dueAt: familyChores.dueAt,
  createdAt: familyChores.createdAt,
  updatedAt: familyChores.updatedAt,
  createdBy: {
    memberId: familyMembers.id,
    displayName: users.name,
    avatar: users.image
  }
};

function baseChoreQuery(db: Database) {
  return db
    .select(choreBaseSelection)
    .from(familyChores)
    .innerJoin(familyMembers, and(eq(familyChores.createdByMemberId, familyMembers.id), eq(familyChores.familyId, familyMembers.familyId)))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .leftJoin(households, and(eq(familyChores.householdId, households.id), eq(familyChores.familyId, households.familyId)));
}

type ChoreRow = Awaited<ReturnType<typeof baseChoreQuery>>[number];

function audienceSummary(row: ChoreRow) {
  if (row.audienceType === 'household') return { type: 'household' as const, household: { id: row.householdId as string, name: row.householdName ?? 'Group' } };
  if (row.audienceType === 'members') return { type: 'members' as const };
  return { type: 'family' as const };
}

async function selectVisibleChoreRows(db: Database, familyId: string, memberId: string, extraWhere?: SQL) {
  const conditions = [
    eq(familyChores.familyId, familyId),
    or(
      eq(familyChores.createdByMemberId, memberId),
      isNotNull(familyChoreAssignments.id)
    )!
  ];
  if (extraWhere) conditions.push(extraWhere);
  return baseChoreQuery(db)
    .leftJoin(familyChoreAssignments, and(
      eq(familyChoreAssignments.choreId, familyChores.id),
      eq(familyChoreAssignments.familyId, familyChores.familyId),
      eq(familyChoreAssignments.memberId, memberId)
    ))
    .where(and(...conditions))
    .orderBy(sql`${familyChores.dueAt} is null`, asc(familyChores.dueAt), desc(familyChores.createdAt));
}

async function myAssignmentByChore(db: Database, choreIds: string[], memberId: string) {
  if (choreIds.length === 0) return new Map<string, Date | null>();
  const rows = await db
    .select({ choreId: familyChoreAssignments.choreId, completedAt: familyChoreAssignments.completedAt })
    .from(familyChoreAssignments)
    .where(and(inArray(familyChoreAssignments.choreId, choreIds), eq(familyChoreAssignments.memberId, memberId)));
  return new Map(rows.map((row) => [row.choreId, row.completedAt]));
}

async function summarizeChores(db: Database, memberId: string, rows: ChoreRow[]) {
  if (rows.length === 0) return [];
  const choreIds = rows.map((row) => row.id);

  const [counts, myAssignments] = await Promise.all([
    db
      .select({
        choreId: familyChoreAssignments.choreId,
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(${familyChoreAssignments.completedAt})::int`
      })
      .from(familyChoreAssignments)
      .where(inArray(familyChoreAssignments.choreId, choreIds))
      .groupBy(familyChoreAssignments.choreId),
    myAssignmentByChore(db, choreIds, memberId)
  ]);
  const countsByChore = new Map(counts.map((row) => [row.choreId, row]));

  return rows.map((row) => {
    const count = countsByChore.get(row.id);
    const myCompletedAt = myAssignments.has(row.id) ? myAssignments.get(row.id) ?? null : null;
    return {
      id: row.id,
      familyId: row.familyId,
      title: row.title,
      dueAt: row.dueAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      isCreator: row.createdByMemberId === memberId,
      audience: audienceSummary(row),
      totalAssignees: count?.total ?? 0,
      completedAssignees: count?.completed ?? 0,
      isAssignedToMe: myAssignments.has(row.id),
      myCompletedAt
    };
  });
}

export async function listChores(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const rows = await selectVisibleChoreRows(db, familyId, membership.id);
  return summarizeChores(db, membership.id, rows);
}

const MAX_RECENT_COMPLETED_CHORE_ACTIVITY = 8;

async function assigneesByChoreId(db: Database, choreIds: string[]) {
  const assigneesByChore = new Map<string, { memberId: string; displayName: string; completedAt: Date | null }[]>();
  if (choreIds.length === 0) return assigneesByChore;
  const assigneeRows = await db
    .select({
      choreId: familyChoreAssignments.choreId,
      memberId: familyChoreAssignments.memberId,
      displayName: users.name,
      completedAt: familyChoreAssignments.completedAt
    })
    .from(familyChoreAssignments)
    .innerJoin(familyMembers, and(eq(familyChoreAssignments.memberId, familyMembers.id), eq(familyChoreAssignments.familyId, familyMembers.familyId)))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(inArray(familyChoreAssignments.choreId, choreIds))
    .orderBy(asc(users.name));
  for (const row of assigneeRows) {
    const list = assigneesByChore.get(row.choreId) ?? [];
    list.push({ memberId: row.memberId, displayName: row.displayName, completedAt: row.completedAt });
    assigneesByChore.set(row.choreId, list);
  }
  return assigneesByChore;
}

// A small, Family-Brain-specific read: the caller's visible, not-yet-fully-completed
// chores with actual assignee names and per-assignee done/pending state, in two queries
// (never one per chore). This is the one place Family Brain should read chore/task data
// from — never the older, single-assignee `family_tasks` (Plans) model. `isMe`/`createdByMe`
// are computed here (by member id, never by name matching) so the caller's own wording can
// distinguish "your" task from one you merely created for someone else.
export async function listChoresForBrainContext(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const rows = await selectVisibleChoreRows(db, familyId, membership.id);
  if (rows.length === 0) return [];

  const assigneesByChore = await assigneesByChoreId(db, rows.map((row) => row.id));

  return rows
    .map((row) => {
      const assignees = (assigneesByChore.get(row.id) ?? []).map((assignee) => ({
        displayName: assignee.displayName,
        completed: Boolean(assignee.completedAt),
        isMe: assignee.memberId === membership.id
      }));
      return {
        title: row.title,
        dueAt: row.dueAt,
        createdBy: row.createdBy.displayName,
        createdByMe: row.createdByMemberId === membership.id,
        assignees,
        completedCount: assignees.filter((assignee) => assignee.completed).length,
        totalCount: assignees.length
      };
    })
    .filter((chore) => chore.totalCount === 0 || chore.completedCount < chore.totalCount);
}

// The bounded companion to the above: recently *completed* individual assignments among
// the caller's visible chores (creator or assignee), newest first. Kept separate and small
// so answering "did James finish the chore I assigned him?" doesn't require dumping full
// chore history into every Family Brain request.
export async function listRecentlyCompletedChoreActivityForBrainContext(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const rows = await selectVisibleChoreRows(db, familyId, membership.id);
  if (rows.length === 0) return [];

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const assigneesByChore = await assigneesByChoreId(db, rows.map((row) => row.id));

  const completedAssignments: {
    choreTitle: string;
    createdBy: string;
    createdByMe: boolean;
    assigneeName: string;
    assigneeIsMe: boolean;
    completedAt: Date;
    totalCount: number;
    completedCount: number;
  }[] = [];

  for (const [choreId, assignees] of assigneesByChore) {
    const chore = rowsById.get(choreId);
    if (!chore) continue;
    const completedCount = assignees.filter((assignee) => assignee.completedAt).length;
    for (const assignee of assignees) {
      if (!assignee.completedAt) continue;
      completedAssignments.push({
        choreTitle: chore.title,
        createdBy: chore.createdBy.displayName,
        createdByMe: chore.createdByMemberId === membership.id,
        assigneeName: assignee.displayName,
        assigneeIsMe: assignee.memberId === membership.id,
        completedAt: assignee.completedAt,
        totalCount: assignees.length,
        completedCount
      });
    }
  }

  return completedAssignments
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
    .slice(0, MAX_RECENT_COMPLETED_CHORE_ACTIVITY);
}

const assigneeSelection = {
  memberId: familyMembers.id,
  displayName: users.name,
  avatar: users.image,
  completedAt: familyChoreAssignments.completedAt
};

async function selectAssignees(db: Database, choreId: string) {
  return db
    .select(assigneeSelection)
    .from(familyChoreAssignments)
    .innerJoin(familyMembers, and(eq(familyChoreAssignments.memberId, familyMembers.id), eq(familyChoreAssignments.familyId, familyMembers.familyId)))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(eq(familyChoreAssignments.choreId, choreId))
    .orderBy(asc(users.name));
}

async function requireEligibleChore(db: Database, userId: string, familyId: string, choreId: string) {
  assertUuid(choreId);
  const membership = await requireFamilyMembership(db, userId, familyId);
  const rows = await selectVisibleChoreRows(db, familyId, membership.id, eq(familyChores.id, choreId));
  const chore = rows[0];
  if (!chore) throw new ChoreServiceError('chore_not_found', 'Task not found.', 404);
  return { membership, chore };
}

export async function getChore(db: Database, userId: string, familyId: string, choreId: string) {
  const { membership, chore } = await requireEligibleChore(db, userId, familyId, choreId);
  const assignees = await selectAssignees(db, choreId);
  const mine = assignees.find((assignee) => assignee.memberId === membership.id);
  return {
    id: chore.id,
    familyId: chore.familyId,
    title: chore.title,
    description: chore.description,
    dueAt: chore.dueAt,
    createdAt: chore.createdAt,
    updatedAt: chore.updatedAt,
    createdBy: chore.createdBy,
    isCreator: chore.createdByMemberId === membership.id,
    audience: audienceSummary(chore),
    assignees,
    totalAssignees: assignees.length,
    completedAssignees: assignees.filter((assignee) => assignee.completedAt).length,
    isAssignedToMe: Boolean(mine),
    myCompletedAt: mine?.completedAt ?? null
  };
}

type ChoreInput = { title?: unknown; description?: unknown; dueAt?: unknown } & AudienceInput;

export async function createChore(db: Database, userId: string, familyId: string, input: ChoreInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const title = readTitle(input.title);
  const description = readDescription(input.description);
  const dueAt = readDueAt(input.dueAt);
  const audience = await resolveAudience(db, familyId, membership, input);

  const choreId = crypto.randomUUID();
  const choreInsert = db.insert(familyChores).values({
    id: choreId,
    familyId,
    createdByMemberId: membership.id,
    audienceType: audience.audienceType,
    householdId: audience.householdId,
    title,
    description,
    dueAt
  });
  const assignmentInsert = db.insert(familyChoreAssignments).values(
    audience.memberIds.map((memberId) => ({ familyId, choreId, memberId }))
  );
  await db.batch([choreInsert, assignmentInsert] as const);

  const chore = await getChore(db, userId, familyId, choreId);

  const recipients = recipientsExcluding(audience.memberIds, membership.id);
  await createNotifications(db, recipients.map((recipientMemberId) => ({
    familyId,
    recipientMemberId,
    actorMemberId: membership.id,
    type: 'task_assigned',
    title: `${chore.createdBy.displayName} assigned you a task: ${chore.title}`,
    entityType: 'chore',
    entityId: choreId,
    route: `/(family)/tasks/${choreId}`
  })));

  return chore;
}

type UpdateChoreInput = { title?: unknown; description?: unknown; dueAt?: unknown } & Partial<AudienceInput>;

export async function updateChore(db: Database, userId: string, familyId: string, choreId: string, input: UpdateChoreInput) {
  const { membership, chore } = await requireEligibleChore(db, userId, familyId, choreId);
  if (chore.createdByMemberId !== membership.id) {
    throw new ChoreServiceError('forbidden_chore_action', 'Only the task creator can edit it.', 403);
  }

  const title = input.title === undefined ? chore.title : readTitle(input.title);
  const description = input.description === undefined ? chore.description : readDescription(input.description);
  const dueAt = input.dueAt === undefined ? chore.dueAt : readDueAt(input.dueAt);

  let newMemberIds: string[] | null = null;
  let audienceType = chore.audienceType as AudienceType;
  let householdId = chore.householdId;
  if (input.audienceType !== undefined) {
    const audience = await resolveAudience(db, familyId, membership, input as AudienceInput);
    audienceType = audience.audienceType;
    householdId = audience.householdId;
    newMemberIds = audience.memberIds;
  }

  await db.update(familyChores).set({ title, description, dueAt, audienceType, householdId, updatedAt: new Date() })
    .where(and(eq(familyChores.id, choreId), eq(familyChores.familyId, familyId)));

  let newlyAssignedMemberIds: string[] = [];
  if (newMemberIds !== null) {
    const existing = await db.select({ memberId: familyChoreAssignments.memberId }).from(familyChoreAssignments)
      .where(eq(familyChoreAssignments.choreId, choreId));
    const existingIds = new Set(existing.map((row) => row.memberId));
    const nextIds = new Set(newMemberIds);
    const toRemove = [...existingIds].filter((id) => !nextIds.has(id));
    const toAdd = [...nextIds].filter((id) => !existingIds.has(id));
    newlyAssignedMemberIds = toAdd;

    if (toRemove.length) {
      await db.delete(familyChoreAssignments).where(and(
        eq(familyChoreAssignments.choreId, choreId),
        inArray(familyChoreAssignments.memberId, toRemove)
      ));
    }
    if (toAdd.length) {
      await db.insert(familyChoreAssignments).values(toAdd.map((memberId) => ({ familyId, choreId, memberId })));
    }
  }

  const updated = await getChore(db, userId, familyId, choreId);

  if (newlyAssignedMemberIds.length) {
    const recipients = recipientsExcluding(newlyAssignedMemberIds, membership.id);
    await createNotifications(db, recipients.map((recipientMemberId) => ({
      familyId,
      recipientMemberId,
      actorMemberId: membership.id,
      type: 'task_assigned',
      title: `${updated.createdBy.displayName} assigned you a task: ${updated.title}`,
      entityType: 'chore',
      entityId: choreId,
      route: `/(family)/tasks/${choreId}`
    })));
  }

  return updated;
}

export async function deleteChore(db: Database, userId: string, familyId: string, choreId: string) {
  const { membership, chore } = await requireEligibleChore(db, userId, familyId, choreId);
  if (chore.createdByMemberId !== membership.id) {
    throw new ChoreServiceError('forbidden_chore_action', 'Only the task creator can delete it.', 403);
  }
  // Assignment rows cascade-delete with the chore (family_chore_assignments_chore_family_fk).
  await db.delete(familyChores).where(and(eq(familyChores.id, choreId), eq(familyChores.familyId, familyId)));
}

// The WHERE clause (choreId + the CALLER's own membership.id) is the entire authorization
// check: a member can only ever change their own assignment row, never one addressed by an
// id supplied in the request body.
export async function setChoreCompletion(db: Database, userId: string, familyId: string, choreId: string, completed: unknown) {
  assertUuid(choreId);
  if (typeof completed !== 'boolean') throw new ChoreServiceError('invalid_chore', 'Choose whether this task is complete.');
  const membership = await requireFamilyMembership(db, userId, familyId);

  const updated = await db
    .update(familyChoreAssignments)
    .set({ completedAt: completed ? new Date() : null })
    .where(and(
      eq(familyChoreAssignments.choreId, choreId),
      eq(familyChoreAssignments.familyId, familyId),
      eq(familyChoreAssignments.memberId, membership.id)
    ))
    .returning({ id: familyChoreAssignments.id });

  // Same not-found response whether the task genuinely doesn't exist or the caller was
  // simply never assigned to it — neither case should be distinguishable to the caller.
  if (!updated[0]) throw new ChoreServiceError('not_assigned', 'That task could not be found.', 404);

  return getChore(db, userId, familyId, choreId);
}
