import { and, eq } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { pushDevices } from '@familyapp/db/schema';

export type PushPlatform = 'android' | 'ios';
export type PushDeviceErrorCode = 'invalid_push_token' | 'invalid_push_platform';

export class PushDeviceServiceError extends Error {
  constructor(public readonly code: PushDeviceErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'PushDeviceServiceError';
  }
}

export function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string' && /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(value);
}

export function readPushPlatform(value: unknown): PushPlatform {
  if (value !== 'android' && value !== 'ios') {
    throw new PushDeviceServiceError('invalid_push_platform', 'A supported mobile platform is required.');
  }
  return value;
}

export function readExpoPushToken(value: unknown) {
  if (!isExpoPushToken(value)) {
    throw new PushDeviceServiceError('invalid_push_token', 'A valid Expo push token is required.');
  }
  return value;
}

export async function registerPushDevice(
  db: Database,
  userId: string,
  input: { expoPushToken?: unknown; platform?: unknown }
) {
  const expoPushToken = readExpoPushToken(input.expoPushToken);
  const platform = readPushPlatform(input.platform);
  const now = new Date();

  await db
    .insert(pushDevices)
    .values({ userId, expoPushToken, platform, lastSeenAt: now })
    .onConflictDoUpdate({
      target: pushDevices.expoPushToken,
      set: { userId, platform, lastSeenAt: now, updatedAt: now }
    });
}

export async function unregisterPushDevice(db: Database, userId: string, rawToken: unknown) {
  const expoPushToken = readExpoPushToken(rawToken);
  await db.delete(pushDevices).where(and(
    eq(pushDevices.userId, userId),
    eq(pushDevices.expoPushToken, expoPushToken)
  ));
}
