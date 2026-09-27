import { createDatabase, type Database } from '@familyapp/db';

import type { AuthBindings } from './auth';

export type WebPushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

const webPushConfigs = new WeakMap<object, WebPushConfig>();
let webPushConfigWarningEmitted = false;

function warnInvalidWebPushConfig(message: string) {
  if (webPushConfigWarningEmitted) return;
  webPushConfigWarningEmitted = true;
  console.error(message);
}

function readWebPushConfig(env: AuthBindings): WebPushConfig | null {
  const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = env.WEB_PUSH_SUBJECT?.trim();
  const configured = [publicKey, privateKey, subject].filter(Boolean).length;
  if (configured === 0) return null;
  if (configured !== 3) {
    warnInvalidWebPushConfig('Web Push is disabled because its three VAPID settings are not all configured.');
    return null;
  }
  if (!/^(mailto:|https:\/\/)/i.test(subject!)) {
    warnInvalidWebPushConfig('Web Push is disabled because WEB_PUSH_SUBJECT is not a mailto: or HTTPS URI.');
    return null;
  }
  return { publicKey: publicKey!, privateKey: privateKey!, subject: subject! };
}

export function createApiDatabase(env: AuthBindings) {
  const db = createDatabase(env.DATABASE_URL);
  const config = readWebPushConfig(env);
  if (config) webPushConfigs.set(db, config);
  return db;
}

export function getWebPushConfig(db: Database) {
  return webPushConfigs.get(db) ?? null;
}
