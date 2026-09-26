import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import {
  familyChoreAssignments,
  familyChores,
  familyCalendarEvents,
  householdMembers,
  familyPollVotes,
  familyPolls,
  familyShoppingLists,
  familyTasks,
  familyMembers,
  familyTimeCapsules
} from '@familyapp/db/schema';

import { selectVisibleCalendarRows } from './calendar-service';
import { createNotifications, type NotificationInput } from './notifications-service';

const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;
const CLOSING_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

function dayBounds(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, dateKey: start.toISOString().slice(0, 10) };
}

async function myHouseholdIds(db: Database, familyId: string, memberId: string) {
  const rows = await db.select({ householdId: householdMembers.householdId }).from(householdMembers)
    .where(and(eq(householdMembers.familyId, familyId), eq(householdMembers.familyMemberId, memberId)));
  return rows.map((row) => row.householdId);
}

/**
 * A request-driven, idempotent sweep for status/time-derived notifications (things that
 * become true just by the clock advancing, rather than by someone acting): a task going
 * overdue, an event landing on today, a poll's deadline approaching, a shopping trip being
 * today, a time capsule unlocking. It runs scoped to ONE member (the one currently loading
 * their notifications) rather than fanning out across the whole family, so its cost is
 * bounded per request; every other family member gets the same reminders the next time
 * their own client polls. Every notification here carries a deterministic dedupeKey, so
 * running this on every notifications-page load or sidebar badge poll is safe — repeat
 * inserts are silently dropped by the database's unique constraint, never duplicated.
 *
 * This deliberately reuses each feature's own eligibility rules (the calendar's
 * selectVisibleCalendarRows, the poll/shopping "family or my household" checks, a chore's
 * own assignment row) rather than re-deriving privacy logic here.
 */
export async function runNotificationSweep(db: Database, familyId: string, memberId: string) {
  const now = new Date();
  const entries: NotificationInput[] = [];

  const [choreEntries, planTaskEntries, calendarEntries, pollEntries, shoppingEntries, capsuleEntries] = await Promise.all([
    sweepChores(db, familyId, memberId, now),
    sweepPlanTasks(db, familyId, memberId, now),
    sweepCalendar(db, familyId, memberId, now),
    sweepPolls(db, familyId, memberId, now),
    sweepShopping(db, familyId, memberId, now),
    sweepCapsules(db, familyId, memberId, now)
  ]);
  entries.push(...choreEntries, ...planTaskEntries, ...calendarEntries, ...pollEntries, ...shoppingEntries, ...capsuleEntries);

  await createNotifications(db, entries);
}

async function sweepPlanTasks(db: Database, familyId: string, memberId: string, now: Date): Promise<NotificationInput[]> {
  const rows = await db.select({ id: familyTasks.id, title: familyTasks.title, dueAt: familyTasks.dueAt })
    .from(familyTasks)
    .where(and(
      eq(familyTasks.familyId, familyId),
      eq(familyTasks.assignedMemberId, memberId),
      isNull(familyTasks.completedAt)
    ));
  const entries: NotificationInput[] = [];
  for (const row of rows) {
    const dueDateKey = row.dueAt.toISOString().slice(0, 10);
    if (row.dueAt.getTime() <= now.getTime()) {
      entries.push({
        familyId,
        recipientMemberId: memberId,
        type: 'task_overdue',
        title: `"${row.title}" is overdue`,
        entityType: 'plan_task',
        entityId: row.id,
        route: '/(family)/plans',
        dedupeKey: `plan-task:${row.id}:overdue:${dueDateKey}:${memberId}`
      });
    } else if (row.dueAt.getTime() - now.getTime() <= DUE_SOON_WINDOW_MS) {
      entries.push({
        familyId,
        recipientMemberId: memberId,
        type: 'task_due_soon',
        title: `"${row.title}" is due soon`,
        entityType: 'plan_task',
        entityId: row.id,
        route: '/(family)/plans',
        dedupeKey: `plan-task:${row.id}:due-soon:${dueDateKey}:${memberId}`
      });
    }
  }
  return entries;
}

export async function runAllNotificationSweeps(db: Database) {
  const members = await db.select({ familyId: familyMembers.familyId, memberId: familyMembers.id }).from(familyMembers);
  const batchSize = 20;
  for (let index = 0; index < members.length; index += batchSize) {
    await Promise.allSettled(members.slice(index, index + batchSize).map((member) =>
      runNotificationSweep(db, member.familyId, member.memberId)
    ));
  }
}

async function sweepChores(db: Database, familyId: string, memberId: string, now: Date): Promise<NotificationInput[]> {
  const rows = await db
    .select({ choreId: familyChoreAssignments.choreId, title: familyChores.title, dueAt: familyChores.dueAt })
    .from(familyChoreAssignments)
    .innerJoin(familyChores, and(eq(familyChoreAssignments.choreId, familyChores.id), eq(familyChoreAssignments.familyId, familyChores.familyId)))
    .where(and(
      eq(familyChoreAssignments.familyId, familyId),
      eq(familyChoreAssignments.memberId, memberId),
      isNull(familyChoreAssignments.completedAt)
    ));

  const entries: NotificationInput[] = [];
  for (const row of rows) {
    if (!row.dueAt) continue;
    const dueDateKey = row.dueAt.toISOString().slice(0, 10);
    if (row.dueAt.getTime() <= now.getTime()) {
      entries.push({
        familyId,
        recipientMemberId: memberId,
        type: 'task_overdue',
        title: `"${row.title}" is overdue`,
        entityType: 'chore',
        entityId: row.choreId,
        route: `/(family)/tasks/${row.choreId}`,
        dedupeKey: `task:${row.choreId}:overdue:${dueDateKey}:${memberId}`
      });
    } else if (row.dueAt.getTime() - now.getTime() <= DUE_SOON_WINDOW_MS) {
      entries.push({
        familyId,
        recipientMemberId: memberId,
        type: 'task_due_soon',
        title: `"${row.title}" is due soon`,
        entityType: 'chore',
        entityId: row.choreId,
        route: `/(family)/tasks/${row.choreId}`,
        dedupeKey: `task:${row.choreId}:due-soon:${dueDateKey}:${memberId}`
      });
    }
  }
  return entries;
}

