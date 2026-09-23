import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787';

export const authClient = createAuthClient({
  baseURL: apiUrl,
  plugins: [
    expoClient({
      scheme: 'familyapp',
      storagePrefix: 'familyapp',
      storage: SecureStore
    })
  ]
});
