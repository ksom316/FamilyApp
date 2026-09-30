import { beforeEach, describe, expect, it, vi } from 'vitest';

type NotificationEntry = {
  familyId: string;
  recipientMemberId: string;
  actorMemberId: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  route: string;
  dedupeKey: string;
};

const dependencies = vi.hoisted(() => ({
  membership: vi.fn(),
  createNotifications: vi.fn(async (_db: unknown, _entries: NotificationEntry[]) => undefined),
  familyMemberIds: vi.fn(async (_db: unknown, _familyId: string) => [] as string[])
}));

vi.mock('./family-service', () => ({ requireFamilyMembership: dependencies.membership }));
vi.mock('./notifications-service', () => ({
  createNotifications: dependencies.createNotifications,
  eventNotificationDedupeKey: (type: string, eventId: string, recipientId: string) => `${type}:${eventId}:${recipientId}`,
  familyMemberIds: dependencies.familyMemberIds,
  recipientsExcluding: (memberIds: string[], actorId: string) => [...new Set(memberIds)].filter((id) => id !== actorId)
}));

const { createCheckIn } = await import('./check-ins-service');

const familyId = '11111111-1111-4111-8111-111111111111';
const actorMemberId = '22222222-2222-4222-8222-222222222222';
const recipientA = '33333333-3333-4333-8333-333333333333';
const recipientB = '44444444-4444-4444-8444-444444444444';

function checkInDb(checkInIds: string[]) {
  let nextId = 0;
  let selectedId = '';
  const db = {
    insert: () => ({
      values: () => ({
        returning: async () => {
          selectedId = checkInIds[nextId++] ?? '';
          return [{ id: selectedId }];
        }
      })
    }),
    select: () => {
      const chain = {
        from: () => chain,
        innerJoin: () => chain,
        where: () => chain,
        limit: async () => [{
          id: selectedId,
          status: 'safe',
          message: 'private note that must not be pushed',
          createdAt: new Date(),
          member: {
            memberId: actorMemberId,
            displayName: '  Kwaku\nMensah  ',
            avatar: null,
            identityType: 'adult',
            avatarConfig: null,
            hasPhoto: false
          }
        }]
      };
      return chain;
    }
  };
  return db;
}

beforeEach(() => {
  dependencies.membership.mockReset();
  dependencies.membership.mockResolvedValue({ id: actorMemberId });
  dependencies.familyMemberIds.mockReset();
  dependencies.familyMemberIds.mockResolvedValue([actorMemberId, recipientA, recipientB, recipientA]);
  dependencies.createNotifications.mockClear();
});

describe.each([
  ['safe', 'check_in_safe', 'Kwaku Mensah marked themselves as safe.'],
  ['arrived', 'check_in_arrived', 'Kwaku Mensah has arrived safely.']
] as const)('%s check-in notifications', (status, type, body) => {
  it('notifies each other active family member once with privacy-safe content', async () => {
    const eventId = status === 'safe'
      ? '55555555-5555-4555-8555-555555555551'
      : '55555555-5555-4555-8555-555555555552';
    const db = checkInDb([eventId]);

    await createCheckIn(db as never, 'authenticated-user', familyId, {
      status,
      message: '51.5074, -0.1278 https://maps.example/private'
    });

    expect(dependencies.familyMemberIds).toHaveBeenCalledWith(db, familyId);
    expect(dependencies.createNotifications).toHaveBeenCalledTimes(1);
    const entries = dependencies.createNotifications.mock.calls[0]?.[1] ?? [];
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.recipientMemberId).sort()).toEqual([recipientA, recipientB].sort());
    expect(entries.every((entry) => entry.recipientMemberId !== actorMemberId)).toBe(true);
    expect(entries.every((entry) => entry.familyId === familyId)).toBe(true);
    expect(entries.every((entry) => entry.actorMemberId === actorMemberId)).toBe(true);
    expect(entries.every((entry) => entry.type === type)).toBe(true);
    expect(entries.every((entry) => entry.title === 'Kinzae' && entry.message === body)).toBe(true);
    expect(entries.every((entry) => entry.entityType === 'family_check_in' && entry.entityId === eventId)).toBe(true);
    expect(entries.every((entry) => entry.route === '/(family)/check-ins')).toBe(true);
    expect(entries.map((entry) => entry.dedupeKey).sort()).toEqual([
      `${type}:${eventId}:${recipientA}`,
      `${type}:${eventId}:${recipientB}`
    ].sort());
    expect(JSON.stringify(entries)).not.toMatch(/51\.5074|-0\.1278|maps\.example|private note/);
  });
});

it('gives two genuine later check-ins independent event identities', async () => {
  const firstId = '66666666-6666-4666-8666-666666666661';
  const secondId = '66666666-6666-4666-8666-666666666662';
  const db = checkInDb([firstId, secondId]);
  await createCheckIn(db as never, 'authenticated-user', familyId, { status: 'safe' });
  await createCheckIn(db as never, 'authenticated-user', familyId, { status: 'safe' });

  const keys = dependencies.createNotifications.mock.calls.flatMap((call) => call[1].map((entry) => entry.dedupeKey));
  expect(keys).toContain(`check_in_safe:${firstId}:${recipientA}`);
  expect(keys).toContain(`check_in_safe:${secondId}:${recipientA}`);
  expect(new Set(keys)).toHaveLength(4);
});
