import { apiFetch } from './api';
import { authClient } from './auth-client';

const SERVICE_WORKER_PATH = '/familyapp-push-sw.js';
const publicVapidKey = process.env.EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? '';
const noSubscription = { remove() {} };

export type WebPushStatus = 'checking' | 'unsupported' | 'needs-install' | 'not-enabled' | 'enabled' | 'denied' | 'error';

function browserSupportsPush() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

function needsHomeScreenInstall() {
  if (typeof window === 'undefined') return false;
  const appleNavigator = navigator as Navigator & { standalone?: boolean };
  return 'standalone' in appleNavigator
    && appleNavigator.standalone !== true
    && !window.matchMedia('(display-mode: standalone)').matches;
}

function decodeApplicationServerKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function getRegistration() {
  return navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: '/' });
}

async function saveSubscription(subscription: PushSubscription) {
  const response = await apiFetch('/me/web-push-subscriptions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription.toJSON())
  });
  if (!response.ok) throw new Error(`Web Push registration failed with status ${response.status}.`);
}

async function removeSubscription(subscription: PushSubscription) {
  const response = await apiFetch('/me/web-push-subscriptions', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription.toJSON())
  });
  if (!response.ok) throw new Error(`Web Push unregistration failed with status ${response.status}.`);
}

export async function getWebPushStatus(): Promise<WebPushStatus> {
  if (!browserSupportsPush() || !publicVapidKey) return 'unsupported';
  if (needsHomeScreenInstall()) return 'needs-install';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'not-enabled';
  try {
    const registration = await getRegistration();
    return await registration.pushManager.getSubscription() ? 'enabled' : 'not-enabled';
  } catch {
    return 'error';
  }
}

export async function enableWebPush(): Promise<WebPushStatus> {
  if (!browserSupportsPush() || !publicVapidKey) return 'unsupported';
  if (needsHomeScreenInstall()) return 'needs-install';
  if (Notification.permission === 'denied') return 'denied';
  try {
    // Start the request directly from the button press; never prompt during page load.
    const permissionPromise = Notification.permission === 'granted'
      ? Promise.resolve('granted' as NotificationPermission)
      : Notification.requestPermission();
    const registrationPromise = getRegistration();
    const permission = await permissionPromise;
    if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'not-enabled';
    const registration = await registrationPromise;
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeApplicationServerKey(publicVapidKey)
    });
    await saveSubscription(subscription);
    return 'enabled';
  } catch {
    return 'error';
  }
}

export async function disableWebPush(): Promise<WebPushStatus> {
  if (!browserSupportsPush()) return 'unsupported';
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await removeSubscription(subscription);
      await subscription.unsubscribe();
    }
    return Notification.permission === 'denied' ? 'denied' : 'not-enabled';
  } catch {
    return 'error';
  }
}

export function setActiveNotificationPathname(_pathname: string) {}

export async function registerCurrentPushDevice() {
  if (!browserSupportsPush() || !publicVapidKey || needsHomeScreenInstall() || Notification.permission !== 'granted') return;
  try {
    const registration = await getRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await saveSubscription(subscription);
  } catch (error) {
    console.warn('Existing Web Push subscription could not be synchronized', error);
  }
}

export function addPushTokenRefreshListener() { return noSubscription; }
export function addPushResponseListener(_listener: (data: Record<string, unknown>) => void) { return noSubscription; }
export async function consumeLastPushResponse(_listener: (data: Record<string, unknown>) => void) {}

export async function signOutWithPushCleanup() {
  try {
    if (browserSupportsPush()) {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removeSubscription(subscription);
        await subscription.unsubscribe();
      }
    }
  } catch (error) {
    console.warn('Web Push subscription could not be unregistered before logout', error);
  } finally {
    await authClient.signOut();
  }
}
