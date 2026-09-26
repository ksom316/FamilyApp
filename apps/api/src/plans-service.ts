import { and, asc, eq, gte, sql } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { familyEvents, familyMembers, familyTasks, users } from '@familyapp/db/schema';

import { requireFamilyMembership } from './family-service';

export type PlanErrorCode = 'invalid_plan' | 'plan_not_found' | 'forbidden_plan_action' | 'invalid_assignee';

export class PlanServiceError extends Error {
  constructor(public readonly code: PlanErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'PlanServiceError';
  }
}

type EventInput = { title?: unknown; description?: unknown; startsAt?: unknown; endsAt?: unknown };
type TaskInput = { title?: unknown; description?: unknown; dueAt?: unknown; assignedMemberId?: unknown };

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new PlanServiceError('invalid_plan', 'The plan identifier is not valid.');
  }
}

function readTitle(value: unknown) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 140) {
    throw new PlanServiceError('invalid_plan', 'Title must be between 1 and 140 characters.');
  }
  return value.trim();
}

function readDescription(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 2000) {
    throw new PlanServiceError('invalid_plan', 'Description must be 2,000 characters or fewer.');
  }
  return value.trim() || null;
}

function readDate(value: unknown, label: string, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string') throw new PlanServiceError('invalid_plan', `${label} is required.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new PlanServiceError('invalid_plan', `${label} is not a valid date and time.`);
  return date;
}

function readEventInput(input: EventInput) {
  const startsAt = readDate(input.startsAt, 'Start date and time') as Date;
  const endsAt = readDate(input.endsAt, 'End date and time', true);
  if (endsAt && endsAt < startsAt) throw new PlanServiceError('invalid_plan', 'End time must be after the start time.');
  return { title: readTitle(input.title), description: readDescription(input.description), startsAt, endsAt };
}

async function readTaskInput(db: Database, familyId: string, input: TaskInput) {
  let assignedMemberId: string | null = null;
  if (input.assignedMemberId !== undefined && input.assignedMemberId !== null && input.assignedMemberId !== '') {
    if (typeof input.assignedMemberId !== 'string') throw new PlanServiceError('invalid_assignee', 'Choose a valid family member.');
    assertUuid(input.assignedMemberId);
    const [assignee] = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(and(eq(familyMembers.id, input.assignedMemberId), eq(familyMembers.familyId, familyId)))
      .limit(1);
    if (!assignee) throw new PlanServiceError('invalid_assignee', 'The assigned person must belong to this family.');
    assignedMemberId = assignee.id;
  }
  return {
    title: readTitle(input.title),
    description: readDescription(input.description),
    dueAt: readDate(input.dueAt, 'Due date and time') as Date,
    assignedMemberId
  };
}

function canManage(role: 'owner' | 'guardian' | 'member', membershipId: string, creatorId: string) {
  return role === 'owner' || role === 'guardian' || membershipId === creatorId;
}

export async function listPlans(db: Database, userId: string, familyId: string) {
  await requireFamilyMembership(db, userId, familyId);
  const now = new Date();
  const [events, tasks, members] = await Promise.all([
    db.select().from(familyEvents).where(and(eq(familyEvents.familyId, familyId), gte(familyEvents.startsAt, now))).orderBy(asc(familyEvents.startsAt)),
    db.select().from(familyTasks).where(eq(familyTasks.familyId, familyId)).orderBy(sql`${familyTasks.completedAt} is not null`, asc(familyTasks.dueAt)),
    db
      .select({
        id: familyMembers.id,
        displayName: users.name,
        avatar: users.image,
        identityType: users.identityType,
        avatarConfig: users.avatarConfig,
        hasPhoto: sql<boolean>`${users.photoObjectKey} is not null`
      })
      .from(familyMembers)
      .innerJoin(users, eq(familyMembers.userId, users.id))
      .where(eq(familyMembers.familyId, familyId))
  ]);
  const people = new Map(members.map((member) => [member.id, {
    memberId: member.id,
    displayName: member.displayName,
    avatar: member.avatar,
    identityType: member.identityType,
    avatarConfig: member.avatarConfig,
    hasPhoto: member.hasPhoto
  }]));
  return {
    events: events.map((event) => ({ ...event, createdBy: people.get(event.createdByMemberId)! })),
    tasks: tasks.map((task) => ({
      ...task,
      createdBy: people.get(task.createdByMemberId)!,
      assignedTo: task.assignedMemberId ? people.get(task.assignedMemberId) ?? null : null
    }))
  };
}

export async function createEvent(db: Database, userId: string, familyId: string, input: EventInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const values = readEventInput(input);
  const [event] = await db.insert(familyEvents).values({ ...values, familyId, createdByMemberId: membership.id }).returning();
  if (!event) throw new Error('Event creation did not return the created record.');
  return event;
}

