import { and, eq } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { webPushSubscriptions } from '@familyapp/db/schema';

export type WebPushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export class WebPushSubscriptionServiceError extends Error {
  readonly code = 'invalid_web_push_subscription';
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'WebPushSubscriptionServiceError';
  }
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function decodeBase64Url(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const decoded = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export function readWebPushSubscription(value: unknown): WebPushSubscriptionInput {
  if (!value || typeof value !== 'object') throw new WebPushSubscriptionServiceError('A valid Web Push subscription is required.');
  const input = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof input.endpoint !== 'string' || input.endpoint.length < 32 || input.endpoint.length > 2048) {
    throw new WebPushSubscriptionServiceError('A valid Web Push endpoint is required.');
  }
  try {
    if (new URL(input.endpoint).protocol !== 'https:') throw new Error();
  } catch {
    throw new WebPushSubscriptionServiceError('The Web Push endpoint must use HTTPS.');
  }
  const p256dh = input.keys?.p256dh;
  const auth = input.keys?.auth;
  if (typeof p256dh !== 'string' || p256dh.length < 40 || p256dh.length > 256 || !BASE64URL.test(p256dh)) {
    throw new WebPushSubscriptionServiceError('The Web Push encryption key is invalid.');
  }
  if (typeof auth !== 'string' || auth.length < 8 || auth.length > 128 || !BASE64URL.test(auth)) {
    throw new WebPushSubscriptionServiceError('The Web Push authentication secret is invalid.');
  }
  try {
    const publicKey = decodeBase64Url(p256dh);
    const authSecret = decodeBase64Url(auth);
    if (publicKey.length !== 65 || publicKey[0] !== 4 || authSecret.length !== 16) throw new Error();
  } catch {
    throw new WebPushSubscriptionServiceError('The Web Push encryption keys are malformed.');
  }
  return { endpoint: input.endpoint, keys: { p256dh, auth } };
}

export async function registerWebPushSubscription(db: Database, userId: string, rawInput: unknown) {
  const subscription = readWebPushSubscription(rawInput);
  const now = new Date();
  await db.insert(webPushSubscriptions).values({
    userId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    lastSeenAt: now
  }).onConflictDoUpdate({
    target: webPushSubscriptions.endpoint,
    set: {
      userId,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      lastSeenAt: now,
      updatedAt: now
    }
  });
}

export async function unregisterWebPushSubscription(db: Database, userId: string, rawInput: unknown) {
  const subscription = readWebPushSubscription(rawInput);
  await db.delete(webPushSubscriptions).where(and(
    eq(webPushSubscriptions.userId, userId),
    eq(webPushSubscriptions.endpoint, subscription.endpoint)
  ));
}
