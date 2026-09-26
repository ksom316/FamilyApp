import { apiFetch } from './api';

export type CalendarTimelineSource = 'calendar' | 'task' | 'shopping' | 'poll' | 'capsule';

export type CalendarTimelineItem = {
  id: string;
  source: CalendarTimelineSource;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  route: string;
  metadata: Record<string, unknown>;
};

export type CalendarTimeline = { from: string; to: string; items: CalendarTimelineItem[] };

export class CalendarTimelineApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'CalendarTimelineApiError';
  }
}

export async function getCalendarTimeline(familyId: string, from: string, to: string) {
  const params = new URLSearchParams({ from, to });
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/calendar/timeline?${params.toString()}`);
  const body = await response.json() as CalendarTimeline & { error?: string; code?: string };
  if (!response.ok) throw new CalendarTimelineApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}
