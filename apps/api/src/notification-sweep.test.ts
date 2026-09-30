import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isNull } from 'drizzle-orm';

import { familyChoreAssignments, familyMembers, familyPolls, familyPollVotes } from '@familyapp/db/schema';

type NotificationEntry = { recipientMemberId: string; type: string; dedupeKey?: string | null };

const dependencies = vi.hoisted(() => ({
  createNotifications: vi.fn(async (_db: unknown, _entries: NotificationEntry[]) => undefined),
  selectVisibleCalendarRows: vi.fn(async () => [] as unknown[])
}));

vi.mock('./notifications-service', () => ({
  createNotifications: dependencies.createNotifications
}));
vi.mock('./calendar-service', () => ({
  selectVisibleCalendarRows: dependencies.selectVisibleCalendarRows
}));

const { runNotificationSweep, runAllNotificationSweeps } = await import('./notification-sweep');

const familyId = '11111111-1111-4111-8111-111111111111';
const assigneeMemberId = '22222222-2222-4222-8222-222222222222';
const creatorMemberId = '33333333-3333-4333-8333-333333333333';

type Row = Record<string, unknown>;

/** Every table this sweep touches resolves to an empty result unless overridden — a sweep
 * pass that isn't under test for a given table should see nothing and emit nothing. */
function fakeDb(overrides: Partial<Record<'choreAssignments' | 'polls' | 'pollVotes', Row[]>>) {
  const byTable = new Map<unknown, Row[]>([
    [familyChoreAssignments, overrides.choreAssignments ?? []],
    [familyPolls, overrides.polls ?? []],
    [familyPollVotes, overrides.pollVotes ?? []]
  ]);
  const chain = (rows: Row[]): any => ({
    from: (table: unknown) => chain(byTable.get(table) ?? []),
    innerJoin: () => chain(rows),
    leftJoin: () => chain(rows),
    where: () => chain(rows),
    orderBy: () => chain(rows),
    groupBy: () => chain(rows),
    limit: async () => rows,
    then: (resolve: (v: Row[]) => void, reject?: (e: unknown) => void) => Promise.resolve(rows).then(resolve, reject)
  });
  return { select: () => chain([]) };
}

function entriesFor(recipient: string) {
  const calls = dependencies.createNotifications.mock.calls as [unknown, NotificationEntry[]][];
  return calls.flatMap(([, entries]) => entries).filter((entry) => entry.recipientMemberId === recipient);
}

beforeEach(() => {
  dependencies.createNotifications.mockClear();
  dependencies.selectVisibleCalendarRows.mockReset();
  dependencies.selectVisibleCalendarRows.mockResolvedValue([]);
});