export async function updateEvent(db: Database, userId: string, familyId: string, eventId: string, input: EventInput) {
  assertUuid(eventId);
  const membership = await requireFamilyMembership(db, userId, familyId);
  const [existing] = await db.select().from(familyEvents).where(and(eq(familyEvents.id, eventId), eq(familyEvents.familyId, familyId))).limit(1);
  if (!existing) throw new PlanServiceError('plan_not_found', 'Event not found.', 404);
  if (!canManage(membership.role, membership.id, existing.createdByMemberId)) throw new PlanServiceError('forbidden_plan_action', 'You cannot edit this event.', 403);
  const [event] = await db.update(familyEvents).set({ ...readEventInput(input), updatedAt: new Date() }).where(and(eq(familyEvents.id, eventId), eq(familyEvents.familyId, familyId))).returning();
  return event!;
}

export async function deleteEvent(db: Database, userId: string, familyId: string, eventId: string) {
  assertUuid(eventId);
  const membership = await requireFamilyMembership(db, userId, familyId);
  const [existing] = await db.select().from(familyEvents).where(and(eq(familyEvents.id, eventId), eq(familyEvents.familyId, familyId))).limit(1);
  if (!existing) throw new PlanServiceError('plan_not_found', 'Event not found.', 404);
  if (!canManage(membership.role, membership.id, existing.createdByMemberId)) throw new PlanServiceError('forbidden_plan_action', 'You cannot delete this event.', 403);
  await db.delete(familyEvents).where(and(eq(familyEvents.id, eventId), eq(familyEvents.familyId, familyId)));
}

export async function createTask(db: Database, userId: string, familyId: string, input: TaskInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const values = await readTaskInput(db, familyId, input);
  const [task] = await db.insert(familyTasks).values({ ...values, familyId, createdByMemberId: membership.id }).returning();
  if (!task) throw new Error('Task creation did not return the created record.');
  return task;
}

export async function updateTask(db: Database, userId: string, familyId: string, taskId: string, input: TaskInput) {
  assertUuid(taskId);
  const membership = await requireFamilyMembership(db, userId, familyId);
  const [existing] = await db.select().from(familyTasks).where(and(eq(familyTasks.id, taskId), eq(familyTasks.familyId, familyId))).limit(1);
  if (!existing) throw new PlanServiceError('plan_not_found', 'Task not found.', 404);
  if (!canManage(membership.role, membership.id, existing.createdByMemberId)) throw new PlanServiceError('forbidden_plan_action', 'You cannot edit this task.', 403);
  const [task] = await db.update(familyTasks).set({ ...await readTaskInput(db, familyId, input), updatedAt: new Date() }).where(and(eq(familyTasks.id, taskId), eq(familyTasks.familyId, familyId))).returning();
  return task!;
}

export async function deleteTask(db: Database, userId: string, familyId: string, taskId: string) {
  assertUuid(taskId);
  const membership = await requireFamilyMembership(db, userId, familyId);
  const [existing] = await db.select().from(familyTasks).where(and(eq(familyTasks.id, taskId), eq(familyTasks.familyId, familyId))).limit(1);
  if (!existing) throw new PlanServiceError('plan_not_found', 'Task not found.', 404);
  if (!canManage(membership.role, membership.id, existing.createdByMemberId)) throw new PlanServiceError('forbidden_plan_action', 'You cannot delete this task.', 403);
  await db.delete(familyTasks).where(and(eq(familyTasks.id, taskId), eq(familyTasks.familyId, familyId)));
}

export async function setTaskCompletion(db: Database, userId: string, familyId: string, taskId: string, completed: unknown) {
  assertUuid(taskId);
  if (typeof completed !== 'boolean') throw new PlanServiceError('invalid_plan', 'Completed must be true or false.');
  const membership = await requireFamilyMembership(db, userId, familyId);
  const [task] = await db.select().from(familyTasks).where(and(eq(familyTasks.id, taskId), eq(familyTasks.familyId, familyId))).limit(1);
  if (!task) throw new PlanServiceError('plan_not_found', 'Task not found.', 404);
  const permitted = canManage(membership.role, membership.id, task.createdByMemberId) || membership.id === task.assignedMemberId;
  if (!permitted) throw new PlanServiceError('forbidden_plan_action', 'You cannot change this task’s completion state.', 403);
  const [updated] = await db.update(familyTasks).set({ completedAt: completed ? new Date() : null, updatedAt: new Date() }).where(and(eq(familyTasks.id, taskId), eq(familyTasks.familyId, familyId))).returning();
  return updated!;
}
