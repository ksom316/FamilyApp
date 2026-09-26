import { describe, expect, it } from 'vitest';

import { recipientsExcluding } from './notifications-service';
import { buildSafePushMessage, shouldSendNativePush } from './expo-push';
import { isExpoPushToken, readExpoPushToken, readPushPlatform, registerPushDevice } from './push-devices-service';
import { readPushDestination } from '../../mobile/lib/push-routing';

const notification = {
  id: '11111111-1111-4111-8111-111111111111',
  familyId: '22222222-2222-4222-8222-222222222222',
  recipientMemberId: '33333333-3333-4333-8333-333333333333',
  type: 'emergency_reported',
  title: 'Sensitive emergency title',
  message: 'Sensitive details that must not be on a lock screen',
  entityType: 'emergency_incident',
  entityId: '44444444-4444-4444-8444-444444444444',
  route: '/(family)/emergency/44444444-4444-4444-8444-444444444444'
};

describe('push recipients and registration validation', () => {
  it('deduplicates recipients and excludes the sender', () => {
    expect(recipientsExcluding(['sender', 'recipient', 'recipient'], 'sender')).toEqual(['recipient']);
  });

  it('accepts Expo tokens and supported native platforms only', () => {
    expect(isExpoPushToken('ExponentPushToken[abc_123-XYZ]')).toBe(true);
    expect(readExpoPushToken('ExpoPushToken[abc_123-XYZ]')).toContain('ExpoPushToken');
    expect(readPushPlatform('android')).toBe('android');
    expect(() => readExpoPushToken('not-a-token')).toThrow(/valid Expo push token/i);
    expect(() => readPushPlatform('web')).toThrow(/supported mobile platform/i);
  });

  it('binds an upserted token to the authenticated user id', async () => {
    const captured: { inserted?: unknown; conflictSet?: unknown } = {};
    const fakeDb = {
      insert: () => ({
        values: (inserted: unknown) => {
          captured.inserted = inserted;
          return {
            onConflictDoUpdate: async ({ set }: { set: unknown }) => {
              captured.conflictSet = set;
            }
          };
        }
      })
    };
    await registerPushDevice(fakeDb as never, 'authenticated-user', {
      expoPushToken: 'ExpoPushToken[abc_123-XYZ]',
      platform: 'android'
    });
    expect(captured.inserted).toMatchObject({ userId: 'authenticated-user' });
    expect(captured.conflictSet).toMatchObject({ userId: 'authenticated-user' });
  });
});

describe('safe push payload construction', () => {
  it('uses a generic emergency preview and includes only safe routing metadata', () => {
    const message = buildSafePushMessage(notification, 'ExpoPushToken[abc_123-XYZ]');
    expect(message).toMatchObject({
      title: 'Emergency alert',
      priority: 'high',
      channelId: 'familyapp-urgent'
    });
    expect(message?.body).not.toContain('Sensitive details');
    expect(message?.data).not.toHaveProperty('latitude');
    expect(message?.data).not.toHaveProperty('longitude');
    expect(message?.data).not.toHaveProperty('token');
  });

  it('does not push intentionally excluded low-value notification types', () => {
    expect(shouldSendNativePush('shopping_list_created')).toBe(false);
    expect(buildSafePushMessage({ ...notification, type: 'shopping_list_created' }, 'ExpoPushToken[abc]')).toBeNull();
  });

  it('delivers a member-left notification through the same native push pipeline', () => {
    expect(shouldSendNativePush('member_left')).toBe(true);
    const message = buildSafePushMessage({
      ...notification,
      type: 'member_left',
      title: 'Kwaku left the family',
      message: null,
      route: '/(family)/family'
    }, 'ExpoPushToken[abc_123-XYZ]');
    expect(message).toMatchObject({ title: 'Kwaku left the family' });
  });

  it('accepts allowlisted app routes and rejects arbitrary or malformed data', () => {
    expect(readPushDestination(buildSafePushMessage(notification, 'ExpoPushToken[abc]')?.data)).toEqual({
      familyId: notification.familyId,
      notificationId: notification.id,
      route: notification.route
    });
    expect(readPushDestination({
      kind: 'familyapp_notification',
      familyId: notification.familyId,
      notificationId: notification.id,
      route: 'https://example.com'
    })).toBeNull();
  });
});
