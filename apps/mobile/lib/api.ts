import { Platform } from 'react-native';

import { authClient } from './auth-client';
import { apiUrl } from './api-url';

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);

  if (Platform.OS !== 'web') {
    const cookie = await authClient.getCookie();
    if (cookie) headers.set('Cookie', cookie);
  }

  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers,
    credentials: Platform.OS === 'web' ? 'include' : 'omit'
  });
}