async function sweepCalendar(db: Database, familyId: string, memberId: string, now: Date): Promise<NotificationInput[]> {
  const { start, end, dateKey } = dayBounds(now);
  const rows = await selectVisibleCalendarRows(db, familyId, memberId, and(
    gte(familyCalendarEvents.startsAt, start),
    lte(familyCalendarEvents.startsAt, end)
  )!);

  return rows.map((row) => ({
    familyId,
    recipientMemberId: memberId,
    type: 'calendar_event_today',
    title: `"${row.title}" is today`,
    message: row.allDay ? 'All day' : row.startsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    entityType: 'calendar_event',
    entityId: row.id,
    route: '/(family)/calendar',
    dedupeKey: `event:${row.id}:today:${dateKey}:${memberId}`
  }));
}

async function sweepPolls(db: Database, familyId: string, memberId: string, now: Date): Promise<NotificationInput[]> {
  const householdIds = await myHouseholdIds(db, familyId, memberId);
  const eligibility = householdIds.length > 0
    ? or(isNull(familyPolls.householdId), inArray(familyPolls.householdId, householdIds))
    : isNull(familyPolls.householdId);

  const rows = await db
    .select({ id: familyPolls.id, question: familyPolls.question, closesAt: familyPolls.closesAt, closedAt: familyPolls.closedAt })
    .from(familyPolls)
    .where(and(eq(familyPolls.familyId, familyId), eligibility)!);

  const openRows = rows.filter((row) => !row.closedAt);
  if (openRows.length === 0) return [];

  const pollIds = openRows.map((row) => row.id);
  const myVotes = await db.select({ pollId: familyPollVotes.pollId }).from(familyPollVotes)
    .where(and(inArray(familyPollVotes.pollId, pollIds), eq(familyPollVotes.memberId, memberId)));
  const votedPollIds = new Set(myVotes.map((row) => row.pollId));

  const entries: NotificationInput[] = [];
  for (const row of openRows) {
    if (!row.closesAt) continue;
    if (row.closesAt.getTime() <= now.getTime()) {
      entries.push({
        familyId,
        recipientMemberId: memberId,
        type: 'poll_closed',
        title: `"${row.question}" has closed`,
        message: 'Results are ready to view.',
        entityType: 'poll',
        entityId: row.id,
        route: `/(family)/polls/${row.id}`,
        dedupeKey: `poll:${row.id}:closed:${memberId}`
      });
    } else if (!votedPollIds.has(row.id) && row.closesAt.getTime() - now.getTime() <= CLOSING_SOON_WINDOW_MS) {
      entries.push({
        familyId,
        recipientMemberId: memberId,
        type: 'poll_closing_soon',
        title: `"${row.question}" closes soon`,
        entityType: 'poll',
        entityId: row.id,
        route: `/(family)/polls/${row.id}`,
        dedupeKey: `poll:${row.id}:closing-soon:${row.closesAt.toISOString()}:${memberId}`
      });
    }
  }
  return entries;
}

async function sweepShopping(db: Database, familyId: string, memberId: string, now: Date): Promise<NotificationInput[]> {
  const { start, end, dateKey } = dayBounds(now);
  const householdIds = await myHouseholdIds(db, familyId, memberId);
  const eligibility = householdIds.length > 0
    ? or(isNull(familyShoppingLists.householdId), inArray(familyShoppingLists.householdId, householdIds))
    : isNull(familyShoppingLists.householdId);

  const rows = await db
    .select({ id: familyShoppingLists.id, name: familyShoppingLists.name })
    .from(familyShoppingLists)
    .where(and(
      eq(familyShoppingLists.familyId, familyId),
      isNull(familyShoppingLists.completedAt),
      gte(familyShoppingLists.shoppingDate, start),
      lte(familyShoppingLists.shoppingDate, end),
      eligibility
    )!);

  return rows.map((row) => ({
    familyId,
    recipientMemberId: memberId,
    type: 'shopping_list_today',
    title: `"${row.name}" is planned for today`,
    entityType: 'shopping_list',
    entityId: row.id,
    route: `/(family)/shopping/${row.id}`,
    dedupeKey: `shopping:${row.id}:shopping-day:${dateKey}:${memberId}`
  }));
}

async function sweepCapsules(db: Database, familyId: string, memberId: string, now: Date): Promise<NotificationInput[]> {
  // Whole-family, no household/member audience — every capsule is visible to every member
  // once unlocked, so no extra eligibility check is needed beyond family scoping.
  const rows = await db
    .select({ id: familyTimeCapsules.id, title: familyTimeCapsules.title })
    .from(familyTimeCapsules)
    .where(and(eq(familyTimeCapsules.familyId, familyId), lte(familyTimeCapsules.unlockAt, now)));

  return rows.map((row) => ({
    familyId,
    recipientMemberId: memberId,
    type: 'capsule_unlocked',
    title: `A time capsule is ready to open: "${row.title}"`,
    entityType: 'time_capsule',
    entityId: row.id,
    route: '/(family)/capsules',
    dedupeKey: `capsule:${row.id}:unlocked:${memberId}`
  }));
}
