import { authClient } from './auth-client';
import { Platform } from 'react-native';

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787';

export async function apiFetch(path: string, init: RequestInit = {}) {
  const cookie = await authClient.getCookie();
  const headers = new Headers(init.headers);

  if (cookie && Platform.OS !== 'web') {
    headers.set('Cookie', cookie);
  }

  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers,
    credentials: Platform.OS === 'web' ? 'include' : 'omit'
  });
}
