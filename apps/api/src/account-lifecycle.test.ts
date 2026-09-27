import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  families,
  familyFindMeRequests,
  familyLocationShares,
  familyMembers,
  householdMembers
} from '@familyapp/db/schema';

import { canRemoveFamilyMember, ownerBlockedFromLeaving, shouldTeardownFamily } from './family-service';

type NotificationEntry = { recipientMemberId: string; type: string; title: string };
const createNotificationsMock = vi.fn(async (_db: unknown, _entries: NotificationEntry[]) => {});
vi.mock('./notifications-service', () => ({ createNotifications: createNotificationsMock }));

// Imported after the mock is registered so leaveFamily's dynamic
// `await import('./notifications-service')` resolves to the mocked module.
const { leaveFamily, removeFamilyMember, requireFamilyMembership } = await import('./family-service');
const { deleteAccount, AccountServiceError } = await import('./account-service');

const OWNER = { id: '11111111-1111-4111-8111-111111111111', role: 'owner' as const };
const GUARDIAN = { id: '22222222-2222-4222-8222-222222222222', role: 'guardian' as const };
const SECOND_GUARDIAN = { id: '66666666-6666-4666-8666-666666666666', role: 'guardian' as const };
const MEMBER = { id: '33333333-3333-4333-8333-333333333333', role: 'member' as const };
const BYSTANDER = { id: '77777777-7777-4777-8777-777777777777', role: 'member' as const };
const FAMILY_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';

type FakeRow = Record<string, unknown>;

/**
 * A minimal, call-order-based stand-in for the Drizzle query builder — not a general
 * Drizzle mock. It only supports exactly the chain shapes leaveFamily/deleteAccount issue,
 * returning pre-scripted rows per statement type in the order the real functions call
 * them. This mirrors the same "capture what was passed" style push-notifications.test.ts
 * already uses, extended just enough to drive these two functions end to end.
 */
function createFakeDb(options: { selectResults: FakeRow[][]; updateResults?: FakeRow[][] }) {
  const selectQueue = [...options.selectResults];
  const updateQueue = [...(options.updateResults ?? [])];
  const calls = { updates: [] as { table: unknown; values: FakeRow }[], deletes: [] as unknown[] };

  function queryResult(rows: FakeRow[] = []) {
    return {
      returning: () => Promise.resolve(updateQueue.shift() ?? [{ id: 'updated' }]),
      then: (resolve: (value: FakeRow[]) => void) => resolve(rows)
    };
  }

  function selectChain() {
    const next = () => selectQueue.shift() ?? [];
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      limit: () => next(),
      then: (resolve: (rows: FakeRow[]) => void) => resolve(next())
    };
    return chain;
  }

  return {
    select: () => selectChain(),
    update: (table: unknown) => ({
      set: (values: FakeRow) => {
        calls.updates.push({ table, values });
        return { where: () => queryResult() };
      }
    }),
    delete: (table: unknown) => {
      calls.deletes.push(table);
      return { where: () => queryResult() };
    },
    batch: async (queries: PromiseLike<unknown>[]) => Promise.all(queries),
    __calls: calls
  };
}

function createFakeStorage() {
  return {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    deletePrefix: vi.fn(async () => 2)
  };
}

beforeEach(() => {
  createNotificationsMock.mockClear();
});

describe('owner-safety invariant (pure, no database)', () => {
  it('blocks an owner from leaving while other active members remain', () => {
    expect(ownerBlockedFromLeaving('owner', 2)).toBe(true);
    expect(ownerBlockedFromLeaving('owner', 0)).toBe(false);
    expect(ownerBlockedFromLeaving('guardian', 5)).toBe(false);
    expect(ownerBlockedFromLeaving('member', 5)).toBe(false);
  });

  it('tears the family down only once nobody else is active', () => {
    expect(shouldTeardownFamily(0)).toBe(true);
    expect(shouldTeardownFamily(1)).toBe(false);
  });
});

describe('leaveFamily — normal departure (other active members remain)', () => {
  it('notifies exactly the remaining members, never the leaver, and marks the row left rather than deleting it', async () => {
    const db = createFakeDb({
      selectResults: [
        [{ id: MEMBER.id, role: MEMBER.role }], // requireFamilyMembership
        [{ id: GUARDIAN.id }, { id: OWNER.id }], // other active members (the leaver is never in this list)
        [{ displayName: 'Kwaku' }] // leaver's display name for the notification title
      ]
    });

    const result = await leaveFamily(db as never, USER_ID, FAMILY_ID);

    expect(result).toEqual({ familyDeleted: false });
    // The membership row is updated (leftAt set), never deleted — every other content
    // table's RESTRICT-guarded creator/sender/assignee FK depends on this row surviving.
    expect(db.__calls.deletes).not.toContain(families); // the family itself is never torn down here
    expect(db.__calls.updates[0]?.values).toHaveProperty('leftAt');

    expect(createNotificationsMock).toHaveBeenCalledTimes(1);
    const entries = createNotificationsMock.mock.calls[0]?.[1] ?? [];
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.recipientMemberId).sort()).toEqual([GUARDIAN.id, OWNER.id].sort());
    expect(entries.every((entry) => entry.recipientMemberId !== MEMBER.id)).toBe(true);
    expect(entries.every((entry) => entry.type === 'member_left')).toBe(true);
    expect(entries[0]?.title).toContain('Kwaku');
    expect(entries[0]?.title).toContain('left the family');
  });
});

