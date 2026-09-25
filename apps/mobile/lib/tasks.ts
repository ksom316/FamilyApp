import { apiFetch } from './api';
import type { AvatarConfig } from './profile';

export type TaskPerson = {
  memberId: string;
  displayName: string;
  avatar: string | null;
  identityType: string;
  avatarConfig: AvatarConfig | null;
  hasPhoto: boolean;
};
export type TaskAudience =
  | { type: 'family' }
  | { type: 'household'; household: { id: string; name: string } }
  | { type: 'members' };

export type TaskSummary = {
  id: string;
  familyId: string;
  title: string;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: TaskPerson;
  isCreator: boolean;
  audience: TaskAudience;
  totalAssignees: number;
  completedAssignees: number;
  isAssignedToMe: boolean;
  myCompletedAt: string | null;
};

export type TaskAssignee = TaskPerson & { completedAt: string | null };

export type TaskDetail = {
  id: string;
  familyId: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: TaskPerson;
  isCreator: boolean;
  audience: TaskAudience;
  assignees: TaskAssignee[];
  totalAssignees: number;
  completedAssignees: number;
  isAssignedToMe: boolean;
  myCompletedAt: string | null;
};

type BaseTaskInput = { title: string; description?: string | null; dueAt?: string | null };

export type TaskInput = BaseTaskInput & (
  | { audienceType: 'family' }
  | { audienceType: 'household'; householdId: string }
  | { audienceType: 'members'; memberIds: string[] }
);

export type UpdateTaskInput =
  | (BaseTaskInput & { audienceType?: undefined })
  | (BaseTaskInput & { audienceType: 'family' })
  | (BaseTaskInput & { audienceType: 'household'; householdId: string })
  | (BaseTaskInput & { audienceType: 'members'; memberIds: string[] });

export class TaskApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'TaskApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new TaskApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// "/chores" on purpose — Plans already owns "/families/:familyId/tasks" for its own
// unrelated single-assignee to-do list. See index.ts for the full explanation; this only
// affects the API path, not the "Tasks" screen name shown to users.
function tasksPath(familyId: string) {
  return `/families/${encodeURIComponent(familyId)}/chores`;
}

export async function getFamilyTasks(familyId: string) {
  const response = await apiFetch(tasksPath(familyId));
  return (await readResponse<{ tasks: TaskSummary[] }>(response)).tasks;
}

export async function getFamilyTask(familyId: string, taskId: string) {
  const response = await apiFetch(`${tasksPath(familyId)}/${encodeURIComponent(taskId)}`);
  return (await readResponse<{ task: TaskDetail }>(response)).task;
}

export async function createFamilyTask(familyId: string, input: TaskInput) {
  const response = await apiFetch(tasksPath(familyId), jsonRequest('POST', input));
  return (await readResponse<{ task: TaskDetail }>(response)).task;
}

export async function updateFamilyTask(familyId: string, taskId: string, input: UpdateTaskInput) {
  const response = await apiFetch(`${tasksPath(familyId)}/${encodeURIComponent(taskId)}`, jsonRequest('PATCH', input));
  return (await readResponse<{ task: TaskDetail }>(response)).task;
}

export async function deleteFamilyTask(familyId: string, taskId: string) {
  const response = await apiFetch(`${tasksPath(familyId)}/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
  if (!response.ok) await readResponse(response);
}

export async function setTaskCompletion(familyId: string, taskId: string, completed: boolean) {
  const response = await apiFetch(`${tasksPath(familyId)}/${encodeURIComponent(taskId)}/completion`, jsonRequest('PATCH', { completed }));
  return (await readResponse<{ task: TaskDetail }>(response)).task;
}

export function formatTaskAudience(audience: TaskAudience, totalAssignees: number) {
  if (audience.type === 'family') return 'Entire family';
  if (audience.type === 'household') return audience.household.name;
  return totalAssignees === 1 ? 'Just me' : `${totalAssignees} specific people`;
}
