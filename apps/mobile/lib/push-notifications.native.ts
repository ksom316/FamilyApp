import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { apiFetch } from './api';
import { authClient } from './auth-client';
import { readPushDestination, routesMatch } from './push-routing';

const TOKEN_STORAGE_KEY = 'familyapp.expoPushToken';
let activePathname = '';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, unknown>;
    const destination = readPushDestination(data);
    const alreadyViewing = destination ? routesMatch(activePathname, destination.route) : false;
    const critical = data.type === 'emergency_reported' || data.type === 'come_find_me_started';
    return {
      shouldShowBanner: !alreadyViewing,
      shouldShowList: !alreadyViewing,
      shouldPlaySound: !alreadyViewing && critical,
      shouldSetBadge: false
    };
  }
});

export function setActiveNotificationPathname(pathname: string) {
  activePathname = pathname;
}

async function configureAndroidChannels() {
  if (Platform.OS !== 'android') return;
  await Promise.all([
    Notifications.setNotificationChannelAsync('familyapp-default', {
      name: 'FamilyApp updates',
      description: 'Messages, tasks, calendar events, polls, and time capsules',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      sound: 'default',
      vibrationPattern: [0, 250]
    }),
    Notifications.setNotificationChannelAsync('familyapp-urgent', {
      name: 'Urgent family alerts',
      description: 'Emergency alerts and Come Find Me requests',
      importance: Notifications.AndroidImportance.MAX,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      sound: 'default',
      vibrationPattern: [0, 250, 150, 250]
    })
  ]);
}

async function permissionGranted() {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (existing.status !== 'undetermined' || !existing.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } });
  return requested.granted;
}

async function saveRegistration(expoPushToken: string) {
  const response = await apiFetch('/me/push-devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expoPushToken, platform: Platform.OS })
  });
  if (!response.ok) throw new Error(`Push registration failed with status ${response.status}.`);
  await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, expoPushToken);
}

export async function registerCurrentPushDevice() {
  if (!Device.isDevice || (Platform.OS !== 'android' && Platform.OS !== 'ios')) return;
  try {
    await configureAndroidChannels();
    if (!await permissionGranted()) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (typeof projectId !== 'string' || !projectId) throw new Error('EAS project ID is missing from Expo config.');
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    await saveRegistration(token.data);
  } catch (error) {
    console.warn('Push registration is unavailable', error);
  }
}

export function addPushTokenRefreshListener() {
  return Notifications.addPushTokenListener(() => {
    void registerCurrentPushDevice();
  });
}

export function addPushResponseListener(listener: (data: Record<string, unknown>) => void) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    listener(response.notification.request.content.data as Record<string, unknown>);
  });
}

export async function consumeLastPushResponse(listener: (data: Record<string, unknown>) => void) {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return;
  listener(response.notification.request.content.data as Record<string, unknown>);
  await Notifications.clearLastNotificationResponseAsync();
}

export async function signOutWithPushCleanup() {
  try {
    const expoPushToken = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
    if (expoPushToken) {
      await apiFetch('/me/push-devices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expoPushToken })
      });
      await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('Push device could not be unregistered before logout', error);
  } finally {
    await authClient.signOut();
  }
}
