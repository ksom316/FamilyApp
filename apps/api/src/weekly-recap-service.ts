import type { Database } from '@familyapp/db';

import { listCalendarEvents } from './calendar-service';
import { listChores } from './chores-service';
import { requireFamilyMembership } from './family-service';
import { listMemories } from './memories-service';
import { listPolls } from './polls-service';
import { getMenuHome } from './saved-menus-service';
import { listShoppingLists } from './shopping-service';
import { listTimeCapsules } from './time-capsules-service';

const MAX_UPCOMING_EVENTS = 6;
const MAX_UPCOMING_TASKS = 5;
const MAX_UPCOMING_SHOPPING = 3;
const MAX_UPCOMING_POLLS = 3;
const MAX_UPCOMING_CAPSULES = 3;
const COMING_UP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Same convention as daily-briefing-service.ts and F19's notification sweep: Workers run
// their JS Date in UTC, the app has no per-user timezone setting, and FamilyApp's
// Ghana-based usage (UTC+0, no DST) means UTC day/week boundaries line up with the local
// calendar. "This week" uses a Monday-start week, matching the Monday-start convention
// family_saved_menus' TODAY_DAY_OF_WEEK already relies on.
function currentWeekBounds(now: Date) {
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayOfWeek = (todayStart.getUTCDay() + 6) % 7; // 0 = Monday
  const start = new Date(todayStart.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Mirrors daily-briefing-service.ts's shape and rules exactly: every section here calls
 * the same feature's own existing, authorized list function and only filters/sorts the
 * (small) result in memory. No new eligibility logic exists in this file — if a member
 * cannot see an item on its native screen, it was never in the array this filters, so it
 * can never appear in the recap either. This is a read: it never writes, and never reads
 * from family_notifications (notifications are an attention inbox, not an activity log).
 */
export async function getWeeklyRecap(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const now = new Date();
  const { start: weekStart, end: weekEnd } = currentWeekBounds(now);
  const comingUpEnd = new Date(now.getTime() + COMING_UP_WINDOW_MS);

  const [weekEvents, comingUpEvents, chores, menuHome, shoppingLists, polls, capsuleResult, memories] = await Promise.all([
    listCalendarEvents(db, userId, familyId, weekStart.toISOString(), weekEnd.toISOString()),
    listCalendarEvents(db, userId, familyId, now.toISOString(), comingUpEnd.toISOString()),
    listChores(db, userId, familyId),
    getMenuHome(db, userId, familyId),
    listShoppingLists(db, userId, familyId),
    listPolls(db, userId, familyId),
    listTimeCapsules(db, userId, familyId),
    listMemories(db, userId, familyId)
  ]);

  // --- This week highlights ---------------------------------------------------------
  const eventsThisWeek = weekEvents.filter((event) => event.startsAt.getTime() <= now.getTime()).length;

  // "Tasks completed" is deliberately just this member's own completions (myCompletedAt) —
  // listChores never exposes other assignees' completion timestamps in its summary shape,
  // and fetching each chore individually to get that would be the "substantial new work"
  // the spec says to avoid; this is the one count that's clean to establish today.
  const tasksCompletedThisWeek = chores.filter((chore) =>
    chore.myCompletedAt && chore.myCompletedAt.getTime() >= weekStart.getTime() && chore.myCompletedAt.getTime() < weekEnd.getTime()
  ).length;

  const pollsClosedThisWeek = polls.filter((poll) => {
    if (!poll.isClosed) return false;
    const closedMoment = poll.closedAt ?? poll.closesAt;
    return closedMoment && closedMoment.getTime() >= weekStart.getTime() && closedMoment.getTime() < weekEnd.getTime();
  }).length;

  const memoriesAddedThisWeek = memories.filter((memory) =>
    memory.createdAt.getTime() >= weekStart.getTime() && memory.createdAt.getTime() < weekEnd.getTime()
  ).length;

  // --- Coming up (next 7 days) -------------------------------------------------------
  const upcomingEvents = comingUpEvents
    .slice()
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, MAX_UPCOMING_EVENTS)
    .map((event) => ({ id: event.id, title: event.title, startsAt: event.startsAt, allDay: event.allDay, route: '/(family)/calendar' }));

  // Deliberately excludes already-overdue tasks — those are the Daily Briefing's job
  // (F20); this section is the forward-looking "due within the next week" outlook.
  const upcomingTasks = chores
    .filter((chore) => chore.isAssignedToMe && !chore.myCompletedAt && chore.dueAt && chore.dueAt.getTime() >= now.getTime() && chore.dueAt.getTime() < comingUpEnd.getTime())
    .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime())
    .slice(0, MAX_UPCOMING_TASKS)
    .map((chore) => ({ id: chore.id, title: chore.title, dueAt: chore.dueAt, route: `/(family)/tasks/${chore.id}` }));

  const upcomingShopping = shoppingLists
    .filter((list) => !list.isCompleted && list.shoppingDate && list.shoppingDate.getTime() >= now.getTime() && list.shoppingDate.getTime() < comingUpEnd.getTime())
    .sort((a, b) => a.shoppingDate!.getTime() - b.shoppingDate!.getTime())
    .slice(0, MAX_UPCOMING_SHOPPING)
    .map((list) => ({ id: list.id, name: list.name, shoppingDate: list.shoppingDate, remainingItems: list.remainingItems, totalItems: list.totalItems, route: `/(family)/shopping/${list.id}` }));

  const upcomingPolls = polls
    .filter((poll) => !poll.isClosed && poll.closesAt && poll.closesAt.getTime() >= now.getTime() && poll.closesAt.getTime() < comingUpEnd.getTime())
    .sort((a, b) => {
      if (a.myOptionId === null && b.myOptionId !== null) return -1;
      if (a.myOptionId !== null && b.myOptionId === null) return 1;
      return a.closesAt!.getTime() - b.closesAt!.getTime();
    })
    .slice(0, MAX_UPCOMING_POLLS)
    .map((poll) => ({ id: poll.id, question: poll.question, closesAt: poll.closesAt, needsVote: poll.myOptionId === null, route: `/(family)/polls/${poll.id}` }));

  const upcomingCapsules = capsuleResult.capsules
    .filter((capsule) => capsule.isLocked && capsule.unlockAt.getTime() < comingUpEnd.getTime())
    .sort((a, b) => a.unlockAt.getTime() - b.unlockAt.getTime())
    .slice(0, MAX_UPCOMING_CAPSULES)
    .map((capsule) => ({ id: capsule.id, title: capsule.title, unlockAt: capsule.unlockAt, route: '/(family)/capsules' }));

  // Menus: deliberately minimal per spec — F20's Daily Briefing already shows today's
  // meals for each active menu, so the recap just names which menus are currently active.
  const upcomingMenus = menuHome.activeMenus.map((menu) => ({ id: menu.id, name: menu.name, route: '/(family)/menu' }));

  return {
    week: { start: weekStart.toISOString(), end: weekEnd.toISOString() },
    serverNow: now.toISOString(),
    memberId: membership.id,
    highlights: {
      tasksCompleted: tasksCompletedThisWeek,
      events: eventsThisWeek,
      pollsClosed: pollsClosedThisWeek,
      memoriesAdded: memoriesAddedThisWeek
    },
    upcoming: {
      events: upcomingEvents,
      tasks: upcomingTasks,
      shopping: upcomingShopping,
      polls: upcomingPolls,
      capsules: upcomingCapsules,
      menus: upcomingMenus
    }
  };
}
