import { beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  membership: vi.fn(),
  createNotifications: vi.fn(async () => undefined),
  familyMemberIds: vi.fn(async () => [] as string[]),
  householdMemberIds: vi.fn(async () => [] as string[]),
  recipientsExcluding: (memberIds: string[], actorId: string) => [...new Set(memberIds)].filter((id) => id !== actorId)
}));

vi.mock('./family-service', () => ({ requireFamilyMembership: dependencies.membership }));
vi.mock('./notifications-service', () => ({
  createNotifications: dependencies.createNotifications,
  familyMemberIds: dependencies.familyMemberIds,
  householdMemberIds: dependencies.householdMemberIds,
  recipientsExcluding: dependencies.recipientsExcluding
}));

const { setChoreCompletion, deriveChoreStatus, ChoreServiceError } = await import('./chores-service');

const familyId = '11111111-1111-4111-8111-111111111111';
const choreId = '22222222-2222-4222-8222-222222222222';
const assigneeUserId = 'assignee-user';
const assigneeMemberId = '33333333-3333-4333-8333-333333333333';
const creatorMemberId = '44444444-4444-4444-8444-444444444444';

type Row = Record<string, unknown>;

/** A queue-based fake db: each call to select()/update() consumes the next canned response,
 * in the exact order setChoreCompletion -> getChore -> selectAssignees issues them. */
function fakeDb(selectQueue: Row[][], updateQueue: Row[][] = []) {
  let selectIndex = 0;
  let updateIndex = 0;
  const chain = (rows: Row[]): any => ({
    from: () => chain(rows),
    innerJoin: () => chain(rows),
    leftJoin: () => chain(rows),
    where: () => chain(rows),
    orderBy: () => chain(rows),
    groupBy: () => chain(rows),
    limit: async () => rows,
    returning: async () => rows,
    then: (resolve: (v: Row[]) => void, reject?: (e: unknown) => void) => Promise.resolve(rows).then(resolve, reject)
  });
  return {
    select: () => chain(selectQueue[selectIndex++] ?? []),
    update: () => ({ set: () => chain(updateQueue[updateIndex++] ?? []) })
  };
}

const choreDetailRow = (dueAt: Date | null): Row => ({
  id: choreId,
  familyId,
  title: 'Take out the trash',
  description: null,
  dueAt,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  createdByMemberId: creatorMemberId,
  audienceType: 'members',
  householdId: null,
  householdName: null,
  createdBy: { memberId: creatorMemberId, displayName: 'Creator', avatar: null, identityType: 'adult', avatarConfig: null, hasPhoto: false }
});

const assigneeRow = (completedAt: Date | null): Row => ({
  memberId: assigneeMemberId,
  displayName: 'Assignee',
  avatar: null,
  identityType: 'adult',
  avatarConfig: null,
  hasPhoto: false,
  completedAt
});

beforeEach(() => {
  dependencies.membership.mockReset();
  dependencies.membership.mockResolvedValue({ id: assigneeMemberId, role: 'member' });
  dependencies.createNotifications.mockClear();
});

describe('deriveChoreStatus', () => {
  it('is completed whenever completedAt is set, regardless of the deadline', () => {
    expect(deriveChoreStatus(new Date('2020-01-01'), new Date('2026-01-01'))).toBe('completed');
    expect(deriveChoreStatus(null, new Date('2026-01-01'))).toBe('completed');
  });

  it('is overdue once the deadline has passed and nothing is completed', () => {
    const now = new Date('2026-06-01T12:00:00Z');
    expect(deriveChoreStatus(new Date('2026-06-01T11:59:59Z'), null, now)).toBe('overdue');
    // The exact deadline instant itself counts as overdue (a <= boundary, not <).
    expect(deriveChoreStatus(new Date('2026-06-01T12:00:00Z'), null, now)).toBe('overdue');
  });

  it('is pending with no deadline, or a deadline that has not arrived yet', () => {
    const now = new Date('2026-06-01T12:00:00Z');
    expect(deriveChoreStatus(null, null, now)).toBe('pending');
    expect(deriveChoreStatus(new Date('2026-06-01T12:00:01Z'), null, now)).toBe('pending');
  });
});

describe('setChoreCompletion deadline enforcement', () => {
  it('allows completing a task before its deadline', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const db = fakeDb(
      [[{ completedAt: null, dueAt: future }], [choreDetailRow(future)], [assigneeRow(new Date())]],
      [[{ id: 'assignment-1' }]]
    );

    const result = await setChoreCompletion(db as never, assigneeUserId, familyId, choreId, true);
    expect(result.id).toBe(choreId);
  });

  it('rejects completing an incomplete task once its deadline has passed', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const db = fakeDb([[{ completedAt: null, dueAt: past }]]);

    await expect(setChoreCompletion(db as never, assigneeUserId, familyId, choreId, true))
      .rejects.toMatchObject({ code: 'deadline_passed', status: 409 });
  });

  it('rejects completion at the exact deadline instant (an equal-time boundary counts as passed)', async () => {
    const now = new Date();
    const db = fakeDb([[{ completedAt: null, dueAt: now }]]);

    await expect(setChoreCompletion(db as never, assigneeUserId, familyId, choreId, true))
      .rejects.toBeInstanceOf(ChoreServiceError);
  });

  it('still allows un-completing a task after its deadline has passed', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    // completed=false never reads the deadline-check row at all — no select queued for it.
    const db = fakeDb(
      [[choreDetailRow(past)], [assigneeRow(null)]],
      [[{ id: 'assignment-1' }]]
    );

    const result = await setChoreCompletion(db as never, assigneeUserId, familyId, choreId, false);
    expect(result.id).toBe(choreId);
  });

  it('treats re-marking an already-completed task as a no-op success, even past its deadline', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const alreadyCompletedAt = new Date(Date.now() - 30 * 60 * 1000);
    const db = fakeDb(
      [[{ completedAt: alreadyCompletedAt, dueAt: past }], [choreDetailRow(past)], [assigneeRow(alreadyCompletedAt)]],
      [[{ id: 'assignment-1' }]]
    );

    const result = await setChoreCompletion(db as never, assigneeUserId, familyId, choreId, true);
    expect(result.id).toBe(choreId);
  });

  it('never calls update when the deadline check rejects the request', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const db = fakeDb([[{ completedAt: null, dueAt: past }]]);
    const updateSpy = vi.spyOn(db, 'update');

    await expect(setChoreCompletion(db as never, assigneeUserId, familyId, choreId, true)).rejects.toThrow();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('reports not_assigned when the caller has no assignment row on this chore', async () => {
    const db = fakeDb([[]]);
    await expect(setChoreCompletion(db as never, assigneeUserId, familyId, choreId, true))
      .rejects.toMatchObject({ code: 'not_assigned', status: 404 });
  });

  it('a task with no deadline can always be completed', async () => {
    const db = fakeDb(
      [[{ completedAt: null, dueAt: null }], [choreDetailRow(null)], [assigneeRow(new Date())]],
      [[{ id: 'assignment-1' }]]
    );
    const result = await setChoreCompletion(db as never, assigneeUserId, familyId, choreId, true);
    expect(result.id).toBe(choreId);
  });
});
