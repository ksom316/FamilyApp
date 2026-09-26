import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { familyMembers, familyMenuMeals, familyMenus, householdMembers, households, users } from '@familyapp/db/schema';

import { requireFamilyMembership } from './family-service';
import { createNotifications, familyMemberIds, householdMemberIds, recipientsExcluding } from './notifications-service';
import { createShoppingList } from './shopping-service';

export type MenuErrorCode =
  | 'invalid_menu'
  | 'invalid_meal'
  | 'invalid_household'
  | 'invalid_week'
  | 'invalid_meal_type'
  | 'invalid_meal_date'
  | 'invalid_title'
  | 'invalid_name'
  | 'invalid_note'
  | 'household_not_eligible'
  | 'menu_not_found'
  | 'forbidden_menu_action'
  | 'previous_menu_not_found';

export class MenuServiceError extends Error {
  constructor(public readonly code: MenuErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'MenuServiceError';
  }
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

function assertUuid(value: string, kind: 'menu' | 'household' = 'menu') {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new MenuServiceError(kind === 'menu' ? 'invalid_menu' : 'invalid_household', `The ${kind} identifier is not valid.`);
  }
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function mondayOf(date: Date) {
  const weekday = date.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diff = weekday === 0 ? -6 : 1 - weekday;
  return addDays(date, diff);
}

function formatShortRange(start: Date, end: Date) {
  const format = (value: Date) => value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${format(start)}–${format(end)}`;
}

// Client may supply any date (a full ISO datetime from a picker, or a bare date) — the
// server always normalizes to the Monday of that calendar week, so week identity never
// depends on client-side date math.
export function readWeekStartDate(value: unknown) {
  if (typeof value !== 'string') throw new MenuServiceError('invalid_week', 'Choose a valid week.');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new MenuServiceError('invalid_week', 'Choose a valid week.');
  const dateOnly = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  return formatDateOnly(mondayOf(dateOnly));
}

function readMealDate(value: unknown) {
  if (typeof value !== 'string') throw new MenuServiceError('invalid_meal_date', 'Choose a valid date.');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new MenuServiceError('invalid_meal_date', 'Choose a valid date.');
  return formatDateOnly(new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())));
}

function assertDateWithinWeek(mealDate: string, weekStartDate: string) {
  const start = parseDateOnly(weekStartDate);
  const end = addDays(start, 6);
  const meal = parseDateOnly(mealDate);
  if (meal.getTime() < start.getTime() || meal.getTime() > end.getTime()) {
    throw new MenuServiceError('invalid_meal_date', 'That date is not part of this menu’s week.');
  }
}

function readMealType(value: unknown) {
  if (typeof value !== 'string' || !MEAL_TYPES.includes(value as MealType)) {
    throw new MenuServiceError('invalid_meal_type', 'Choose a valid meal type.');
  }
  return value as MealType;
}

function readTitle(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 100) {
    throw new MenuServiceError('invalid_title', 'Title must be 100 characters or fewer.');
  }
  return value.trim() || null;
}

function readMealName(value: unknown) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 140) {
    throw new MenuServiceError('invalid_name', 'Meal name must be between 1 and 140 characters.');
  }
  return value.trim();
}

function readNote(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 300) {
    throw new MenuServiceError('invalid_note', 'Note must be 300 characters or fewer.');
  }
  return value.trim() || null;
}

// A household menu may only be created by someone who currently belongs to that
// household — the same rule as F14/F15.
async function assertHouseholdEligible(db: Database, familyId: string, householdId: string, memberId: string) {
  const [row] = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.familyId, familyId), eq(householdMembers.familyMemberId, memberId)))
    .limit(1);
  if (!row) throw new MenuServiceError('household_not_eligible', 'You can only create a menu for a group you belong to.', 403);
}

async function assertTargetEligible(db: Database, familyId: string, householdId: string | null, memberId: string) {
  if (!householdId) return;
  const [row] = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.familyId, familyId), eq(householdMembers.familyMemberId, memberId)))
    .limit(1);
  // Same not-found response as a genuinely missing menu: an ineligible household target
  // must never be distinguishable from "no menu exists here."
  if (!row) throw new MenuServiceError('menu_not_found', 'Menu not found.', 404);
}

const menuBaseSelection = {
  id: familyMenus.id,
  familyId: familyMenus.familyId,
  householdId: familyMenus.householdId,
  householdName: households.name,
  weekStartDate: familyMenus.weekStartDate,
  title: familyMenus.title,
  createdByMemberId: familyMenus.createdByMemberId,
  createdAt: familyMenus.createdAt,
  updatedAt: familyMenus.updatedAt,
  createdBy: {
    memberId: familyMembers.id,
    displayName: users.name,
    avatar: users.image,
    identityType: users.identityType,
    avatarConfig: users.avatarConfig,
    hasPhoto: sql<boolean>`${users.photoObjectKey} is not null`
  }
};

type MenuRow = Awaited<ReturnType<typeof selectMenuRow>>;

async function selectMenuRow(db: Database, familyId: string, householdId: string | null, weekStartDate: string) {
  const [row] = await db
    .select(menuBaseSelection)
    .from(familyMenus)
    .innerJoin(familyMembers, and(eq(familyMenus.createdByMemberId, familyMembers.id), eq(familyMenus.familyId, familyMembers.familyId)))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .leftJoin(households, and(eq(familyMenus.householdId, households.id), eq(familyMenus.familyId, households.familyId)))
    .where(and(
      eq(familyMenus.familyId, familyId),
      householdId ? eq(familyMenus.householdId, householdId) : isNull(familyMenus.householdId),
      eq(familyMenus.weekStartDate, weekStartDate)
    ))
    .limit(1);
  return row ?? null;
}

async function selectMenuById(db: Database, familyId: string, menuId: string) {
  const [row] = await db
    .select(menuBaseSelection)
    .from(familyMenus)
    .innerJoin(familyMembers, and(eq(familyMenus.createdByMemberId, familyMembers.id), eq(familyMenus.familyId, familyMembers.familyId)))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .leftJoin(households, and(eq(familyMenus.householdId, households.id), eq(familyMenus.familyId, households.familyId)))
    .where(and(eq(familyMenus.id, menuId), eq(familyMenus.familyId, familyId)))
    .limit(1);
  return row ?? null;
}

const mealSelection = {
  id: familyMenuMeals.id,
  menuId: familyMenuMeals.menuId,
  mealDate: familyMenuMeals.mealDate,
  mealType: familyMenuMeals.mealType,
  mealName: familyMenuMeals.mealName,
  note: familyMenuMeals.note,
  createdAt: familyMenuMeals.createdAt,
  updatedAt: familyMenuMeals.updatedAt
};

async function selectMeals(db: Database, menuId: string) {
  return db.select(mealSelection).from(familyMenuMeals).where(eq(familyMenuMeals.menuId, menuId)).orderBy(asc(familyMenuMeals.mealDate));
}

async function hasPreviousMenu(db: Database, familyId: string, householdId: string | null, weekStartDate: string) {
  const previousWeekStart = formatDateOnly(addDays(parseDateOnly(weekStartDate), -7));
  const row = await selectMenuRow(db, familyId, householdId, previousWeekStart);
  return Boolean(row);
}

function hydrateMenu(row: NonNullable<MenuRow>, meals: Awaited<ReturnType<typeof selectMeals>>) {
  const weekEndDate = formatDateOnly(addDays(parseDateOnly(row.weekStartDate), 6));
  return {
    id: row.id,
    familyId: row.familyId,
    household: row.householdId ? { id: row.householdId, name: row.householdName ?? 'Group' } : null,
    weekStartDate: row.weekStartDate,
    weekEndDate,
    title: row.title,
    createdByMemberId: row.createdByMemberId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    meals
  };
}

export async function getMenuForTarget(db: Database, userId: string, familyId: string, rawHouseholdId: unknown, rawWeekStartDate: unknown) {
  const membership = await requireFamilyMembership(db, userId, familyId);

  let householdId: string | null = null;
  if (rawHouseholdId !== undefined && rawHouseholdId !== null && rawHouseholdId !== '') {
    if (typeof rawHouseholdId !== 'string') throw new MenuServiceError('invalid_household', 'Choose a valid group.');
    assertUuid(rawHouseholdId, 'household');
    await assertTargetEligible(db, familyId, rawHouseholdId, membership.id);
    householdId = rawHouseholdId;
  }

  const weekStartDate = readWeekStartDate(rawWeekStartDate);
  const weekEndDate = formatDateOnly(addDays(parseDateOnly(weekStartDate), 6));
  const row = await selectMenuRow(db, familyId, householdId, weekStartDate);
  const previousExists = await hasPreviousMenu(db, familyId, householdId, weekStartDate);

  if (!row) return { weekStartDate, weekEndDate, menu: null, hasPreviousMenu: previousExists };

  const meals = await selectMeals(db, row.id);
  return { weekStartDate, weekEndDate, menu: hydrateMenu(row, meals), hasPreviousMenu: previousExists };
}

async function requireEligibleMenu(db: Database, userId: string, familyId: string, menuId: string) {
  assertUuid(menuId);
  const membership = await requireFamilyMembership(db, userId, familyId);
  const [menu] = await db.select().from(familyMenus).where(and(eq(familyMenus.id, menuId), eq(familyMenus.familyId, familyId))).limit(1);
  if (!menu) throw new MenuServiceError('menu_not_found', 'Menu not found.', 404);

  if (menu.householdId) {
    const [row] = await db
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, menu.householdId), eq(householdMembers.familyId, familyId), eq(householdMembers.familyMemberId, membership.id)))
      .limit(1);
    if (!row) throw new MenuServiceError('menu_not_found', 'Menu not found.', 404);
  }

  return { membership, menu };
}

export async function getMenu(db: Database, userId: string, familyId: string, menuId: string) {
  await requireEligibleMenu(db, userId, familyId, menuId);
  const row = await selectMenuById(db, familyId, menuId);
  if (!row) throw new MenuServiceError('menu_not_found', 'Menu not found.', 404);
  const meals = await selectMeals(db, menuId);
  return hydrateMenu(row, meals);
}

type CreateMenuInput = { householdId?: unknown; weekStartDate?: unknown; title?: unknown };

// Find-or-create: if a menu already exists for this exact target/week, that menu is
// returned rather than creating a duplicate — matches the "navigate to the existing
// menu" UX the create flow needs.
export async function createMenu(db: Database, userId: string, familyId: string, input: CreateMenuInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);

  let householdId: string | null = null;
  if (input.householdId !== undefined && input.householdId !== null && input.householdId !== '') {
    if (typeof input.householdId !== 'string') throw new MenuServiceError('invalid_household', 'Choose a valid group.');
    assertUuid(input.householdId, 'household');
    await assertHouseholdEligible(db, familyId, input.householdId, membership.id);
    householdId = input.householdId;
  }

  const weekStartDate = readWeekStartDate(input.weekStartDate);
  const title = readTitle(input.title);

  const existing = await selectMenuRow(db, familyId, householdId, weekStartDate);
  if (existing) return getMenu(db, userId, familyId, existing.id);

  const [created] = await db
    .insert(familyMenus)
    .values({ familyId, householdId, createdByMemberId: membership.id, weekStartDate, title })
    .returning({ id: familyMenus.id });
  if (!created) throw new Error('Menu creation did not return the created record.');

  const menu = await getMenu(db, userId, familyId, created.id);
  const recipientIds = householdId ? await householdMemberIds(db, familyId, householdId) : await familyMemberIds(db, familyId);
  await createNotifications(db, recipientsExcluding(recipientIds, membership.id).map((recipientMemberId) => ({
    familyId,
    recipientMemberId,
    actorMemberId: membership.id,
    type: 'menu_created',
    title: `${menu.createdBy.displayName} created a weekly menu: ${menu.title}`,
    entityType: 'menu',
    entityId: created.id,
    route: '/(family)/menu'
  })));

  return menu;
}

export async function updateMenu(db: Database, userId: string, familyId: string, menuId: string, input: { title?: unknown }) {
  const { membership, menu } = await requireEligibleMenu(db, userId, familyId, menuId);
  if (menu.createdByMemberId !== membership.id) {
    throw new MenuServiceError('forbidden_menu_action', 'Only the menu creator can edit it.', 403);
  }
  const title = input.title === undefined ? menu.title : readTitle(input.title);
  await db.update(familyMenus).set({ title, updatedAt: new Date() }).where(and(eq(familyMenus.id, menuId), eq(familyMenus.familyId, familyId)));
  return getMenu(db, userId, familyId, menuId);
}

export async function deleteMenu(db: Database, userId: string, familyId: string, menuId: string) {
  const { membership, menu } = await requireEligibleMenu(db, userId, familyId, menuId);
  if (menu.createdByMemberId !== membership.id) {
    throw new MenuServiceError('forbidden_menu_action', 'Only the menu creator can delete it.', 403);
  }
  await db.delete(familyMenus).where(and(eq(familyMenus.id, menuId), eq(familyMenus.familyId, familyId)));
}

type MealInput = { mealDate?: unknown; mealType?: unknown; mealName?: unknown; note?: unknown };

// Collaboration is intentionally NOT creator-only for meals — any eligible member may
// add/edit/clear a meal slot. Only menu-level rename/delete is creator-restricted.
export async function setMeal(db: Database, userId: string, familyId: string, menuId: string, input: MealInput) {
  const { menu } = await requireEligibleMenu(db, userId, familyId, menuId);
  const mealDate = readMealDate(input.mealDate);
  assertDateWithinWeek(mealDate, menu.weekStartDate);
  const mealType = readMealType(input.mealType);
  const mealName = readMealName(input.mealName);
  const note = readNote(input.note);

  await db
    .insert(familyMenuMeals)
    .values({ familyId, menuId, mealDate, mealType, mealName, note })
    .onConflictDoUpdate({
      target: [familyMenuMeals.menuId, familyMenuMeals.mealDate, familyMenuMeals.mealType],
      set: { mealName, note, updatedAt: new Date() }
    });

  return getMenu(db, userId, familyId, menuId);
}

export async function clearMeal(db: Database, userId: string, familyId: string, menuId: string, rawMealDate: unknown, rawMealType: unknown) {
  await requireEligibleMenu(db, userId, familyId, menuId);
  const mealDate = readMealDate(rawMealDate);
  const mealType = readMealType(rawMealType);
  await db.delete(familyMenuMeals).where(and(eq(familyMenuMeals.menuId, menuId), eq(familyMenuMeals.mealDate, mealDate), eq(familyMenuMeals.mealType, mealType)));
  return getMenu(db, userId, familyId, menuId);
}

// Additive merge: only fills slots that are currently empty in the target week. Existing
// entries in the current menu are never overwritten, and copied rows are brand-new
// records — later edits to either week's meals never affect the other.
export async function copyPreviousWeek(db: Database, userId: string, familyId: string, menuId: string) {
  const { menu } = await requireEligibleMenu(db, userId, familyId, menuId);
  const previousWeekStart = formatDateOnly(addDays(parseDateOnly(menu.weekStartDate), -7));
  const previousMenu = await selectMenuRow(db, familyId, menu.householdId, previousWeekStart);
  if (!previousMenu) throw new MenuServiceError('previous_menu_not_found', 'There is no menu for the previous week to copy.', 404);

  const [previousMeals, currentMeals] = await Promise.all([selectMeals(db, previousMenu.id), selectMeals(db, menuId)]);
  const filled = new Set(currentMeals.map((meal) => `${meal.mealDate}|${meal.mealType}`));
  const previousWeekStartDate = parseDateOnly(previousWeekStart);
  const currentWeekStartDate = parseDateOnly(menu.weekStartDate);

  const rowsToInsert = previousMeals.flatMap((meal) => {
    const offsetDays = Math.round((parseDateOnly(meal.mealDate).getTime() - previousWeekStartDate.getTime()) / DAY_MS);
    const newDate = formatDateOnly(addDays(currentWeekStartDate, offsetDays));
    const key = `${newDate}|${meal.mealType}`;
    if (filled.has(key)) return [];
    return [{ familyId, menuId, mealDate: newDate, mealType: meal.mealType, mealName: meal.mealName, note: meal.note }];
  });

  if (rowsToInsert.length > 0) await db.insert(familyMenuMeals).values(rowsToInsert);

  return getMenu(db, userId, familyId, menuId);
}

// Reuses F15's own createShoppingList as-is (it performs its own membership/household
// eligibility checks), so no shopping authorization logic is duplicated here.
export async function createShoppingListFromMenu(db: Database, userId: string, familyId: string, menuId: string) {
  const { menu } = await requireEligibleMenu(db, userId, familyId, menuId);
  const start = parseDateOnly(menu.weekStartDate);
  const end = addDays(start, 6);
  const name = `Shopping — ${formatShortRange(start, end)}`;
  return createShoppingList(db, userId, familyId, {
    name,
    shoppingDate: menu.weekStartDate,
    householdId: menu.householdId ?? undefined
  });
}
