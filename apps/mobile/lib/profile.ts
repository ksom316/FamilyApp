import { Platform } from 'react-native';

import { apiFetch } from './api';

export type AvatarConfig = {
  skinTone: 'light' | 'medium' | 'tan' | 'deep';
  hairstyle: 'bald' | 'short' | 'curly' | 'long' | 'bun';
  hairColor: 'black' | 'brown' | 'blonde' | 'red' | 'gray';
  expression: 'smile' | 'neutral' | 'grin' | 'wink';
  accessory: 'none' | 'glasses' | 'sunglasses';
  top: 'tshirt' | 'hoodie' | 'dress' | 'buttonup';
  background: 'peach' | 'sky' | 'mint' | 'lilac' | 'sun';
};

export const AVATAR_OPTIONS: { [K in keyof AvatarConfig]: readonly AvatarConfig[K][] } = {
  skinTone: ['light', 'medium', 'tan', 'deep'],
  hairstyle: ['bald', 'short', 'curly', 'long', 'bun'],
  hairColor: ['black', 'brown', 'blonde', 'red', 'gray'],
  expression: ['smile', 'neutral', 'grin', 'wink'],
  accessory: ['none', 'glasses', 'sunglasses'],
  top: ['tshirt', 'hoodie', 'dress', 'buttonup'],
  background: ['peach', 'sky', 'mint', 'lilac', 'sun']
};

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  skinTone: 'medium',
  hairstyle: 'short',
  hairColor: 'brown',
  expression: 'smile',
  accessory: 'none',
  top: 'tshirt',
  background: 'sky'
};

export type IdentityType = 'photo' | 'avatar' | 'initials';

export type ProfileIdentity = {
  identityType: IdentityType;
  avatarConfig: AvatarConfig | null;
  hasPhoto: boolean;
  avatar: string | null;
};

export class ProfileApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'ProfileApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new ProfileApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

export async function getMyIdentity() {
  const response = await apiFetch('/me/identity');
  return (await readResponse<{ identity: ProfileIdentity }>(response)).identity;
}

export async function setMyIdentity(identityType: IdentityType, avatarConfig?: AvatarConfig) {
  const response = await apiFetch('/me/identity', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identityType, avatarConfig })
  });
  return (await readResponse<{ identity: ProfileIdentity }>(response)).identity;
}

export async function uploadMyPhoto(file: { uri: string; name: string; type: string }) {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const fileResponse = await fetch(file.uri);
    const blob = await fileResponse.blob();
    form.append('file', blob, file.name);
  } else {
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  }
  const response = await apiFetch('/me/photo', { method: 'POST', body: form });
  return (await readResponse<{ identity: ProfileIdentity }>(response)).identity;
}

export async function removeMyPhoto() {
  const response = await apiFetch('/me/photo', { method: 'DELETE' });
  return (await readResponse<{ identity: ProfileIdentity }>(response)).identity;
}

export function myPhotoUrl() {
  return '/me/photo';
}

export function memberPhotoUrl(familyId: string, memberId: string) {
  return `/families/${encodeURIComponent(familyId)}/members/${encodeURIComponent(memberId)}/photo`;
}
