import { apiFetch } from './api';

export type PlanPerson = { memberId: string; displayName: string; avatar: string | null };

export type FamilyEvent = {
  id: string;
  familyId: string;
  createdByMemberId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: PlanPerson;
};

export type FamilyTask = {
  id: string;
  familyId: string;
  createdByMemberId: string;
  assignedMemberId: string | null;
  title: string;
  description: string | null;
  dueAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: PlanPerson;
  assignedTo: PlanPerson | null;
};

export type FamilyPlans = { events: FamilyEvent[]; tasks: FamilyTask[] };
export type EventInput = { title: string; description?: string; startsAt: string; endsAt?: string };
export type TaskInput = { title: string; description?: string; dueAt: string; assignedMemberId?: string | null };

export class PlansApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'PlansApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new PlansApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function getFamilyPlans(familyId: string) {
  return readResponse<FamilyPlans>(await apiFetch(`/families/${encodeURIComponent(familyId)}/plans`));
}

export async function createFamilyEvent(familyId: string, input: EventInput) {
  return readResponse<{ event: FamilyEvent }>(await apiFetch(`/families/${encodeURIComponent(familyId)}/plan-events`, jsonRequest('POST', input)));
}

export async function updateFamilyEvent(familyId: string, eventId: string, input: EventInput) {
  return readResponse<{ event: FamilyEvent }>(await apiFetch(`/families/${encodeURIComponent(familyId)}/plan-events/${encodeURIComponent(eventId)}`, jsonRequest('PATCH', input)));
}

export async function deleteFamilyEvent(familyId: string, eventId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/plan-events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
  if (!response.ok) await readResponse(response);
}

export async function createFamilyTask(familyId: string, input: TaskInput) {
  return readResponse<{ task: FamilyTask }>(await apiFetch(`/families/${encodeURIComponent(familyId)}/tasks`, jsonRequest('POST', input)));
}

export async function updateFamilyTask(familyId: string, taskId: string, input: TaskInput) {
  return readResponse<{ task: FamilyTask }>(await apiFetch(`/families/${encodeURIComponent(familyId)}/tasks/${encodeURIComponent(taskId)}`, jsonRequest('PATCH', input)));
}

export async function setFamilyTaskCompletion(familyId: string, taskId: string, completed: boolean) {
  return readResponse<{ task: FamilyTask }>(await apiFetch(`/families/${encodeURIComponent(familyId)}/tasks/${encodeURIComponent(taskId)}/completion`, jsonRequest('PATCH', { completed })));
}

export async function deleteFamilyTask(familyId: string, taskId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
  if (!response.ok) await readResponse(response);
}
