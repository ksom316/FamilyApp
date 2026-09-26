import { apiFetch } from './api';

export type BriefingEvent = { id: string; title: string; startsAt: string; endsAt: string | null; allDay: boolean; location: string | null; route: string };
export type BriefingTask = { id: string; title: string; dueAt: string | null; status: 'overdue' | 'due_today' | 'upcoming'; route: string };
export type BriefingMenu = { id: string; name: string; meals: { mealType: string; mealName: string; note: string | null }[]; route: string };
export type BriefingShoppingList = { id: string; name: string; totalItems: number; remainingItems: number; route: string };
export type BriefingPoll = { id: string; question: string; closesAt: string | null; route: string };
export type BriefingCapsule = { id: string; title: string; unlockAt: string; route: string };

export type DailyBriefing = {
  date: string;
  serverNow: string;
  events: BriefingEvent[];
  tasks: BriefingTask[];
  menus: BriefingMenu[];
  shopping: BriefingShoppingList[];
  polls: BriefingPoll[];
  capsules: BriefingCapsule[];
};

export class DailyBriefingApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'DailyBriefingApiError';
  }
}

export async function getDailyBriefing(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/daily-briefing`);
  const body = await response.json() as DailyBriefing & { error?: string; code?: string };
  if (!response.ok) throw new DailyBriefingApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}
