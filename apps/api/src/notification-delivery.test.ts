import { beforeEach, describe, expect, it, vi } from 'vitest';

const delivery = vi.hoisted(() => ({
  native: vi.fn(async (_db: unknown, _notifications: unknown[]) => undefined),
  web: vi.fn(async (_db: unknown, _notifications: unknown[]) => undefined)
}));

vi.mock('./expo-push', () => ({ deliverNativePushes: delivery.native }));
vi.mock('./web-push', () => ({ deliverWebPushes: delivery.web }));

import { familyMessageNotificationDedupeKey } from './chat-service';
import { createNotifications, recipientsExcluding, type NotificationInput } from './notifications-service';
import { privateMessageNotificationDedupeKey } from './private-chat-service';

const familyId = '11111111-1111-4111-8111-111111111111';
const senderId = '22222222-2222-4222-8222-222222222222';
const recipientId = '33333333-3333-4333-8333-333333333333';
const familyMessageA = '44444444-4444-4444-8444-444444444441';
const familyMessageB = '44444444-4444-4444-8444-444444444442';
const privateMessageA = '55555555-5555-4555-8555-555555555551';
const privateMessageB = '55555555-5555-4555-8555-555555555552';
const conversationId = '66666666-6666-4666-8666-666666666666';

function notificationInput(type: 'family_message' | 'private_message', messageId: string): NotificationInput {
  const isFamily = type === 'family_message';
  return {
    familyId,
    recipientMemberId: recipientId,
    actorMemberId: senderId,
    type,
    title: isFamily ? 'A family message arrived' : 'A private message arrived',
    message: 'Open Kinzae to read the message.',
    entityType: isFamily ? 'family_message' : 'private_conversation',
    entityId: isFamily ? messageId : conversationId,
    route: isFamily ? '/(family)/chat/family' : `/(family)/private-chat/${conversationId}`,
    dedupeKey: isFamily
      ? familyMessageNotificationDedupeKey(messageId, recipientId)
      : privateMessageNotificationDedupeKey(messageId, recipientId)
  };
}

function notificationDb() {
  const seenDedupeKeys = new Set<string>();
  const rows: Array<NotificationInput & { id: string }> = [];
  return {
    rows,
    db: {
      insert: () => ({
        values: (values: NotificationInput[]) => ({
          onConflictDoNothing: () => ({
            returning: async () => values.flatMap((value) => {
              if (value.dedupeKey && seenDedupeKeys.has(value.dedupeKey)) return [];
              if (value.dedupeKey) seenDedupeKeys.add(value.dedupeKey);
              const row = { ...value, id: `notification-${rows.length + 1}` };
              rows.push(row);
              return [row];
            })
          })
        })
      })
    }
  };
}

describe.each([
  ['family chat', 'family_message', familyMessageA, familyMessageB],
  ['private chat', 'private_message', privateMessageA, privateMessageB]
] as const)('%s notification event identity', (_label, type, messageA, messageB) => {
  beforeEach(() => {
    delivery.native.mockClear();
    delivery.web.mockClear();
  });

  it('creates and delivers both distinct messages but deduplicates a replay of the same message', async () => {
    const { db, rows } = notificationDb();
    await createNotifications(db as never, [notificationInput(type, messageA)]);
    await createNotifications(db as never, [notificationInput(type, messageB)]);
    await createNotifications(db as never, [notificationInput(type, messageB)]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.dedupeKey)).toEqual([
      notificationInput(type, messageA).dedupeKey,
      notificationInput(type, messageB).dedupeKey
    ]);

    const nativeRows = delivery.native.mock.calls.flatMap((call) => call[1] as Array<{ id: string }>);
    const webRows = delivery.web.mock.calls.flatMap((call) => call[1] as Array<{ id: string }>);
    expect(nativeRows.map((row) => row.id)).toEqual(['notification-1', 'notification-2']);
    expect(webRows.map((row) => row.id)).toEqual(['notification-1', 'notification-2']);
  });
});

describe('chat notification recipient selection', () => {
  it('excludes the sender and keeps each other recipient once', () => {
    expect(recipientsExcluding([senderId, recipientId, recipientId], senderId)).toEqual([recipientId]);
  });
});

describe.each([
  ['I\'m Safe', 'check_in_safe'],
  ['I\'ve Arrived', 'check_in_arrived']
] as const)('%s delivery idempotency', (_label, type) => {
  beforeEach(() => {
    delivery.native.mockClear();
    delivery.web.mockClear();
  });

  it('delivers distinct check-ins through both channels but deduplicates the same event', async () => {
    const { db, rows } = notificationDb();
    const makeInput = (eventId: string): NotificationInput => ({
      familyId,
      recipientMemberId: recipientId,
      actorMemberId: senderId,
      type,
      title: 'Kinzae',
      message: type === 'check_in_safe' ? 'Kwaku marked themselves as safe.' : 'Kwaku has arrived safely.',
      entityType: 'family_check_in',
      entityId: eventId,
      route: '/(family)/check-ins',
      dedupeKey: `${type}:${eventId}:${recipientId}`
    });
    const eventA = '77777777-7777-4777-8777-777777777771';
    const eventB = '77777777-7777-4777-8777-777777777772';

    await createNotifications(db as never, [makeInput(eventA)]);
    await createNotifications(db as never, [makeInput(eventB)]);
    await createNotifications(db as never, [makeInput(eventB)]);

    expect(rows).toHaveLength(2);
    expect(delivery.native.mock.calls.flatMap((call) => call[1])).toHaveLength(2);
    expect(delivery.web.mock.calls.flatMap((call) => call[1])).toHaveLength(2);
  });
});
