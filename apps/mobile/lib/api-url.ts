import { Platform } from 'react-native';

import { resolveClientApiUrl } from './api-origin';

export const PRODUCTION_API_URL = 'https://familyapp-api.ksom316.workers.dev';
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || (__DEV__ ? 'http://localhost:8787' : PRODUCTION_API_URL);

function resolveApiUrl() {
  // React Native's core polyfills unconditionally set `global.window = global` on every
  // platform (see react-native/Libraries/Core/setUpGlobals.js), so `typeof window` is never
  // 'undefined' on native. Only a real browser's `window` has `.location`, so gate on
  // Platform.OS instead of window's presence before touching `window.location.href`.
  const browserUrl = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location?.href : undefined;
  return resolveClientApiUrl(configuredApiUrl, Platform.OS, browserUrl);
}

export const apiUrl = resolveApiUrl();
