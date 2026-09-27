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
  tag: string;
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
    route,
    tag: `familyapp-${notification.type}`
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

    for (const notification of eligible) {
      const payload = buildSafeWebPushPayload(notification);
      if (!payload) continue;
      const recipients = subscriptions.filter((subscription) => (
        subscription.memberId === notification.recipientMemberId && isStoredSubscriptionValid(subscription)
      ));
      for (const subscription of recipients) {
        try {
          const request = await build({
            data: JSON.stringify(payload),
            options: { ttl: 86_400, urgency: payload.tag.includes('emergency_reported') || payload.tag.includes('come_find_me_started') ? 'high' : 'normal' }
          }, {
            endpoint: subscription.endpoint,
            expirationTime: null,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth }
          }, validatedConfig);
          const response = await send(subscription.endpoint, request);
          if (response.status === 404 || response.status === 410) {
            await deleteSubscriptions(db, [subscription.id]);
          } else if (!response.ok) {
            console.warn(`Web Push provider rejected a notification with status ${response.status}`);
          }
        } catch (error) {
          // Never include endpoints or encryption material in logs.
          console.warn('Web Push delivery failed', error instanceof Error ? error.message : 'unknown error');
        }
      }
    }
  } catch (error) {
    // The in-app notification already exists and remains authoritative.
    console.error('Web Push delivery failed', error);
  }
}
