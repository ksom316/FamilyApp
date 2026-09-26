import type { Database } from '@familyapp/db';

import { CalendarServiceError, listCalendarEvents } from './calendar-service';
import { listChores } from './chores-service';
import { requireFamilyMembership } from './family-service';
import { listPolls } from './polls-service';
import { listShoppingLists } from './shopping-service';
import { listTimeCapsules } from './time-capsules-service';

// Deliberately smaller than Calendar's own 366-day cap on /events: that endpoint reads one
// table, range-filtered in SQL. This one additionally pulls every eligible chore/shopping
// list/poll/capsule (those services return the caller's full eligible set, not a
// range-filtered slice — see the per-source comments below) and filters to the window in
// memory, so a request-side cap keeps that bounded regardless of how far out the range is.
const MAX_RANGE_MS = 120 * 24 * 60 * 60 * 1000;

function readRange(rawFrom: unknown, rawTo: unknown) {
  if (typeof rawFrom !== 'string' || typeof rawTo !== 'string') {
    throw new CalendarServiceError('invalid_range', 'A valid from/to range is required.');
  }
  const from = new Date(rawFrom);
  const to = new Date(rawTo);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new CalendarServiceError('invalid_range', 'A valid from/to range is required.');
  }
  if (to.getTime() <= from.getTime()) {
    throw new CalendarServiceError('invalid_range', 'Range end must be after range start.');
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    throw new CalendarServiceError('invalid_range', 'Calendar timeline ranges may cover at most 120 days.');
  }
  return { from, to };
}

function inRange(moment: Date, from: Date, to: Date) {
  return moment.getTime() >= from.getTime() && moment.getTime() < to.getTime();
}

export type CalendarTimelineItem = {
  id: string;
  source: 'calendar' | 'task' | 'shopping' | 'poll' | 'capsule';
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  route: string;
  metadata: Record<string, unknown>;
};

/**
 * The unified Family Calendar timeline: manual calendar events exactly as before, plus a
 * dynamically-aggregated, read-only view of other features' own dated items. Nothing here
 * is copied into family_calendar_events or any new table — every non-"calendar" item is
 * derived fresh, on every request, from that feature's own existing authorized list
 * function (the same pattern daily-briefing-service.ts and weekly-recap-service.ts use).
 * If a member can't see an item on its native screen, it was never in the array this
 * filters, so it can never appear on the unified Calendar either.
 */
export async function getCalendarTimeline(db: Database, userId: string, familyId: string, rawFrom: unknown, rawTo: unknown) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const { from, to } = readRange(rawFrom, rawTo);

  const [events, chores, shoppingLists, polls, capsuleResult] = await Promise.all([
    listCalendarEvents(db, userId, familyId, from.toISOString(), to.toISOString()),
    listChores(db, userId, familyId),
    listShoppingLists(db, userId, familyId),
    listPolls(db, userId, familyId),
    listTimeCapsules(db, userId, familyId)
  ]);

  const items: CalendarTimelineItem[] = [];

  for (const event of events) {
    items.push({
      id: `calendar:${event.id}`,
      source: 'calendar',
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt ? event.endsAt.toISOString() : null,
      allDay: event.allDay,
      route: '/(family)/calendar',
      metadata: { editable: event.createdByMemberId === membership.id, eventId: event.id }
    });
  }

  // Tasks: only this member's own assignments — listChores already scopes "visible" chores
  // to the caller's own creations/assignments, and isAssignedToMe narrows to assignments
  // specifically, so nobody else's assignment is ever exposed here.
  for (const chore of chores) {
    if (!chore.isAssignedToMe || !chore.dueAt || !inRange(chore.dueAt, from, to)) continue;
    items.push({
      id: `task:${chore.id}`,
      source: 'task',
      title: `Task due: ${chore.title}`,
      startsAt: chore.dueAt.toISOString(),
      endsAt: null,
      allDay: false,
      route: `/(family)/tasks/${chore.id}`,
      metadata: { completed: Boolean(chore.myCompletedAt) }
    });
  }

  // Shopping: listShoppingLists already applies the family/household eligibility check —
  // a household list only appears here for a member of that household. Completed lists are
  // kept visible on their original shoppingDate (a plain historical record of "shopping
  // happened/was planned that day"), same as a past calendar event stays visible.
  for (const list of shoppingLists) {
    if (!list.shoppingDate || !inRange(list.shoppingDate, from, to)) continue;
    items.push({
      id: `shopping:${list.id}`,
      source: 'shopping',
      title: `Shopping: ${list.name}`,
      startsAt: list.shoppingDate.toISOString(),
      endsAt: null,
      allDay: true,
      route: `/(family)/shopping/${list.id}`,
      metadata: { completed: list.isCompleted, remainingItems: list.remainingItems, totalItems: list.totalItems }
    });
  }

  // Polls: listPolls already applies the family/household eligibility check. Only the
  // closing timestamp and question are surfaced — never option text, vote counts, or who
  // voted. Closed polls stay visible on their closing date, same rationale as shopping.
  for (const poll of polls) {
    if (!poll.closesAt || !inRange(poll.closesAt, from, to)) continue;
    items.push({
      id: `poll:${poll.id}`,
      source: 'poll',
      title: `Poll closes: ${poll.question}`,
      startsAt: poll.closesAt.toISOString(),
      endsAt: null,
      allDay: false,
      route: `/(family)/polls/${poll.id}`,
      metadata: { closed: poll.isClosed, needsVote: poll.myOptionId === null }
    });
  }

  // Time Capsules: listTimeCapsules already returns metadata only (title, unlockAt,
  // isLocked) — never the sealed message, private attachments, object keys, or attachment
  // ids, whether or not the capsule has unlocked yet. Whole-family, no extra audience check
  // needed (matches F19/F20/F21's same finding for this table).
  for (const capsule of capsuleResult.capsules) {
    if (!inRange(capsule.unlockAt, from, to)) continue;
    items.push({
      id: `capsule:${capsule.id}`,
      source: 'capsule',
      title: `Time Capsule opens: ${capsule.title}`,
      startsAt: capsule.unlockAt.toISOString(),
      endsAt: null,
      allDay: false,
      route: '/(family)/capsules',
      metadata: { locked: capsule.isLocked }
    });
  }

  items.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  return { from: from.toISOString(), to: to.toISOString(), items };
}
