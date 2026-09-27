import { eq, inArray } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { familyMembers, webPushSubscriptions } from '@familyapp/db/schema';

import { getWebPushConfig, type WebPushConfig } from './api-database';
import {
  buildPrivacySafePushContent,
  shouldSendPush,
  type PushNotificationRecord
} from './expo-push';
import { buildWorkerPushPayload, validateVapidConfig } from './vapid';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const SAFE_WEB_ROUTES = [
  /^\/$/,
  /^\/family$/,
  /^\/chat\/family$/,
  new RegExp(`^/private-chat/${UUID}$`, 'i'),
  new RegExp(`^/emergency/${UUID}$`, 'i'),
  /^\/location$/,
  new RegExp(`^/tasks/${UUID}$`, 'i'),
  /^\/plans$/,
  /^\/calendar$/,
  new RegExp(`^/polls/${UUID}$`, 'i'),
  /^\/capsules$/,
  /^\/notifications$/
];

export type SafeWebPushPayload = {
  kind: 'familyapp_notification';
  title: string;
  body: string;
  route: string;
};

function toWebRoute(route: string) {
  return route.replace(/^\/\(family\)/, '');
}

export function isSafeWebPushRoute(route: unknown): route is string {
  return typeof route === 'string' && SAFE_WEB_ROUTES.some((allowed) => allowed.test(route));
}

export function buildSafeWebPushPayload(notification: PushNotificationRecord): SafeWebPushPayload | null {
  const content = buildPrivacySafePushContent(notification);
  if (!content || !notification.route) return null;
  const route = toWebRoute(notification.route);
  if (!isSafeWebPushRoute(route)) return null;
  return {
    kind: 'familyapp_notification',
    title: content.title,
    body: content.body,
    route
  };
}

type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  memberId: string;
};

function isStoredSubscriptionValid(subscription: StoredSubscription) {
  try {
    const decode = (value: string) => Uint8Array.from(
      atob((value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')),
      (character) => character.charCodeAt(0)
    );
    const publicKey = decode(subscription.p256dh);
    const authSecret = decode(subscription.auth);
    return new URL(subscription.endpoint).protocol === 'https:'
      && /^[A-Za-z0-9_-]{40,256}$/.test(subscription.p256dh)
      && /^[A-Za-z0-9_-]{8,128}$/.test(subscription.auth)
      && publicKey.length === 65
      && publicKey[0] === 4
      && authSecret.length === 16;
  } catch {
    return false;
  }
}

function providerCategory(endpoint: string) {
  const hostname = new URL(endpoint).hostname.toLowerCase();
  if (hostname === 'fcm.googleapis.com' || hostname.endsWith('.googleapis.com')) return 'google';
  if (hostname.endsWith('.push.apple.com')) return 'apple';
  if (hostname.endsWith('.mozilla.com')) return 'mozilla';
  if (hostname.endsWith('.windows.com') || hostname.endsWith('.microsoft.com')) return 'microsoft';
  return 'other';
}

async function deleteSubscriptions(db: Database, ids: string[]) {
  if (ids.length) await db.delete(webPushSubscriptions).where(inArray(webPushSubscriptions.id, [...new Set(ids)]));
}

export async function deliverWebPushes(
  db: Database,
  notifications: PushNotificationRecord[],
  config: WebPushConfig | null = getWebPushConfig(db),
  send: typeof fetch = fetch,
  build: typeof buildWorkerPushPayload = buildWorkerPushPayload
) {
  const eligible = notifications.filter((notification) => shouldSendPush(notification.type));
  if (!eligible.length || !config) return;

  const validatedConfig = await validateVapidConfig(config).catch((error: unknown) => {
    console.error(
      'Web Push configuration is invalid',
      error instanceof Error ? error.message : 'unknown configuration error'
    );
    return null;
  });
  if (!validatedConfig) return;

  try {
    const memberIds = [...new Set(eligible.map((notification) => notification.recipientMemberId))];
    const subscriptions = await db
      .select({
        id: webPushSubscriptions.id,
        endpoint: webPushSubscriptions.endpoint,
        p256dh: webPushSubscriptions.p256dh,
        auth: webPushSubscriptions.auth,
        memberId: familyMembers.id
      })
      .from(familyMembers)
      .innerJoin(webPushSubscriptions, eq(familyMembers.userId, webPushSubscriptions.userId))
      .where(inArray(familyMembers.id, memberIds));

    const invalidIds = subscriptions.filter((subscription) => !isStoredSubscriptionValid(subscription)).map((subscription) => subscription.id);
    await deleteSubscriptions(db, invalidIds);
    const validSubscriptions = subscriptions.filter(isStoredSubscriptionValid);
    console.info('Web Push delivery batch', {
      notifications: eligible.length,
      subscriptions: validSubscriptions.length,
      invalidSubscriptionsRemoved: invalidIds.length
    });

    let attempted = 0;
    let accepted = 0;
    let rejected = 0;
    let expired = 0;

    for (const notification of eligible) {
      const payload = buildSafeWebPushPayload(notification);
      if (!payload) continue;
      const recipients = subscriptions.filter((subscription) => (
        subscription.memberId === notification.recipientMemberId && isStoredSubscriptionValid(subscription)
      ));
      for (const subscription of recipients) {
        attempted += 1;
        const provider = providerCategory(subscription.endpoint);
        try {
          const request = await build({
            data: JSON.stringify(payload),
            options: {
              ttl: 86_400,
              urgency: notification.type === 'emergency_reported' || notification.type === 'come_find_me_started'
                ? 'high'
                : 'normal'
            }
          }, {
            endpoint: subscription.endpoint,
            expirationTime: null,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth }
          }, validatedConfig);
          const response = await send(subscription.endpoint, request);
          console.info('Web Push provider response', { provider, status: response.status });
          if (response.status === 404 || response.status === 410) {
            expired += 1;
            await deleteSubscriptions(db, [subscription.id]);
          } else if (!response.ok) {
            rejected += 1;
            console.warn(`Web Push provider rejected a notification with status ${response.status}`);
          } else {
            accepted += 1;
          }
        } catch (error) {
          rejected += 1;
          // Never include endpoints or encryption material in logs.
          console.warn('Web Push delivery failed', {
            provider,
            reason: error instanceof Error ? error.name : 'unknown error'
          });
        }
      }
    }
    console.info('Web Push delivery summary', { attempted, accepted, rejected, expired });
  } catch (error) {
    // The in-app notification already exists and remains authoritative.
    console.error('Web Push delivery failed', error);
  }
}
