import type { Database } from '@familyapp/db';

import { listCalendarEvents } from './calendar-service';
import { listChores } from './chores-service';
import { requireFamilyMembership } from './family-service';
import { listPolls } from './polls-service';
import { getMenuHome } from './saved-menus-service';
import { listShoppingLists } from './shopping-service';
import { listTimeCapsules } from './time-capsules-service';

const MAX_EVENTS = 6;
const MAX_TASKS = 5;
const MAX_SHOPPING_LISTS = 3;
const MAX_POLLS = 3;
const MAX_CAPSULES = 3;

// Cloudflare Workers run their JS Date in UTC, and this app has no per-user timezone
// setting anywhere (by design, per F20 scope), so "today" is computed from UTC day
// boundaries — the same convention family_saved_menus' TODAY_DAY_OF_WEEK already relies on.
// For FamilyApp's Ghana-based usage (UTC+0, no DST) this lines up exactly with the local
// calendar day; it would need a real per-user timezone to stay correct for other zones,
// which is deliberately out of scope here.
function todayBounds(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, dateKey: start.toISOString().slice(0, 10) };
}

/**
 * A single read-only aggregation over data that already exists elsewhere — this never
 * writes anything, never generates a notification, and never duplicates a feature's own
 * eligibility logic. Every section below calls that feature's own existing list function
 * (the same one its own screen uses), then simply filters/sorts the small result down to
 * "what matters today" in memory. That is the entire source of the privacy guarantee: if a
 * member cannot see an event/task/menu/list/poll on its own screen, it was never in the
 * array handed to this filter, so it can never appear in the briefing either.
 */
export async function getDailyBriefing(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const now = new Date();
  const { start, end, dateKey } = todayBounds(now);

  const [events, chores, menuHome, shoppingLists, polls, capsuleResult] = await Promise.all([
    listCalendarEvents(db, userId, familyId, start.toISOString(), end.toISOString()),
    listChores(db, userId, familyId),
    getMenuHome(db, userId, familyId),
    listShoppingLists(db, userId, familyId),
    listPolls(db, userId, familyId),
    listTimeCapsules(db, userId, familyId)
  ]);

  const briefingEvents = events
    .slice()
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, MAX_EVENTS)
    .map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: event.allDay,
      location: event.location,
      route: '/(family)/calendar'
    }));

  const myOpenChores = chores.filter((chore) => chore.isAssignedToMe && !chore.myCompletedAt && chore.dueAt);
  const overdue = myOpenChores.filter((chore) => chore.dueAt!.getTime() < now.getTime());
  const dueToday = myOpenChores.filter((chore) => chore.dueAt!.getTime() >= now.getTime() && chore.dueAt!.getTime() < end.getTime());
  const otherOpen = chores.filter((chore) => chore.isAssignedToMe && !chore.myCompletedAt && !overdue.includes(chore) && !dueToday.includes(chore))
    .sort((a, b) => {
      if (!a.dueAt && !b.dueAt) return 0;
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return a.dueAt.getTime() - b.dueAt.getTime();
    });
  const briefingTasks = [...overdue, ...dueToday, ...otherOpen].slice(0, MAX_TASKS).map((chore) => ({
    id: chore.id,
    title: chore.title,
    dueAt: chore.dueAt,
    status: overdue.includes(chore) ? 'overdue' as const : dueToday.includes(chore) ? 'due_today' as const : 'upcoming' as const,
    route: `/(family)/tasks/${chore.id}`
  }));

  // Only active menus that actually have a meal planned today are worth surfacing — an
  // active menu with nothing planned for today is exactly the "no relevant meal" case the
  // spec says to omit rather than inventing a placeholder for.
  const briefingMenus = menuHome.activeMenus
    .filter((menu) => menu.todayMeals.length > 0)
    .map((menu) => ({
      id: menu.id,
      name: menu.name,
      meals: menu.todayMeals.map((meal) => ({ mealType: meal.mealType, mealName: meal.mealName, note: meal.note })),
      route: '/(family)/menu'
    }));

  const briefingShopping = shoppingLists
    .filter((list) => !list.isCompleted && list.shoppingDate && list.shoppingDate.getTime() >= start.getTime() && list.shoppingDate.getTime() < end.getTime())
    .slice(0, MAX_SHOPPING_LISTS)
    .map((list) => ({
      id: list.id,
      name: list.name,
      totalItems: list.totalItems,
      remainingItems: list.remainingItems,
      route: `/(family)/shopping/${list.id}`
    }));

  const briefingPolls = polls
    .filter((poll) => !poll.isClosed && poll.myOptionId === null)
    .sort((a, b) => {
      if (!a.closesAt && !b.closesAt) return 0;
      if (!a.closesAt) return 1;
      if (!b.closesAt) return -1;
      return a.closesAt.getTime() - b.closesAt.getTime();
    })
    .slice(0, MAX_POLLS)
    .map((poll) => ({
      id: poll.id,
      question: poll.question,
      closesAt: poll.closesAt,
      route: `/(family)/polls/${poll.id}`
    }));

  const briefingCapsules = capsuleResult.capsules
    .filter((capsule) => !capsule.isLocked && capsule.unlockAt.getTime() >= start.getTime() && capsule.unlockAt.getTime() < end.getTime())
    .slice(0, MAX_CAPSULES)
    .map((capsule) => ({
      id: capsule.id,
      title: capsule.title,
      unlockAt: capsule.unlockAt,
      route: '/(family)/capsules'
    }));

  return {
    date: dateKey,
    serverNow: now.toISOString(),
    memberId: membership.id,
    events: briefingEvents,
    tasks: briefingTasks,
    menus: briefingMenus,
    shopping: briefingShopping,
    polls: briefingPolls,
    capsules: briefingCapsules
  };
}
