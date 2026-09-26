import { Platform } from 'react-native';

import { apiFetch } from './api';
import type { AvatarConfig } from './profile';

export type MemoryPerson = {
  memberId: string;
  displayName: string;
  avatar: string | null;
  identityType: string;
  avatarConfig: AvatarConfig | null;
  hasPhoto: boolean;
};

export type FamilyMemory = {
  id: string;
  familyId: string;
  createdByMemberId: string;
  title: string | null;
  memoryDate: string;
  mediaType: 'image';
  mimeType: string;
  fileSizeBytes: number;
  createdAt: string;
  updatedAt: string;
  sharedBy: MemoryPerson;
  favoritesCount: number;
  isFavorited: boolean;
};

export type NewMemoryInput = {
  title?: string;
  memoryDate: string;
  file: { uri: string; name: string; type: string };
};

export type UpdateMemoryInput = { title?: string | null; memoryDate?: string };

export class MemoriesApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'MemoriesApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new MemoriesApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

export function memoryMediaPath(familyId: string, memoryId: string) {
  return `/families/${encodeURIComponent(familyId)}/memories/${encodeURIComponent(memoryId)}/media`;
}

export async function getFamilyMemories(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/memories`);
  return (await readResponse<{ memories: FamilyMemory[] }>(response)).memories;
}

export async function getFamilyMemory(familyId: string, memoryId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/memories/${encodeURIComponent(memoryId)}`);
  return (await readResponse<{ memory: FamilyMemory }>(response)).memory;
}

export async function createFamilyMemory(familyId: string, input: NewMemoryInput) {
  const formData = new FormData();
  if (input.title) formData.append('title', input.title);
  formData.append('memoryDate', input.memoryDate);

  if (Platform.OS === 'web') {
    const fileResponse = await fetch(input.file.uri);
    const blob = await fileResponse.blob();
    formData.append('file', blob, input.file.name);
  } else {
    formData.append('file', { uri: input.file.uri, name: input.file.name, type: input.file.type } as unknown as Blob);
  }

  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/memories`, { method: 'POST', body: formData });
  return (await readResponse<{ memory: FamilyMemory }>(response)).memory;
}

export async function updateFamilyMemory(familyId: string, memoryId: string, input: UpdateMemoryInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/memories/${encodeURIComponent(memoryId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  return (await readResponse<{ memory: FamilyMemory }>(response)).memory;
}

export async function deleteFamilyMemory(familyId: string, memoryId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/memories/${encodeURIComponent(memoryId)}`, { method: 'DELETE' });
  if (!response.ok) await readResponse(response);
}

export async function favoriteFamilyMemory(familyId: string, memoryId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/memories/${encodeURIComponent(memoryId)}/favorite`, { method: 'POST' });
  if (!response.ok) await readResponse(response);
}

export async function unfavoriteFamilyMemory(familyId: string, memoryId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/memories/${encodeURIComponent(memoryId)}/favorite`, { method: 'DELETE' });
  if (!response.ok) await readResponse(response);
}
