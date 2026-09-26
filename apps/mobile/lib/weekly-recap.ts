import { apiFetch } from './api';

export type RecapUpcomingEvent = { id: string; title: string; startsAt: string; allDay: boolean; route: string };
export type RecapUpcomingTask = { id: string; title: string; dueAt: string | null; route: string };
export type RecapUpcomingShopping = { id: string; name: string; shoppingDate: string | null; remainingItems: number; totalItems: number; route: string };
export type RecapUpcomingPoll = { id: string; question: string; closesAt: string | null; needsVote: boolean; route: string };
export type RecapUpcomingCapsule = { id: string; title: string; unlockAt: string; route: string };
export type RecapUpcomingMenu = { id: string; name: string; route: string };

export type WeeklyRecap = {
  week: { start: string; end: string };
  serverNow: string;
  highlights: {
    tasksCompleted: number;
    events: number;
    pollsClosed: number;
    memoriesAdded: number;
  };
  upcoming: {
    events: RecapUpcomingEvent[];
    tasks: RecapUpcomingTask[];
    shopping: RecapUpcomingShopping[];
    polls: RecapUpcomingPoll[];
    capsules: RecapUpcomingCapsule[];
    menus: RecapUpcomingMenu[];
  };
};

export class WeeklyRecapApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'WeeklyRecapApiError';
  }
}

export async function getWeeklyRecap(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/weekly-recap`);
  const body = await response.json() as WeeklyRecap & { error?: string; code?: string };
  if (!response.ok) throw new WeeklyRecapApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}