describe('leaveFamily — owner safety', () => {
  it('refuses to let the owner leave while others remain, without touching anything', async () => {
    const db = createFakeDb({
      selectResults: [
        [{ id: OWNER.id, role: OWNER.role }],
        [{ id: GUARDIAN.id }]
      ]
    });

    await expect(leaveFamily(db as never, USER_ID, FAMILY_ID)).rejects.toMatchObject({ code: 'owner_must_transfer' });
    expect(db.__calls.updates).toHaveLength(0);
    expect(db.__calls.deletes).toHaveLength(0);
    expect(createNotificationsMock).not.toHaveBeenCalled();
  });

  it('lets the sole remaining active member (necessarily the owner) leave by tearing the whole family down', async () => {
    const db = createFakeDb({
      selectResults: [
        [{ id: OWNER.id, role: OWNER.role }],
        [] // no other active members
      ]
    });

    const storage = createFakeStorage();
    const result = await leaveFamily(db as never, USER_ID, FAMILY_ID, storage);

    expect(result).toEqual({ familyDeleted: true });
    expect(storage.deletePrefix).toHaveBeenCalledWith(`families/${FAMILY_ID}/`);
    expect(db.__calls.deletes).toHaveLength(1); // one DELETE FROM families — cascades everything
    expect(createNotificationsMock).not.toHaveBeenCalled(); // nobody left to notify
  });
});

describe('leaveFamily — repeated/stale requests', () => {
  it('rejects a second leave attempt safely instead of double-processing it', async () => {
    // requireFamilyMembership's own WHERE already excludes a row whose leftAt is set, so a
    // stale/repeated call simply finds no active membership.
    const db = createFakeDb({ selectResults: [[]] });
    await expect(leaveFamily(db as never, USER_ID, FAMILY_ID)).rejects.toMatchObject({ code: 'not_a_member' });
    expect(createNotificationsMock).not.toHaveBeenCalled();
  });
});

describe('family member removal permissions', () => {
  it('allows owners to remove members and guardians', () => {
    expect(canRemoveFamilyMember('owner', 'member')).toBe(true);
    expect(canRemoveFamilyMember('owner', 'guardian')).toBe(true);
  });

  it('allows guardians to remove only ordinary members', () => {
    expect(canRemoveFamilyMember('guardian', 'member')).toBe(true);
    expect(canRemoveFamilyMember('guardian', 'guardian')).toBe(false);
    expect(canRemoveFamilyMember('guardian', 'owner')).toBe(false);
  });

  it('prevents ordinary members from removing anyone and prevents removal of an owner', () => {
    expect(canRemoveFamilyMember('member', 'member')).toBe(false);
    expect(canRemoveFamilyMember('member', 'guardian')).toBe(false);
    expect(canRemoveFamilyMember('owner', 'owner')).toBe(false);
  });
});

