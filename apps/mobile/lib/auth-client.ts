import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { apiUrl } from './api-url';

export const authClient = createAuthClient({
  baseURL: apiUrl,
  fetchOptions: Platform.OS === 'web' ? { credentials: 'include' } : undefined,
  plugins: [
    expoClient({
      scheme: 'familyapp',
      storagePrefix: 'familyapp',
      storage: SecureStore
    })
  ]
});
