import { beforeEach, describe, expect, it, vi } from 'vitest';

import { families } from '@familyapp/db/schema';

import { ownerBlockedFromLeaving, shouldTeardownFamily } from './family-service';

type NotificationEntry = { recipientMemberId: string; type: string; title: string };
const createNotificationsMock = vi.fn(async (_db: unknown, _entries: NotificationEntry[]) => {});
vi.mock('./notifications-service', () => ({ createNotifications: createNotificationsMock }));

// Imported after the mock is registered so leaveFamily's dynamic
// `await import('./notifications-service')` resolves to the mocked module.
const { leaveFamily } = await import('./family-service');
const { deleteAccount, AccountServiceError } = await import('./account-service');

const OWNER = { id: '11111111-1111-4111-8111-111111111111', role: 'owner' as const };
const GUARDIAN = { id: '22222222-2222-4222-8222-222222222222', role: 'guardian' as const };
const MEMBER = { id: '33333333-3333-4333-8333-333333333333', role: 'member' as const };
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
function createFakeDb(options: { selectResults: FakeRow[][] }) {
  const selectQueue = [...options.selectResults];
  const calls = { updates: [] as { table: unknown; values: FakeRow }[], deletes: [] as unknown[] };

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
        return { where: async () => undefined };
      }
    }),
    delete: (table: unknown) => {
      calls.deletes.push(table);
      return { where: async () => undefined };
    },
    __calls: calls
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

    const result = await leaveFamily(db as never, USER_ID, FAMILY_ID);

    expect(result).toEqual({ familyDeleted: true });
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
