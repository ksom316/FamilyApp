import { apiFetch } from './api';

export type FamilyMembership = {
  id: string;
  familyId: string;
  familyName: string;
  role: 'owner' | 'guardian' | 'member';
  joinedAt: string;
};

export type FamilyMember = {
  id: string;
  userId: string;
  displayName: string;
  avatar: string | null;
  role: 'owner' | 'guardian' | 'member';
  joinedAt: string;
};

export type FamilyInvitation = {
  id: string;
  role: 'member' | 'guardian';
  expiresAt: string;
  token: string;
};

export class FamilyApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'FamilyApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new FamilyApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

export async function getFamilyMemberships() {
  const response = await apiFetch('/families/memberships');
  return (await readResponse<{ memberships: FamilyMembership[] }>(response)).memberships;
}

export async function createFamily(name: string) {
  const response = await apiFetch('/families', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  return readResponse<{ family: { id: string; name: string }; membership: FamilyMembership }>(response);
}

export async function acceptFamilyInvitation(token: string) {
  const response = await apiFetch('/families/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  return readResponse<{ familyId: string; status: 'accepted' | 'already_member' }>(response);
}

export async function getFamilyMembers(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/members`);
  return (await readResponse<{ members: FamilyMember[] }>(response)).members;
}

export async function createFamilyInvitation(familyId: string, role: FamilyInvitation['role']) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role })
  });
  return (await readResponse<{ invitation: FamilyInvitation }>(response)).invitation;
}
