import { apiFetch } from './api';

export type CalendarPerson = { memberId: string; displayName: string; avatar: string | null };
export type CalendarAudience =
  | { type: 'family' }
  | { type: 'household'; household: { id: string; name: string } }
  | { type: 'members'; members: CalendarPerson[] };

export type CalendarEvent = {
  id: string;
  familyId: string;
  createdByMemberId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  allDay: boolean;
  audience: CalendarAudience;
  createdBy: CalendarPerson;
  createdAt: string;
  updatedAt: string;
};

type BaseEventInput = {
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  allDay: boolean;
};

export type CalendarEventInput = BaseEventInput & (
  | { audienceType: 'family' }
  | { audienceType: 'household'; householdId: string }
  | { audienceType: 'members'; memberIds: string[] }
);

export class CalendarApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'CalendarApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new CalendarApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function eventsPath(familyId: string) {
  return `/families/${encodeURIComponent(familyId)}/events`;
}

export async function getCalendarEvents(familyId: string, from: string, to: string) {
  const params = new URLSearchParams({ from, to });
  const response = await apiFetch(`${eventsPath(familyId)}?${params.toString()}`);
  return (await readResponse<{ events: CalendarEvent[] }>(response)).events;
}

export async function getCalendarEvent(familyId: string, eventId: string) {
  const response = await apiFetch(`${eventsPath(familyId)}/${encodeURIComponent(eventId)}`);
  return (await readResponse<{ event: CalendarEvent }>(response)).event;
}

export async function createCalendarEvent(familyId: string, input: CalendarEventInput) {
  const response = await apiFetch(eventsPath(familyId), jsonRequest('POST', input));
  return (await readResponse<{ event: CalendarEvent }>(response)).event;
}

export async function updateCalendarEvent(familyId: string, eventId: string, input: CalendarEventInput) {
  const response = await apiFetch(`${eventsPath(familyId)}/${encodeURIComponent(eventId)}`, jsonRequest('PATCH', input));
  return (await readResponse<{ event: CalendarEvent }>(response)).event;
}

export async function deleteCalendarEvent(familyId: string, eventId: string) {
  const response = await apiFetch(`${eventsPath(familyId)}/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
  if (!response.ok) await readResponse(response);
}

export function formatCalendarAudience(audience: CalendarAudience) {
  if (audience.type === 'family') return 'Entire family';
  if (audience.type === 'household') return audience.household.name;
  if (audience.members.length === 1) return audience.members[0]?.displayName ?? 'One person';
  return `${audience.members.length} specific people`;
}
