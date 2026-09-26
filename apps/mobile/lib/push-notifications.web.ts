import { authClient } from './auth-client';

const noSubscription = { remove() {} };

export function setActiveNotificationPathname(_pathname: string) {}
export async function registerCurrentPushDevice() {}
export function addPushTokenRefreshListener() { return noSubscription; }
export function addPushResponseListener(_listener: (data: Record<string, unknown>) => void) { return noSubscription; }
export async function consumeLastPushResponse(_listener: (data: Record<string, unknown>) => void) {}
export async function signOutWithPushCleanup() { await authClient.signOut(); }