describe('removeFamilyMember lifecycle', () => {
  function successScript(
    actor: { id: string; role: 'owner' | 'guardian' | 'member' } = OWNER,
    target: { id: string; role: 'owner' | 'guardian' | 'member' } = MEMBER
  ) {
    return createFakeDb({ selectResults: [
      [{ id: actor.id, role: actor.role }],
      [{ id: target.id, role: target.role, displayName: 'Ama', familyName: 'Our Family' }],
      [{ id: actor.id }, { id: BYSTANDER.id }]
    ] });
  }

  it.each([
    ['owner removes member', OWNER, MEMBER],
    ['owner removes guardian', OWNER, GUARDIAN],
    ['guardian removes member', GUARDIAN, MEMBER]
  ])('%s with a soft departure and live-state cleanup', async (_label, actor, target) => {
    const db = successScript(actor, target);
    await removeFamilyMember(db as never, USER_ID, FAMILY_ID, target.id);
    expect(db.__calls.updates[0]?.table).toBe(familyMembers);
    expect(db.__calls.updates[0]?.values.leftAt).toBeInstanceOf(Date);
    expect(db.__calls.deletes).not.toContain(familyMembers);
    expect(db.__calls.deletes).not.toContain(families);
    expect(db.__calls.deletes).toEqual(expect.arrayContaining([
      householdMembers,
      familyLocationShares,
      familyFindMeRequests
    ]));
  });

  it.each([
    ['guardian cannot remove guardian', GUARDIAN, SECOND_GUARDIAN],
    ['guardian cannot remove owner', GUARDIAN, OWNER],
    ['member cannot remove anybody', MEMBER, GUARDIAN]
  ])('%s', async (_label, actor, target) => {
    const db = createFakeDb({ selectResults: [
      [{ id: actor.id, role: actor.role }],
      [{ id: target.id, role: target.role, displayName: 'Ama', familyName: 'Our Family' }]
    ] });
    await expect(removeFamilyMember(db as never, USER_ID, FAMILY_ID, target.id)).rejects.toMatchObject({ code: 'forbidden_role' });
    expect(db.__calls.updates).toHaveLength(0);
  });

  it('prevents self-removal through the administrative endpoint', async () => {
    const db = createFakeDb({ selectResults: [[{ id: OWNER.id, role: OWNER.role }]] });
    await expect(removeFamilyMember(db as never, USER_ID, FAMILY_ID, OWNER.id)).rejects.toMatchObject({ code: 'cannot_remove_self' });
  });

  it.each(['cross-family member id', 'already-left member'])('rejects a %s without mutation', async () => {
    const db = createFakeDb({ selectResults: [[{ id: OWNER.id, role: OWNER.role }], []] });
    await expect(removeFamilyMember(db as never, USER_ID, FAMILY_ID, MEMBER.id)).rejects.toMatchObject({ code: 'member_not_found' });
    expect(db.__calls.updates).toHaveLength(0);
    expect(createNotificationsMock).not.toHaveBeenCalled();
  });

  it('rejects a stale racing removal after the conditional departure update loses', async () => {
    const db = createFakeDb({
      selectResults: [
        [{ id: OWNER.id, role: OWNER.role }],
        [{ id: MEMBER.id, role: MEMBER.role, displayName: 'Ama', familyName: 'Our Family' }],
        [{ id: OWNER.id }]
      ],
      updateResults: [[]]
    });
    await expect(removeFamilyMember(db as never, USER_ID, FAMILY_ID, MEMBER.id)).rejects.toMatchObject({ code: 'member_not_found' });
    expect(createNotificationsMock).not.toHaveBeenCalled();
  });

  it('notifies remaining members once, excludes the actor, and notifies the removed member', async () => {
    const db = successScript();
    await removeFamilyMember(db as never, USER_ID, FAMILY_ID, MEMBER.id);
    const entries = createNotificationsMock.mock.calls[0]?.[1] ?? [];
    expect(entries).toHaveLength(2);
    expect(entries.filter((entry) => entry.recipientMemberId === OWNER.id)).toHaveLength(0);
    expect(entries.filter((entry) => entry.recipientMemberId === BYSTANDER.id)).toHaveLength(1);
    expect(entries.filter((entry) => entry.recipientMemberId === MEMBER.id)).toHaveLength(1);
    expect(entries.find((entry) => entry.recipientMemberId === BYSTANDER.id)?.title).toBe('Ama was removed from the family');
    expect(entries.find((entry) => entry.recipientMemberId === MEMBER.id)?.title).toBe('You were removed from Our Family');
  });

  it('makes an inactive member fail the universal active-family authorization boundary', async () => {
    const db = createFakeDb({ selectResults: [[]] });
    await expect(requireFamilyMembership(db as never, USER_ID, FAMILY_ID)).rejects.toMatchObject({ code: 'not_a_member' });
  });
});

describe('final-family external storage cleanup', () => {
  it('does not delete the family database row when storage cleanup fails', async () => {
    const db = createFakeDb({ selectResults: [[{ id: OWNER.id, role: OWNER.role }], []] });
    const storage = createFakeStorage();
    storage.deletePrefix.mockRejectedValueOnce(new Error('temporary outage'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(leaveFamily(db as never, USER_ID, FAMILY_ID, storage)).rejects.toMatchObject({ code: 'storage_unavailable', status: 503 });
    consoleError.mockRestore();
    expect(db.__calls.deletes).not.toContain(families);
  });

  it('uses only the departing family namespace, never another family or profile photos', async () => {
    const db = createFakeDb({ selectResults: [[{ id: OWNER.id, role: OWNER.role }], []] });
    const storage = createFakeStorage();
    await leaveFamily(db as never, USER_ID, FAMILY_ID, storage);
    expect(storage.deletePrefix).toHaveBeenCalledTimes(1);
    expect(storage.deletePrefix).toHaveBeenCalledWith(`families/${FAMILY_ID}/`);
    expect(storage.deletePrefix).not.toHaveBeenCalledWith(expect.stringContaining('profile-photos'));
  });
});

describe('deleteAccount — cannot orphan a family', () => {
  function blockedScript() {
    return {
      selectResults: [
        [{ id: OWNER.id, familyId: FAMILY_ID, role: 'owner' }], // active memberships for this user
        [{ count: 2 }] // two other active members in that family
      ]
    };
  }

  it('blocks the whole deletion up front when the user owns a family with other active members, before changing anything', async () => {
    const db = createFakeDb(blockedScript());
    let caught: unknown;
    try {
      await deleteAccount(db as never, USER_ID, undefined);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AccountServiceError);
    expect(caught).toMatchObject({ code: 'owner_must_resolve_first' });
    expect(db.__calls.updates).toHaveLength(0);
    expect(db.__calls.deletes).toHaveLength(0);
  });
});
