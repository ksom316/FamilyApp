import { apiFetch } from './api';
import type { AvatarConfig } from './profile';

export const CHECK_IN_STATUSES = ['safe', 'arrived'] as const;
export type CheckInStatus = (typeof CHECK_IN_STATUSES)[number];

export type CheckInPerson = {
  memberId: string;
  displayName: string;
  avatar: string | null;
  identityType: string;
  avatarConfig: AvatarConfig | null;
  hasPhoto: boolean;
};

export type FamilyCheckIn = {
  id: string;
  status: CheckInStatus;
  message: string | null;
  createdAt: string;
  member: CheckInPerson;
};

export type CreateCheckInInput = { status: CheckInStatus; message?: string | null };

export class CheckInApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'CheckInApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new CheckInApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

export async function getFamilyCheckIns(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/check-ins`);
  return (await readResponse<{ checkIns: FamilyCheckIn[] }>(response)).checkIns;
}

export async function postCheckIn(familyId: string, input: CreateCheckInInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/check-ins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  return (await readResponse<{ checkIn: FamilyCheckIn }>(response)).checkIn;
}
