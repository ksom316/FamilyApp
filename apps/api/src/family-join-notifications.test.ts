import { beforeEach, describe, expect, it, vi } from 'vitest';

type NotificationEntry = {
  familyId: string;
  recipientMemberId: string;
  actorMemberId: string;
  type: string;
  title: string;
  message: string;
  dedupeKey: string;
};

const notifications = vi.hoisted(() => ({
  create: vi.fn(async (_db: unknown, _entries: NotificationEntry[]) => undefined),
  familyMembers: vi.fn(async (_db: unknown, _familyId: string) => [] as string[])
}));

vi.mock('./notifications-service', () => ({
  createNotifications: notifications.create,
  eventNotificationDedupeKey: (type: string, eventId: string, recipientId: string) => `${type}:${eventId}:${recipientId}`,
  familyMemberIds: notifications.familyMembers,
  recipientsExcluding: (memberIds: string[], actorId: string) => [...new Set(memberIds)].filter((id) => id !== actorId)
}));

const { acceptFamilyInvitation } = await import('./family-service');

const familyId = '11111111-1111-4111-8111-111111111111';
const invitationId = '22222222-2222-4222-8222-222222222222';
const joiningMemberId = '33333333-3333-4333-8333-333333333333';
const existingMemberA = '44444444-4444-4444-8444-444444444444';
const existingMemberB = '55555555-5555-4555-8555-555555555555';

function acceptanceDb(joined: boolean) {
  const selectResults = [
    [{ acceptedAt: null, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) }],
    [{ displayName: 'Ama', familyName: 'The African Family' }]
  ];
  const select = () => {
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      limit: async () => selectResults.shift() ?? []
    };
    return chain;
  };
  return {
    select,
    execute: async () => ({ rows: [{ invitationId, familyId, memberId: joiningMemberId, joined }] })
  };
}

beforeEach(() => {
  notifications.create.mockClear();
  notifications.familyMembers.mockReset();
});

describe('family invitation acceptance notifications', () => {
  it('notifies only existing active members with family-scoped, retry-safe entries', async () => {
    notifications.familyMembers.mockResolvedValue([joiningMemberId, existingMemberA, existingMemberB]);
    const result = await acceptFamilyInvitation(acceptanceDb(true) as never, 'joining-user', 'invitation-token');

    expect(result).toEqual({ familyId, status: 'accepted' });
    expect(notifications.familyMembers).toHaveBeenCalledWith(expect.anything(), familyId);
    expect(notifications.create).toHaveBeenCalledTimes(1);
    const entries = notifications.create.mock.calls[0]?.[1] ?? [];
    expect(entries.map((entry) => entry.recipientMemberId).sort()).toEqual([existingMemberA, existingMemberB].sort());
    expect(entries.every((entry) => entry.recipientMemberId !== joiningMemberId)).toBe(true);
    expect(entries.every((entry) => entry.familyId === familyId)).toBe(true);
    expect(entries.every((entry) => entry.actorMemberId === joiningMemberId)).toBe(true);
    expect(entries.every((entry) => entry.type === 'member_joined')).toBe(true);
    expect(entries.every((entry) => entry.title === 'Kinzae')).toBe(true);
    expect(entries.every((entry) => entry.message === 'Ama joined The African Family')).toBe(true);
    expect(entries.map((entry) => entry.dedupeKey).sort()).toEqual([
      `member_joined:${invitationId}:${existingMemberA}`,
      `member_joined:${invitationId}:${existingMemberB}`
    ].sort());
  });

  it('does not notify for an already-active membership', async () => {
    const result = await acceptFamilyInvitation(acceptanceDb(false) as never, 'joining-user', 'invitation-token');
    expect(result).toEqual({ familyId, status: 'already_member' });
    expect(notifications.familyMembers).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });
});
