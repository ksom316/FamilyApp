import { Platform } from 'react-native';

import { resolveClientApiUrl } from './api-origin';

export const PRODUCTION_API_URL = 'https://familyapp-api.ksom316.workers.dev';
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || (__DEV__ ? 'http://localhost:8787' : PRODUCTION_API_URL);

function resolveApiUrl() {
  return resolveClientApiUrl(
    configuredApiUrl,
    Platform.OS,
    typeof window === 'undefined' ? undefined : window.location.href
  );
}

export const apiUrl = resolveApiUrl();
