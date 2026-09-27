import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { markDepartureNotificationRead, recipientsExcluding } from './notifications-service';
import { buildSafePushMessage, shouldSendNativePush } from './expo-push';
import { isExpoPushToken, readExpoPushToken, readPushPlatform, registerPushDevice } from './push-devices-service';
import { buildSafeWebPushPayload, deliverWebPushes, isSafeWebPushRoute } from './web-push';
import { readWebPushSubscription, registerWebPushSubscription } from './web-push-subscriptions-service';
import { readPushDestination } from '../../mobile/lib/push-routing';
import {
  familyMessageNotificationContent,
  MAX_CHAT_NOTIFICATION_PREVIEW_LENGTH,
  privateMessageNotificationContent
} from './notification-content';

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
const validP256dh = `B${'A'.repeat(86)}`;
const validAuth = 'B'.repeat(22);
const testVapidConfig = {
  subject: 'mailto:test@example.com',
  privateKey: 'VvFbnS5QlP5PcJzYyEpRQj93SFJetREtqqzbGAfK3RE',
  publicKey: 'BKKXE3jJV5UJ6c8HVPam6DvMPGZK26r-M7ojsO2T_KdjdeMT2d7oQpaO-VI3o3wn33mQ8JlHta3OSJ5f67Ac5ZY'
};

