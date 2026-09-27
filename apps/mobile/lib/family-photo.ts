import { Platform } from 'react-native';

import { apiFetch } from './api';

export class FamilyPhotoApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'FamilyPhotoApiError';
  }
}

async function readError(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string; code?: string };
  throw new FamilyPhotoApiError(body.error ?? 'The family photo could not be updated.', body.code);
}

export function familyPhotoUrl(familyId: string, version: string | number) {
  return `/families/${encodeURIComponent(familyId)}/photo?v=${encodeURIComponent(String(version))}`;
}

export async function uploadFamilyPhoto(familyId: string, file: { uri: string; name: string; type: string }) {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const response = await fetch(file.uri);
    form.append('file', await response.blob(), file.name);
  } else {
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  }
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/photo`, { method: 'POST', body: form });
  if (!response.ok) await readError(response);
  return (await response.json() as { photo: { version: string } }).photo;
}

export async function removeFamilyPhoto(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/photo`, { method: 'DELETE' });
  if (!response.ok) await readError(response);
}
