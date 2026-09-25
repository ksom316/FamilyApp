import { Platform } from 'react-native';

import { apiFetch } from './api';

export type CapsuleCreator = { memberId: string; displayName: string; avatar: string | null };

export type TimeCapsuleSummary = {
  id: string;
  familyId: string;
  createdByMemberId: string;
  title: string;
  unlockAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: CapsuleCreator;
  isLocked: boolean;
};

export type CapsuleMemory = {
  id: string;
  familyId: string;
  title: string | null;
  memoryDate: string;
  sharedBy: CapsuleCreator;
};

export type CapsulePrivateAttachment = {
  id: string;
  familyId: string;
  capsuleId: string;
  mimeType: string;
};

export type CapsulePhotoInput = { uri: string; name: string; type: string };
export type LockedTimeCapsule = TimeCapsuleSummary & { isLocked: true };
export type UnlockedTimeCapsule = TimeCapsuleSummary & {
  isLocked: false;
  message: string | null;
  memories: CapsuleMemory[];
  privateAttachments: CapsulePrivateAttachment[];
};
export type TimeCapsuleDetail = LockedTimeCapsule | UnlockedTimeCapsule;

export type TimeCapsuleInput = {
  title?: string;
  message?: string | null;
  unlockAt?: string;
  memoryIds?: string[];
  privatePhotos?: CapsulePhotoInput[];
  replacePrivatePhotos?: boolean;
};

export class TimeCapsulesApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'TimeCapsulesApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new TimeCapsulesApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

async function formRequest(method: string, input: TimeCapsuleInput) {
  const form = new FormData();
  if (input.title !== undefined) form.append('title', input.title);
  if (input.message !== undefined) form.append('message', input.message ?? '');
  if (input.unlockAt !== undefined) form.append('unlockAt', input.unlockAt);
  if (input.memoryIds !== undefined) form.append('memoryIds', JSON.stringify(input.memoryIds));
  if (input.replacePrivatePhotos) form.append('replacePrivatePhotos', 'true');

  for (const photo of input.privatePhotos ?? []) {
    if (Platform.OS === 'web') {
      const response = await fetch(photo.uri);
      form.append('privatePhotos', await response.blob(), photo.name);
    } else {
      form.append('privatePhotos', { uri: photo.uri, name: photo.name, type: photo.type } as unknown as Blob);
    }
  }
  return { method, body: form };
}

export function privateCapsuleAttachmentMediaPath(familyId: string, capsuleId: string, attachmentId: string) {
  return `/families/${encodeURIComponent(familyId)}/time-capsules/${encodeURIComponent(capsuleId)}/attachments/${encodeURIComponent(attachmentId)}/media`;
}

export async function getFamilyTimeCapsules(familyId: string) {
  return readResponse<{ capsules: TimeCapsuleSummary[]; serverNow: string }>(
    await apiFetch(`/families/${encodeURIComponent(familyId)}/time-capsules`)
  );
}

export async function getFamilyTimeCapsule(familyId: string, capsuleId: string) {
  return readResponse<{ capsule: TimeCapsuleDetail; serverNow: string }>(
    await apiFetch(`/families/${encodeURIComponent(familyId)}/time-capsules/${encodeURIComponent(capsuleId)}`)
  );
}

export async function createFamilyTimeCapsule(
  familyId: string,
  input: Required<Pick<TimeCapsuleInput, 'title' | 'unlockAt'>> & TimeCapsuleInput
) {
  return readResponse<{ capsule: TimeCapsuleDetail; serverNow: string }>(
    await apiFetch(`/families/${encodeURIComponent(familyId)}/time-capsules`, await formRequest('POST', input))
  );
}

export async function updateFamilyTimeCapsule(familyId: string, capsuleId: string, input: TimeCapsuleInput) {
  return readResponse<{ capsule: TimeCapsuleDetail; serverNow: string }>(
    await apiFetch(
      `/families/${encodeURIComponent(familyId)}/time-capsules/${encodeURIComponent(capsuleId)}`,
      await formRequest('PATCH', input)
    )
  );
}

export async function deleteFamilyTimeCapsule(familyId: string, capsuleId: string) {
  const response = await apiFetch(
    `/families/${encodeURIComponent(familyId)}/time-capsules/${encodeURIComponent(capsuleId)}`,
    { method: 'DELETE' }
  );
  if (!response.ok) await readResponse(response);
}