describe('push recipients and registration validation', () => {
  it('deduplicates recipients and excludes the sender', () => {
    expect(recipientsExcluding(['sender', 'recipient', 'recipient'], 'sender')).toEqual(['recipient']);
  });

  it('validates browser subscriptions and binds endpoint upserts to the authenticated user', async () => {
    const subscription = {
      endpoint: 'https://push.example.test/subscriptions/browser-one',
      keys: { p256dh: validP256dh, auth: validAuth }
    };
    expect(readWebPushSubscription(subscription)).toEqual(subscription);
    expect(() => readWebPushSubscription({ ...subscription, endpoint: 'http://push.example.test/subscriptions/browser-one' })).toThrow(/HTTPS/);
    expect(() => readWebPushSubscription({ ...subscription, keys: { p256dh: 'bad!', auth: 'short' } })).toThrow(/encryption key/);

    const captured: { inserted?: Record<string, unknown>; conflictSet?: Record<string, unknown> } = {};
    const fakeDb = {
      insert: () => ({
        values: (inserted: Record<string, unknown>) => {
          captured.inserted = inserted;
          return { onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => { captured.conflictSet = set; } };
        }
      })
    };
    await registerWebPushSubscription(fakeDb as never, 'authenticated-user', subscription);
    expect(captured.inserted).toMatchObject({ userId: 'authenticated-user', endpoint: subscription.endpoint });
    expect(captured.conflictSet).toMatchObject({ userId: 'authenticated-user', p256dh: subscription.keys.p256dh });
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

describe('inactive recipient notification reads', () => {
  it('marks a recipient-owned removal notification without active-family authorization', async () => {
    const calls = { updates: 0 };
    const selectChain = {
      from: () => selectChain,
      innerJoin: () => selectChain,
      where: () => selectChain,
      limit: async () => [{ id: notification.id, readAt: null }]
    };
    const fakeDb = {
      select: () => selectChain,
      update: () => ({
        set: () => ({
          where: async () => { calls.updates += 1; }
        })
      })
    };
    await markDepartureNotificationRead(fakeDb as never, 'authenticated-user', notification.id);
    expect(calls.updates).toBe(1);
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

  it('keeps family and private messages eligible for native and Web Push', () => {
    for (const type of ['family_message', 'private_message']) {
      const messageNotification = { ...notification, type, route: type === 'family_message'
        ? '/(family)/chat/family'
        : '/(family)/private-chat/44444444-4444-4444-8444-444444444444' };
      expect(shouldSendNativePush(type)).toBe(true);
      expect(buildSafePushMessage(messageNotification, 'ExpoPushToken[abc_123-XYZ]')).not.toBeNull();
      expect(buildSafeWebPushPayload(messageNotification)).not.toBeNull();
    }
  });

  it('uses sender and family context with one sanitized preview for native and Web Push', () => {
    const content = familyMessageNotificationContent(
      ' Kwaku ',
      'The African Family',
      '  Are we\n meeting   at 6 today?  '
    );
    const messageNotification = {
      ...notification,
      type: 'family_message',
      title: content.title,
      message: content.body,
      route: '/(family)/chat/family'
    };

    expect(content).toEqual({
      title: 'Kwaku • The African Family',
      body: 'Are we meeting at 6 today?'
    });
    expect(buildSafePushMessage(messageNotification, 'ExpoPushToken[abc_123-XYZ]')).toMatchObject(content);
    expect(buildSafeWebPushPayload(messageNotification)).toMatchObject(content);
  });

  it('uses the sender and a safely truncated private-message preview', () => {
    const content = privateMessageNotificationContent('  Ama  ', `First line\n\n${'word '.repeat(80)}`);
    const messageNotification = {
      ...notification,
      type: 'private_message',
      title: content.title,
      message: content.body,
      route: '/(family)/private-chat/44444444-4444-4444-8444-444444444444'
    };

    expect(content.title).toBe('Ama');
    expect(content.body).not.toMatch(/\s{2,}|\r|\n/);
    expect(Array.from(content.body)).toHaveLength(MAX_CHAT_NOTIFICATION_PREVIEW_LENGTH);
    expect(content.body.endsWith('…')).toBe(true);
    expect(buildSafePushMessage(messageNotification, 'ExpoPushToken[abc_123-XYZ]')?.body).toBe(content.body);
    expect(buildSafeWebPushPayload(messageNotification)?.body).toBe(content.body);
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

  it('delivers member-joined content through native and Web Push', () => {
    const joined = {
      ...notification,
      type: 'member_joined',
      title: 'FamilyApp',
      message: 'Ama joined The African Family',
      entityType: 'family_member',
      route: '/(family)/family'
    };
    expect(shouldSendNativePush(joined.type)).toBe(true);
    expect(buildSafePushMessage(joined, 'ExpoPushToken[abc_123-XYZ]')).toMatchObject({
      title: joined.title,
      body: joined.message
    });
    expect(buildSafeWebPushPayload(joined)).toMatchObject({
      title: joined.title,
      body: joined.message,
      route: '/family'
    });
  });

  it('delivers member-removal pushes with a privacy-safe preview and safe home route', () => {
    expect(shouldSendNativePush('member_removed')).toBe(true);
    const message = buildSafePushMessage({
      ...notification,
      type: 'member_removed',
      title: 'You were removed from a sensitive family name',
      message: 'sensitive removal details',
      route: '/'
    }, 'ExpoPushToken[abc_123-XYZ]');
    expect(message).toMatchObject({
      title: 'Family membership updated',
      body: 'Open FamilyApp to review a change to your family membership.'
    });
    expect(message?.body).not.toContain('sensitive');
    expect(readPushDestination(message?.data)).toMatchObject({ route: '/', type: 'member_removed' });
  });

  it('accepts allowlisted app routes and rejects arbitrary or malformed data', () => {
    expect(readPushDestination(buildSafePushMessage(notification, 'ExpoPushToken[abc]')?.data)).toEqual({
      familyId: notification.familyId,
      notificationId: notification.id,
      route: notification.route,
      type: notification.type
    });
    expect(readPushDestination({
      kind: 'familyapp_notification',
      familyId: notification.familyId,
      notificationId: notification.id,
      route: 'https://example.com'
    })).toBeNull();
  });

  it('builds a privacy-safe Web Push payload and converts only allowlisted internal routes', () => {
    const payload = buildSafeWebPushPayload(notification);
    expect(payload).toMatchObject({
      title: 'Emergency alert',
      route: '/emergency/44444444-4444-4444-8444-444444444444'
    });
    expect(payload?.body).not.toContain('Sensitive details');
    expect(payload).not.toHaveProperty('familyId');
    expect(payload).not.toHaveProperty('entityId');
    expect(payload).not.toHaveProperty('tag');
    expect(isSafeWebPushRoute('https://example.com')).toBe(false);
    expect(buildSafeWebPushPayload({ ...notification, route: 'https://example.com' })).toBeNull();
  });

  it('does not collapse distinct pushes under one service-worker notification tag', () => {
    const serviceWorker = readFileSync(
      new URL('../../mobile/public/familyapp-push-sw.js', import.meta.url),
      'utf8'
    );
    expect(serviceWorker).not.toMatch(/\btag\s*:/);
  });

  it('displays two distinct Web Push events independently in the active worker', async () => {
    const serviceWorker = readFileSync(
      new URL('../../mobile/public/familyapp-push-sw.js', import.meta.url),
      'utf8'
    );
    const listeners = new Map<string, (event: {
      data?: { json(): unknown };
      waitUntil(promise: Promise<unknown>): void;
    }) => void>();
    const displayed: Array<{ title: string; options: Record<string, unknown> }> = [];
    const skipWaiting = vi.fn(async () => undefined);
    const claim = vi.fn(async () => undefined);
    const workerSelf = {
      addEventListener: (name: string, listener: (typeof listeners extends Map<string, infer T> ? T : never)) => {
        listeners.set(name, listener);
      },
      skipWaiting,
      clients: { claim },
      registration: {
        showNotification: async (title: string, options: Record<string, unknown>) => {
          displayed.push({ title, options });
        }
      },
      location: { origin: 'https://familyapp.example' }
    };
    runInNewContext(serviceWorker, {
      self: workerSelf,
      URL,
      console: { info: vi.fn() }
    });

    async function dispatch(name: string, payload?: Record<string, unknown>) {
      const pending: Promise<unknown>[] = [];
      const listener = listeners.get(name);
      expect(listener).toBeTypeOf('function');
      listener?.({
        ...(payload ? { data: { json: () => payload } } : {}),
        waitUntil: (promise) => { pending.push(Promise.resolve(promise)); }
      });
      await Promise.all(pending);
    }

    await dispatch('install');
    await dispatch('activate');
    await dispatch('push', { title: 'Ama', body: 'Message A', route: '/chat/family' });
    await dispatch('push', { title: 'Ama', body: 'Message B', route: '/chat/family' });

    expect(skipWaiting).toHaveBeenCalledOnce();
    expect(claim).toHaveBeenCalledOnce();
    expect(displayed).toHaveLength(2);
    expect(displayed.map(({ title, options }) => ({ title, body: options.body }))).toEqual([
      { title: 'Ama', body: 'Message A' },
      { title: 'Ama', body: 'Message B' }
    ]);
    for (const { options } of displayed) {
      expect(options).not.toHaveProperty('tag');
      expect(options).not.toHaveProperty('renotify');
      expect(options).not.toHaveProperty('silent');
      expect(options).not.toHaveProperty('requireInteraction');
    }
  });

  it('sends two distinct message payloads independently to the same browser subscription', async () => {
    const selectChain = {
      from: () => selectChain,
      innerJoin: () => selectChain,
      where: async () => [{
        id: 'desktop-subscription',
        memberId: notification.recipientMemberId,
        endpoint: 'https://fcm.googleapis.com/web-push/desktop-browser',
        p256dh: validP256dh,
        auth: validAuth
      }]
    };
    const fakeDb = {
      select: () => selectChain,
      delete: () => ({ where: async () => undefined })
    };
    const builtPayloads: Array<{ data: string; options?: Record<string, unknown> }> = [];
    const sentRequests: RequestInit[] = [];
    const first = {
      ...notification,
      id: '55555555-5555-4555-8555-555555555555',
      type: 'family_message',
      title: 'Ama • Family',
      message: 'Message A',
      route: '/(family)/chat/family'
    };
    const second = {
      ...first,
      id: '66666666-6666-4666-8666-666666666666',
      message: 'Message B'
    };

    await deliverWebPushes(
      fakeDb as never,
      [first, second],
      testVapidConfig,
      async (_endpoint, request) => {
        expect(request).toBeDefined();
        sentRequests.push(request!);
        return new Response(null, { status: 201 });
      },
      async (message) => {
        builtPayloads.push(message);
        return {
          method: 'POST',
          headers: {
            authorization: 'test',
            ttl: '86400',
            urgency: 'normal',
            'content-encoding': 'aes128gcm',
            'content-length': '1',
            'content-type': 'application/octet-stream'
          },
          body: new Uint8Array([1])
        };
      }
    );

    expect(sentRequests).toHaveLength(2);
    expect(builtPayloads).toHaveLength(2);
    expect(builtPayloads.map(({ data }) => JSON.parse(data).body)).toEqual(['Message A', 'Message B']);
    expect(builtPayloads.every(({ options }) => !options?.topic)).toBe(true);
  });

  it('continues to an active browser subscription when another stored subscription fails', async () => {
    const selectChain = {
      from: () => selectChain,
      innerJoin: () => selectChain,
      where: async () => [
        {
          id: 'stale-subscription',
          memberId: notification.recipientMemberId,
          endpoint: 'https://fcm.googleapis.com/web-push/stale-browser',
          p256dh: validP256dh,
          auth: validAuth
        },
        {
          id: 'active-subscription',
          memberId: notification.recipientMemberId,
          endpoint: 'https://fcm.googleapis.com/web-push/active-browser',
          p256dh: validP256dh,
          auth: validAuth
        }
      ]
    };
    const fakeDb = {
      select: () => selectChain,
      delete: () => ({ where: async () => undefined })
    };
    const attempted: string[] = [];

    await deliverWebPushes(
      fakeDb as never,
      [notification],
      testVapidConfig,
      async (endpoint) => {
        const value = endpoint.toString();
        attempted.push(value.endsWith('stale-browser') ? 'stale' : 'active');
        if (value.endsWith('stale-browser')) throw new TypeError('provider connection failed');
        return new Response(null, { status: 201 });
      },
      async () => ({
        method: 'POST',
        headers: {
          authorization: 'test',
          ttl: '86400',
          urgency: 'normal',
          'content-encoding': 'aes128gcm',
          'content-length': '1',
          'content-type': 'application/octet-stream'
        },
        body: new Uint8Array([1])
      })
    );

    expect(attempted).toEqual(['stale', 'active']);
  });

  it('cleans malformed stored subscriptions without attempting delivery', async () => {
    const deleted: unknown[] = [];
    const selectChain = {
      from: () => selectChain,
      innerJoin: () => selectChain,
      where: async () => [{ id: 'bad-subscription', memberId: notification.recipientMemberId, endpoint: 'not-https', p256dh: 'bad', auth: 'bad' }]
    };
    const fakeDb = {
      select: () => selectChain,
      delete: () => ({ where: async (condition: unknown) => { deleted.push(condition); } })
    };
    await expect(deliverWebPushes(fakeDb as never, [notification], testVapidConfig,
      async () => { throw new Error('must not send'); })).resolves.toBeUndefined();
    expect(deleted).toHaveLength(1);
  });

  it('removes a permanently expired subscription after a 410 response', async () => {
    const deleted: unknown[] = [];
    const selectChain = {
      from: () => selectChain,
      innerJoin: () => selectChain,
      where: async () => [{
        id: 'expired-subscription',
        memberId: notification.recipientMemberId,
        endpoint: 'https://push.example.test/subscriptions/expired-browser',
        p256dh: validP256dh,
        auth: validAuth
      }]
    };
    const fakeDb = {
      select: () => selectChain,
      delete: () => ({ where: async (condition: unknown) => { deleted.push(condition); } })
    };
    await deliverWebPushes(
      fakeDb as never,
      [notification],
      testVapidConfig,
      async () => new Response(null, { status: 410 }),
      async () => ({ method: 'POST', headers: { authorization: '', ttl: '1', 'content-encoding': '', 'content-length': '0', 'content-type': '' }, body: new Uint8Array() })
    );
    expect(deleted).toHaveLength(1);
  });

  it('keeps Web Push lookup failures best-effort', async () => {
    const fakeDb = { select: () => { throw new Error('database unavailable'); } };
    await expect(deliverWebPushes(fakeDb as never, [notification], testVapidConfig)).resolves.toBeUndefined();
  });
});
