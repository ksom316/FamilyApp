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

export type LockedTimeCapsule = TimeCapsuleSummary & { isLocked: true };
export type UnlockedTimeCapsule = TimeCapsuleSummary & {
  isLocked: false;
  message: string | null;
  memories: CapsuleMemory[];
};
export type TimeCapsuleDetail = LockedTimeCapsule | UnlockedTimeCapsule;

export type TimeCapsuleInput = {
  title?: string;
  message?: string | null;
  unlockAt?: string;
  memoryIds?: string[];
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

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
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

export async function createFamilyTimeCapsule(familyId: string, input: Required<Pick<TimeCapsuleInput, 'title' | 'unlockAt'>> & TimeCapsuleInput) {
  return readResponse<{ capsule: TimeCapsuleDetail; serverNow: string }>(
    await apiFetch(`/families/${encodeURIComponent(familyId)}/time-capsules`, jsonRequest('POST', input))
  );
}

export async function updateFamilyTimeCapsule(familyId: string, capsuleId: string, input: TimeCapsuleInput) {
  return readResponse<{ capsule: TimeCapsuleDetail; serverNow: string }>(
    await apiFetch(
      `/families/${encodeURIComponent(familyId)}/time-capsules/${encodeURIComponent(capsuleId)}`,
      jsonRequest('PATCH', input)
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