describe('sweepChores (Tasks)', () => {
  it('notifies the assignee overdue and the creator missed, exactly once each, when the deadline has passed', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const db = fakeDb({
      choreAssignments: [{ choreId: 'chore-1', title: 'Dishes', dueAt: past, createdByMemberId: creatorMemberId }]
    });

    await runNotificationSweep(db as never, familyId, assigneeMemberId);

    const assigneeEntries = entriesFor(assigneeMemberId);
    const creatorEntries = entriesFor(creatorMemberId);
    expect(assigneeEntries.filter((e) => e.type === 'task_overdue')).toHaveLength(1);
    expect(creatorEntries.filter((e) => e.type === 'task_missed')).toHaveLength(1);
    expect(assigneeEntries[0].dedupeKey).not.toBe(creatorEntries[0].dedupeKey);
  });

  it('does not double-notify a self-assigned task creator', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const db = fakeDb({
      choreAssignments: [{ choreId: 'chore-1', title: 'Dishes', dueAt: past, createdByMemberId: assigneeMemberId }]
    });

    await runNotificationSweep(db as never, familyId, assigneeMemberId);

    const all = dependencies.createNotifications.mock.calls.flatMap(([, entries]) => entries as NotificationEntry[]);
    expect(all.filter((e) => e.type === 'task_overdue' || e.type === 'task_missed')).toHaveLength(1);
  });

  it('only reminds the assignee (never the creator) while a task is merely due soon', async () => {
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    const db = fakeDb({
      choreAssignments: [{ choreId: 'chore-1', title: 'Dishes', dueAt: soon, createdByMemberId: creatorMemberId }]
    });

    await runNotificationSweep(db as never, familyId, assigneeMemberId);

    expect(entriesFor(assigneeMemberId).map((e) => e.type)).toEqual(['task_due_soon']);
    expect(entriesFor(creatorMemberId)).toHaveLength(0);
  });

  it('produces identical dedupe keys across repeated sweeps of the same overdue task (idempotent)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
    const past = new Date('2026-01-01T00:00:00Z');
    const db = fakeDb({
      choreAssignments: [{ choreId: 'chore-1', title: 'Dishes', dueAt: past, createdByMemberId: creatorMemberId }]
    });

    await runNotificationSweep(db as never, familyId, assigneeMemberId);
    await runNotificationSweep(db as never, familyId, assigneeMemberId);
    vi.useRealTimers();

    const [firstCall, secondCall] = dependencies.createNotifications.mock.calls as [unknown, NotificationEntry[]][];
    expect(firstCall[1].map((e) => e.dedupeKey).sort()).toEqual(secondCall[1].map((e) => e.dedupeKey).sort());
  });

  it('a completed assignment (already excluded by the real query) produces no reminders', async () => {
    const db = fakeDb({ choreAssignments: [] });
    await runNotificationSweep(db as never, familyId, assigneeMemberId);
    expect(entriesFor(assigneeMemberId)).toHaveLength(0);
    expect(entriesFor(creatorMemberId)).toHaveLength(0);
  });

  it('a chore with no deadline never generates a due-soon or overdue reminder', async () => {
    const db = fakeDb({
      choreAssignments: [{ choreId: 'chore-1', title: 'Someday', dueAt: null, createdByMemberId: creatorMemberId }]
    });
    await runNotificationSweep(db as never, familyId, assigneeMemberId);
    expect(entriesFor(assigneeMemberId)).toHaveLength(0);
  });
});

describe('sweepCalendar (Events)', () => {
  it('sends an upcoming reminder for an event starting within 24 hours', async () => {
    const startsAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
    dependencies.selectVisibleCalendarRows.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 'event-1', title: 'Soccer practice', startsAt, allDay: false }
    ]);

    const db = fakeDb({});
    await runNotificationSweep(db as never, familyId, assigneeMemberId);

    const entries = entriesFor(assigneeMemberId).filter((e) => e.type === 'calendar_event_upcoming');
    expect(entries).toHaveLength(1);
    expect(entries[0].dedupeKey).toContain(startsAt.toISOString());
  });

  it('sends a day-of reminder for an event happening today', async () => {
    dependencies.selectVisibleCalendarRows.mockResolvedValueOnce([
      { id: 'event-1', title: 'Soccer practice', startsAt: new Date(), allDay: false }
    ]).mockResolvedValueOnce([]);

    const db = fakeDb({});
    await runNotificationSweep(db as never, familyId, assigneeMemberId);

    expect(entriesFor(assigneeMemberId).map((e) => e.type)).toContain('calendar_event_today');
  });

  it('rescheduling an event to a new time produces a fresh dedupe key rather than reusing the old one', async () => {
    const originalStart = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const reschedule = new Date(Date.now() + 12 * 60 * 60 * 1000);

    dependencies.selectVisibleCalendarRows.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 'event-1', title: 'Soccer practice', startsAt: originalStart, allDay: false }
    ]);
    await runNotificationSweep(fakeDb({}) as never, familyId, assigneeMemberId);
    const firstKey = entriesFor(assigneeMemberId).find((e) => e.type === 'calendar_event_upcoming')?.dedupeKey;

    dependencies.createNotifications.mockClear();
    dependencies.selectVisibleCalendarRows.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 'event-1', title: 'Soccer practice', startsAt: reschedule, allDay: false }
    ]);
    await runNotificationSweep(fakeDb({}) as never, familyId, assigneeMemberId);
    const secondKey = entriesFor(assigneeMemberId).find((e) => e.type === 'calendar_event_upcoming')?.dedupeKey;

    expect(firstKey).not.toBe(secondKey);
  });

  it('a deleted or past event (absent from the eligibility query) produces no reminders', async () => {
    dependencies.selectVisibleCalendarRows.mockResolvedValue([]);
    const db = fakeDb({});
    await runNotificationSweep(db as never, familyId, assigneeMemberId);
    expect(entriesFor(assigneeMemberId).filter((e) => e.type.startsWith('calendar_event'))).toHaveLength(0);
  });
});

