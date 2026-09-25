import { apiFetch } from './api';

export type PollPerson = { memberId: string; displayName: string; avatar: string | null };
export type PollOption = { id: string; text: string; votes: number; percentage: number };

export type Poll = {
  id: string;
  familyId: string;
  household: { id: string; name: string } | null;
  question: string;
  description: string | null;
  closesAt: string | null;
  closedAt: string | null;
  isClosed: boolean;
  createdByMemberId: string;
  createdBy: PollPerson;
  createdAt: string;
  updatedAt: string;
  totalVotes: number;
  myOptionId: string | null;
  options: PollOption[];
};

export type CreatePollInput = {
  question: string;
  description?: string;
  options: string[];
  closesAt?: string;
  householdId?: string;
};

export class PollApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'PollApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new PollApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function getFamilyPolls(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/polls`);
  return (await readResponse<{ polls: Poll[] }>(response)).polls;
}

export async function getFamilyPoll(familyId: string, pollId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/polls/${encodeURIComponent(pollId)}`);
  return (await readResponse<{ poll: Poll }>(response)).poll;
}

export async function createFamilyPoll(familyId: string, input: CreatePollInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/polls`, jsonRequest('POST', input));
  return (await readResponse<{ poll: Poll }>(response)).poll;
}

export async function voteOnFamilyPoll(familyId: string, pollId: string, optionId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/polls/${encodeURIComponent(pollId)}/vote`, jsonRequest('POST', { optionId }));
  return (await readResponse<{ poll: Poll }>(response)).poll;
}

export async function closeFamilyPoll(familyId: string, pollId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/polls/${encodeURIComponent(pollId)}/close`, { method: 'POST' });
  return (await readResponse<{ poll: Poll }>(response)).poll;
}

export async function deleteFamilyPoll(familyId: string, pollId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/polls/${encodeURIComponent(pollId)}`, { method: 'DELETE' });
  if (!response.ok) await readResponse(response);
}
