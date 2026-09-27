import { Platform } from 'react-native';

export const PRODUCTION_API_URL = 'https://familyapp-api.ksom316.workers.dev';
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || (__DEV__ ? 'http://localhost:8787' : PRODUCTION_API_URL);
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);

function resolveApiUrl() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return configuredApiUrl.replace(/\/$/, '');
  }

  try {
    const apiUrl = new URL(configuredApiUrl);
    const pageHost = window.location.hostname;

    if (loopbackHosts.has(apiUrl.hostname) && loopbackHosts.has(pageHost)) {
      apiUrl.hostname = pageHost;
    }

    return apiUrl.toString().replace(/\/$/, '');
  } catch {
    return configuredApiUrl.replace(/\/$/, '');
  }
}

export const apiUrl = resolveApiUrl();