describe('sweepPolls (Polls)', () => {
  it('reminds an eligible member who has not voted as the poll approaches its close', async () => {
    const closesAt = new Date(Date.now() + 60 * 60 * 1000);
    const db = fakeDb({
      polls: [{ id: 'poll-1', question: 'Pizza toppings?', closesAt, closedAt: null }],
      pollVotes: []
    });
    await runNotificationSweep(db as never, familyId, assigneeMemberId);
    expect(entriesFor(assigneeMemberId).map((e) => e.type)).toEqual(['poll_closing_soon']);
  });

  it('does not remind a member who has already voted', async () => {
    const closesAt = new Date(Date.now() + 60 * 60 * 1000);
    const db = fakeDb({
      polls: [{ id: 'poll-1', question: 'Pizza toppings?', closesAt, closedAt: null }],
      pollVotes: [{ pollId: 'poll-1' }]
    });
    await runNotificationSweep(db as never, familyId, assigneeMemberId);
    expect(entriesFor(assigneeMemberId)).toHaveLength(0);
  });

  it('a manually closed poll never produces an approaching-deadline reminder, even if closesAt is still in the future', async () => {
    const closesAt = new Date(Date.now() + 60 * 60 * 1000);
    const db = fakeDb({
      polls: [{ id: 'poll-1', question: 'Pizza toppings?', closesAt, closedAt: new Date() }],
      pollVotes: []
    });
    await runNotificationSweep(db as never, familyId, assigneeMemberId);
    expect(entriesFor(assigneeMemberId).filter((e) => e.type === 'poll_closing_soon')).toHaveLength(0);
  });

  it('an expired (closesAt passed) poll produces a one-time closed notification, not closing-soon', async () => {
    const closesAt = new Date(Date.now() - 60 * 60 * 1000);
    const db = fakeDb({
      polls: [{ id: 'poll-1', question: 'Pizza toppings?', closesAt, closedAt: null }],
      pollVotes: []
    });
    await runNotificationSweep(db as never, familyId, assigneeMemberId);
    expect(entriesFor(assigneeMemberId).map((e) => e.type)).toEqual(['poll_closed']);
  });
});

describe('runAllNotificationSweeps member eligibility', () => {
  it('queries the membership roster with a filter that references familyMembers.leftAt (inactive members excluded)', async () => {
    let capturedCondition: unknown;
    const db = {
      select: () => ({
        from: () => ({
          where: (condition: unknown) => {
            capturedCondition = condition;
            return Promise.resolve([]);
          }
        })
      })
    };

    await runAllNotificationSweeps(db as never);

    // Recursively search the captured Drizzle condition for the exact leftAt column
    // reference, rather than trying to re-derive/parse its SQL — this fails if the filter
    // is ever removed or swapped for an unrelated column, without depending on Drizzle's
    // internal object shape beyond "it's a plain nested structure".
    function references(value: unknown, seen = new Set<unknown>()): boolean {
      if (value === familyMembers.leftAt) return true;
      if (!value || typeof value !== 'object' || seen.has(value)) return false;
      seen.add(value);
      return Object.values(value as object).some((child) => references(child, seen));
    }
    expect(references(capturedCondition)).toBe(true);
    // Sanity check against a fresh equivalent condition built the same way as the source.
    expect(references(isNull(familyMembers.leftAt))).toBe(true);
  });
});
