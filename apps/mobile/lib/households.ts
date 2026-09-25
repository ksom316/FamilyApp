import { apiFetch } from './api';

export type HouseholdMember = { memberId: string; displayName: string; avatar: string | null; role: 'owner' | 'guardian' | 'member' };

export type Household = {
  id: string;
  familyId: string;
  name: string;
  description: string | null;
  createdByMemberId: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
};

export type HouseholdRecord = Omit<Household, 'memberCount'>;
export type HouseholdDetail = { household: HouseholdRecord; members: HouseholdMember[] };
export type HouseholdInput = { name: string; description?: string | null };

export class HouseholdApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'HouseholdApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new HouseholdApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function getFamilyHouseholds(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/households`);
  return (await readResponse<{ households: Household[] }>(response)).households;
}

export async function getFamilyHousehold(familyId: string, householdId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/households/${encodeURIComponent(householdId)}`);
  return readResponse<HouseholdDetail>(response);
}

export async function createFamilyHousehold(familyId: string, input: HouseholdInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/households`, jsonRequest('POST', input));
  return readResponse<HouseholdDetail>(response);
}

export async function updateFamilyHousehold(familyId: string, householdId: string, input: HouseholdInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/households/${encodeURIComponent(householdId)}`, jsonRequest('PATCH', input));
  return readResponse<HouseholdDetail>(response);
}

export async function deleteFamilyHousehold(familyId: string, householdId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/households/${encodeURIComponent(householdId)}`, { method: 'DELETE' });
  if (!response.ok) await readResponse(response);
}

export async function addFamilyHouseholdMember(familyId: string, householdId: string, memberId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/households/${encodeURIComponent(householdId)}/members`, jsonRequest('POST', { memberId }));
  return readResponse<HouseholdDetail>(response);
}

export async function removeFamilyHouseholdMember(familyId: string, householdId: string, memberId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' });
  return readResponse<HouseholdDetail>(response);
}
