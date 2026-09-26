import { and, asc, eq, inArray, isNotNull, or, type SQL } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { familyMembers, familySavedMenuMeals, familySavedMenuMembers, familySavedMenus, householdMembers, households, users } from '@familyapp/db/schema';

import { requireFamilyMembership } from './family-service';
import { createMenu, getMenu, readWeekStartDate, setMeal, type MealType } from './menus-service';
import { createNotifications, familyMemberIds, householdMemberIds, recipientsExcluding } from './notifications-service';
import { createShoppingList } from './shopping-service';

export type SavedMenuErrorCode =
  | 'invalid_saved_menu'
  | 'invalid_household'
  | 'invalid_member'
  | 'invalid_audience'
  | 'invalid_name'
  | 'invalid_description'
  | 'invalid_day'
  | 'invalid_meal_type'
  | 'invalid_name_field'
  | 'invalid_note'
  | 'invalid_active'
  | 'household_not_eligible'
  | 'saved_menu_not_found'
  | 'forbidden_saved_menu_action';

export class SavedMenuServiceError extends Error {
  constructor(public readonly code: SavedMenuErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'SavedMenuServiceError';
  }
}

export type AudienceType = 'family' | 'household' | 'members';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];
const AUDIENCE_TYPES: AudienceType[] = ['family', 'household', 'members'];
const DAY_MS = 24 * 60 * 60 * 1000;
// JS Date#getDay() is 0=Sunday..6=Saturday; saved-menu days are 0=Monday..6=Sunday to
// match the Monday-start week convention family_menus already uses.
const TODAY_DAY_OF_WEEK = (new Date().getDay() + 6) % 7;

function assertUuid(value: string, kind: 'saved_menu' | 'household' | 'member' = 'saved_menu') {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    const code = kind === 'saved_menu' ? 'invalid_saved_menu' : kind === 'household' ? 'invalid_household' : 'invalid_member';
    throw new SavedMenuServiceError(code, `The ${kind} identifier is not valid.`);
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

function readName(value: unknown) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 100) {
    throw new SavedMenuServiceError('invalid_name', 'Name must be between 1 and 100 characters.');
  }
  return value.trim();
}

function readDescription(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 500) {
    throw new SavedMenuServiceError('invalid_description', 'Description must be 500 characters or fewer.');
  }
  return value.trim() || null;
}

// Accepts a numeric string too, since this is read from a query param when clearing a
// slot (DELETE) and from a JSON number when setting one (PUT).
function readDayOfWeek(value: unknown) {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(num) || num < 0 || num > 6) {
    throw new SavedMenuServiceError('invalid_day', 'Choose a valid day of the week.');
  }
  return num;
}

function readMealType(value: unknown) {
  if (typeof value !== 'string' || !MEAL_TYPES.includes(value as MealType)) {
    throw new SavedMenuServiceError('invalid_meal_type', 'Choose a valid meal type.');
  }
  return value as MealType;
}

function readMealName(value: unknown) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 140) {
    throw new SavedMenuServiceError('invalid_name_field', 'Meal name must be between 1 and 140 characters.');
  }
  return value.trim();
}

function readNote(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 300) {
    throw new SavedMenuServiceError('invalid_note', 'Note must be 300 characters or fewer.');
  }
  return value.trim() || null;
}

function readAudienceType(value: unknown) {
  if (typeof value !== 'string' || !AUDIENCE_TYPES.includes(value as AudienceType)) {
    throw new SavedMenuServiceError('invalid_audience', 'Choose who this menu is for.');
  }
  return value as AudienceType;
}

function readMemberIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new SavedMenuServiceError('invalid_audience', 'Choose at least one person.');
  }
  const ids = value.map((id) => {
    if (typeof id !== 'string') throw new SavedMenuServiceError('invalid_audience', 'Choose valid people.');
    assertUuid(id, 'member');
    return id;
  });
  return [...new Set(ids)];
}

async function assertMembersEligible(db: Database, familyId: string, memberIds: string[]) {
  const rows = await db.select({ id: familyMembers.id }).from(familyMembers).where(and(inArray(familyMembers.id, memberIds), eq(familyMembers.familyId, familyId)));
  if (rows.length !== memberIds.length) throw new SavedMenuServiceError('invalid_member', 'Choose people from your family.');
}

// Same rule as weekly menus/polls/shopping: a household-targeted saved menu may only be
// created by someone who currently belongs to that household.
async function assertHouseholdEligible(db: Database, familyId: string, householdId: string, memberId: string) {
  const [row] = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.familyId, familyId), eq(householdMembers.familyMemberId, memberId)))
    .limit(1);
  if (!row) throw new SavedMenuServiceError('household_not_eligible', 'You can only create a menu for a group you belong to.', 403);
}

const savedMenuBaseSelection = {
  id: familySavedMenus.id,
  familyId: familySavedMenus.familyId,
  audienceType: familySavedMenus.audienceType,
  householdId: familySavedMenus.householdId,
  householdName: households.name,
  name: familySavedMenus.name,
  description: familySavedMenus.description,
  isActive: familySavedMenus.isActive,
  createdByMemberId: familySavedMenus.createdByMemberId,
  createdBy: {
    memberId: familyMembers.id,
    displayName: users.name,
    avatar: users.image
  },
  createdAt: familySavedMenus.createdAt,
  updatedAt: familySavedMenus.updatedAt
};

type SavedMenuRow = Awaited<ReturnType<typeof selectSavedMenuRows>>[number];

async function selectSavedMenuRows(db: Database, where: SQL) {
  return db
    .select(savedMenuBaseSelection)
    .from(familySavedMenus)
    .innerJoin(familyMembers, and(eq(familySavedMenus.createdByMemberId, familyMembers.id), eq(familySavedMenus.familyId, familyMembers.familyId)))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .leftJoin(households, and(eq(familySavedMenus.householdId, households.id), eq(familySavedMenus.familyId, households.familyId)))
    .where(where)
    .orderBy(asc(familySavedMenus.name));
}

const audienceMemberSelection = {
  savedMenuId: familySavedMenuMembers.savedMenuId,
  memberId: familyMembers.id,
  displayName: users.name,
  avatar: users.image
};

async function selectAudienceMembersByMenu(db: Database, savedMenuIds: string[]) {
  const map = new Map<string, { memberId: string; displayName: string; avatar: string | null }[]>();
  if (savedMenuIds.length === 0) return map;
  const rows = await db
    .select(audienceMemberSelection)
    .from(familySavedMenuMembers)
    .innerJoin(familyMembers, eq(familySavedMenuMembers.memberId, familyMembers.id))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(inArray(familySavedMenuMembers.savedMenuId, savedMenuIds))
    .orderBy(asc(users.name));
  for (const row of rows) {
    const list = map.get(row.savedMenuId) ?? [];
    list.push({ memberId: row.memberId, displayName: row.displayName, avatar: row.avatar });
    map.set(row.savedMenuId, list);
  }
  return map;
}

type Audience =
  | { type: 'family' }
  | { type: 'household'; household: { id: string; name: string } }
  | { type: 'members'; members: { memberId: string; displayName: string; avatar: string | null }[] };

function hydrateSavedMenu(row: SavedMenuRow, audienceMembersByMenu: Map<string, { memberId: string; displayName: string; avatar: string | null }[]>) {
  let audience: Audience;
  if (row.audienceType === 'household') {
    audience = { type: 'household', household: { id: row.householdId as string, name: row.householdName ?? 'Group' } };
  } else if (row.audienceType === 'members') {
    audience = { type: 'members', members: audienceMembersByMenu.get(row.id) ?? [] };
  } else {
    audience = { type: 'family' };
  }

  return {
    id: row.id,
    familyId: row.familyId,
    audience,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    createdByMemberId: row.createdByMemberId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function hydrateSavedMenus(db: Database, rows: SavedMenuRow[]) {
  const memberAudienceIds = rows.filter((row) => row.audienceType === 'members').map((row) => row.id);
  const audienceMembersByMenu = await selectAudienceMembersByMenu(db, memberAudienceIds);
  return rows.map((row) => hydrateSavedMenu(row, audienceMembersByMenu));
}

const mealSelection = {
  id: familySavedMenuMeals.id,
  savedMenuId: familySavedMenuMeals.savedMenuId,
  dayOfWeek: familySavedMenuMeals.dayOfWeek,
  mealType: familySavedMenuMeals.mealType,
  mealName: familySavedMenuMeals.mealName,
  note: familySavedMenuMeals.note,
  createdAt: familySavedMenuMeals.createdAt,
  updatedAt: familySavedMenuMeals.updatedAt
};

async function selectSavedMenuMeals(db: Database, savedMenuId: string) {
  return db.select(mealSelection).from(familySavedMenuMeals).where(eq(familySavedMenuMeals.savedMenuId, savedMenuId)).orderBy(asc(familySavedMenuMeals.dayOfWeek));
}

// Every visible-menu query below is built from the same eligibility shape: the caller's
// own creations, plus every 'family' menu, plus 'household' menus for households the
// caller currently belongs to, plus 'members' menus that explicitly name the caller. This
// is computed fully server-side — the client is never handed menus to filter itself.
async function buildVisibilityFilter(db: Database, familyId: string, membershipId: string) {
  const myHouseholds = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(and(eq(householdMembers.familyId, familyId), eq(householdMembers.familyMemberId, membershipId)));
  const myHouseholdIds = myHouseholds.map((row) => row.householdId);

  const conditions: SQL[] = [
    eq(familySavedMenus.createdByMemberId, membershipId),
    eq(familySavedMenus.audienceType, 'family')
  ];
  if (myHouseholdIds.length > 0) {
    conditions.push(and(eq(familySavedMenus.audienceType, 'household'), inArray(familySavedMenus.householdId, myHouseholdIds))!);
  }

  return { orConditions: conditions, membershipId };
}

async function selectVisibleSavedMenuRows(db: Database, familyId: string, membershipId: string) {
  const { orConditions } = await buildVisibilityFilter(db, familyId, membershipId);

  return db
    .select(savedMenuBaseSelection)
    .from(familySavedMenus)
    .innerJoin(familyMembers, and(eq(familySavedMenus.createdByMemberId, familyMembers.id), eq(familySavedMenus.familyId, familyMembers.familyId)))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .leftJoin(households, and(eq(familySavedMenus.householdId, households.id), eq(familySavedMenus.familyId, households.familyId)))
    .leftJoin(familySavedMenuMembers, and(eq(familySavedMenuMembers.savedMenuId, familySavedMenus.id), eq(familySavedMenuMembers.memberId, membershipId)))
    .where(and(
      eq(familySavedMenus.familyId, familyId),
      or(...orConditions, and(eq(familySavedMenus.audienceType, 'members'), isNotNull(familySavedMenuMembers.id)))
    ))
    .orderBy(asc(familySavedMenus.name));
}

export async function listSavedMenus(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const rows = await selectVisibleSavedMenuRows(db, familyId, membership.id);
  return hydrateSavedMenus(db, rows);
}

// Menu Home: active applicable menus (with today's meals attached) first, then every
// other visible saved menu as a plain summary. All eligibility is computed here, not in
// the client.
export async function getMenuHome(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const rows = await selectVisibleSavedMenuRows(db, familyId, membership.id);
  const hydrated = await hydrateSavedMenus(db, rows);

  const active = hydrated.filter((menu) => menu.isActive);
  const other = hydrated.filter((menu) => !menu.isActive);

  const activeIds = active.map((menu) => menu.id);
  const todayMeals = activeIds.length > 0
    ? await db.select(mealSelection).from(familySavedMenuMeals).where(and(inArray(familySavedMenuMeals.savedMenuId, activeIds), eq(familySavedMenuMeals.dayOfWeek, TODAY_DAY_OF_WEEK)))
    : [];
  const todayMealsByMenu = new Map<string, typeof todayMeals>();
  for (const meal of todayMeals) {
    const list = todayMealsByMenu.get(meal.savedMenuId) ?? [];
    list.push(meal);
    todayMealsByMenu.set(meal.savedMenuId, list);
  }

  return {
    activeMenus: active.map((menu) => ({ ...menu, todayMeals: todayMealsByMenu.get(menu.id) ?? [] })),
    otherMenus: other
  };
}

// The creator always retains access to a menu they made, even if they excluded
// themselves from its audience (e.g. a parent building "Dad's Menu" for someone else) —
// otherwise creating a menu could immediately lock its own creator out of managing it.
// Everyone else must satisfy the audience check for the menu's specific audience type.
async function requireEligibleSavedMenu(db: Database, userId: string, familyId: string, savedMenuId: string) {
  assertUuid(savedMenuId);
  const membership = await requireFamilyMembership(db, userId, familyId);
  const [savedMenu] = await db.select().from(familySavedMenus).where(and(eq(familySavedMenus.id, savedMenuId), eq(familySavedMenus.familyId, familyId))).limit(1);
  if (!savedMenu) throw new SavedMenuServiceError('saved_menu_not_found', 'Saved menu not found.', 404);

  if (savedMenu.createdByMemberId === membership.id) return { membership, savedMenu };

  if (savedMenu.audienceType === 'household' && savedMenu.householdId) {
    const [row] = await db
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, savedMenu.householdId), eq(householdMembers.familyId, familyId), eq(householdMembers.familyMemberId, membership.id)))
      .limit(1);
    if (!row) throw new SavedMenuServiceError('saved_menu_not_found', 'Saved menu not found.', 404);
  } else if (savedMenu.audienceType === 'members') {
    const [row] = await db
      .select({ id: familySavedMenuMembers.id })
      .from(familySavedMenuMembers)
      .where(and(eq(familySavedMenuMembers.savedMenuId, savedMenuId), eq(familySavedMenuMembers.memberId, membership.id)))
      .limit(1);
    // Same not-found response as a genuinely missing saved menu: an ineligible audience
    // must never be distinguishable from "no such menu."
    if (!row) throw new SavedMenuServiceError('saved_menu_not_found', 'Saved menu not found.', 404);
  }
  // audienceType === 'family': any current family member is eligible, already satisfied
  // by requireFamilyMembership above.

  return { membership, savedMenu };
}

export async function getSavedMenu(db: Database, userId: string, familyId: string, savedMenuId: string) {
  await requireEligibleSavedMenu(db, userId, familyId, savedMenuId);
  const [row] = await selectSavedMenuRows(db, and(eq(familySavedMenus.id, savedMenuId), eq(familySavedMenus.familyId, familyId))!);
  if (!row) throw new SavedMenuServiceError('saved_menu_not_found', 'Saved menu not found.', 404);
  const [hydrated] = await hydrateSavedMenus(db, [row]);
  const meals = await selectSavedMenuMeals(db, savedMenuId);
  return { ...hydrated, meals };
}

type CreateSavedMenuInput = { name?: unknown; description?: unknown; audienceType?: unknown; householdId?: unknown; memberIds?: unknown };

export async function createSavedMenu(db: Database, userId: string, familyId: string, input: CreateSavedMenuInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const name = readName(input.name);
  const description = readDescription(input.description);
  const audienceType = readAudienceType(input.audienceType);

  let householdId: string | null = null;
  let memberIds: string[] = [];

  if (audienceType === 'household') {
    if (typeof input.householdId !== 'string') throw new SavedMenuServiceError('invalid_household', 'Choose a valid group.');
    assertUuid(input.householdId, 'household');
    await assertHouseholdEligible(db, familyId, input.householdId, membership.id);
    householdId = input.householdId;
  } else if (audienceType === 'members') {
    memberIds = readMemberIds(input.memberIds);
    await assertMembersEligible(db, familyId, memberIds);
  }

  const [created] = await db
    .insert(familySavedMenus)
    .values({ familyId, audienceType, householdId, createdByMemberId: membership.id, name, description })
    .returning({ id: familySavedMenus.id });
  if (!created) throw new Error('Saved menu creation did not return the created record.');

  if (memberIds.length > 0) {
    await db.insert(familySavedMenuMembers).values(memberIds.map((memberId) => ({ familyId, savedMenuId: created.id, memberId })));
  }

  return getSavedMenu(db, userId, familyId, created.id);
}

type UpdateSavedMenuInput = { name?: unknown; description?: unknown; audienceType?: unknown; householdId?: unknown; memberIds?: unknown };

export async function updateSavedMenu(db: Database, userId: string, familyId: string, savedMenuId: string, input: UpdateSavedMenuInput) {
  const { membership, savedMenu } = await requireEligibleSavedMenu(db, userId, familyId, savedMenuId);
  if (savedMenu.createdByMemberId !== membership.id) {
    throw new SavedMenuServiceError('forbidden_saved_menu_action', 'Only the menu creator can edit it.', 403);
  }

  const name = input.name === undefined ? savedMenu.name : readName(input.name);
  const description = input.description === undefined ? savedMenu.description : readDescription(input.description);

  let audienceType = savedMenu.audienceType as AudienceType;
  let householdId = savedMenu.householdId;
  let nextMemberIds: string[] | null = null; // null = leave the members table untouched

  if (input.audienceType !== undefined) {
    audienceType = readAudienceType(input.audienceType);
    householdId = null;
    nextMemberIds = [];
    if (audienceType === 'household') {
      if (typeof input.householdId !== 'string') throw new SavedMenuServiceError('invalid_household', 'Choose a valid group.');
      assertUuid(input.householdId, 'household');
      await assertHouseholdEligible(db, familyId, input.householdId, membership.id);
      householdId = input.householdId;
    } else if (audienceType === 'members') {
      nextMemberIds = readMemberIds(input.memberIds);
      await assertMembersEligible(db, familyId, nextMemberIds);
    }
  } else if (audienceType === 'members' && input.memberIds !== undefined) {
    nextMemberIds = readMemberIds(input.memberIds);
    await assertMembersEligible(db, familyId, nextMemberIds);
  }

  await db.update(familySavedMenus).set({ name, description, audienceType, householdId, updatedAt: new Date() }).where(and(eq(familySavedMenus.id, savedMenuId), eq(familySavedMenus.familyId, familyId)));

  if (nextMemberIds !== null) {
    await db.delete(familySavedMenuMembers).where(eq(familySavedMenuMembers.savedMenuId, savedMenuId));
    if (nextMemberIds.length > 0) {
      await db.insert(familySavedMenuMembers).values(nextMemberIds.map((memberId) => ({ familyId, savedMenuId, memberId })));
    }
  }

  return getSavedMenu(db, userId, familyId, savedMenuId);
}

export async function deleteSavedMenu(db: Database, userId: string, familyId: string, savedMenuId: string) {
  const { membership, savedMenu } = await requireEligibleSavedMenu(db, userId, familyId, savedMenuId);
  if (savedMenu.createdByMemberId !== membership.id) {
    throw new SavedMenuServiceError('forbidden_saved_menu_action', 'Only the menu creator can delete it.', 403);
  }
  await db.delete(familySavedMenus).where(and(eq(familySavedMenus.id, savedMenuId), eq(familySavedMenus.familyId, familyId)));
}

// Activation is creator-only, mirroring the existing creator-only pattern for
// menu/list-level state changes. Unlike F16B, activating one saved menu no longer
// deactivates any other — several menus (e.g. Home Menu, Parents Menu, Dad's Menu) may
// all be active for their own distinct audiences at the same time. "Active" means
// "surface this prominently," not "the only one in effect."
export async function setSavedMenuActive(db: Database, userId: string, familyId: string, savedMenuId: string, rawActive: unknown) {
  if (typeof rawActive !== 'boolean') throw new SavedMenuServiceError('invalid_active', 'Active must be true or false.');
  const { membership, savedMenu } = await requireEligibleSavedMenu(db, userId, familyId, savedMenuId);
  if (savedMenu.createdByMemberId !== membership.id) {
    throw new SavedMenuServiceError('forbidden_saved_menu_action', 'Only the menu creator can change its active state.', 403);
  }

  await db.update(familySavedMenus).set({ isActive: rawActive, updatedAt: new Date() }).where(and(eq(familySavedMenus.id, savedMenuId), eq(familySavedMenus.familyId, familyId)));
  const updated = await getSavedMenu(db, userId, familyId, savedMenuId);

  if (rawActive && !savedMenu.isActive) {
    const recipientIds = updated.audience.type === 'household'
      ? await householdMemberIds(db, familyId, updated.audience.household.id)
      : updated.audience.type === 'members'
        ? updated.audience.members.map((member) => member.memberId)
        : await familyMemberIds(db, familyId);
    await createNotifications(db, recipientsExcluding(recipientIds, membership.id).map((recipientMemberId) => ({
      familyId,
      recipientMemberId,
      actorMemberId: membership.id,
      type: 'saved_menu_activated',
      title: `"${updated.name}" is now your active menu`,
      entityType: 'saved_menu',
      entityId: savedMenuId,
      route: '/(family)/menu'
    })));
  }

  return updated;
}

// Collaboration on meal content follows the same rule as weekly menus: any eligible
// member may add/edit/clear a slot; only menu-level actions (rename/delete/activate) are
// creator-restricted.
type SavedMealInput = { dayOfWeek?: unknown; mealType?: unknown; mealName?: unknown; note?: unknown };

export async function setSavedMenuMeal(db: Database, userId: string, familyId: string, savedMenuId: string, input: SavedMealInput) {
  await requireEligibleSavedMenu(db, userId, familyId, savedMenuId);
  const dayOfWeek = readDayOfWeek(input.dayOfWeek);
  const mealType = readMealType(input.mealType);
  const mealName = readMealName(input.mealName);
  const note = readNote(input.note);

  await db
    .insert(familySavedMenuMeals)
    .values({ familyId, savedMenuId, dayOfWeek, mealType, mealName, note })
    .onConflictDoUpdate({
      target: [familySavedMenuMeals.savedMenuId, familySavedMenuMeals.dayOfWeek, familySavedMenuMeals.mealType],
      set: { mealName, note, updatedAt: new Date() }
    });

  return getSavedMenu(db, userId, familyId, savedMenuId);
}

export async function clearSavedMenuMeal(db: Database, userId: string, familyId: string, savedMenuId: string, rawDayOfWeek: unknown, rawMealType: unknown) {
  await requireEligibleSavedMenu(db, userId, familyId, savedMenuId);
  const dayOfWeek = readDayOfWeek(rawDayOfWeek);
  const mealType = readMealType(rawMealType);
  await db.delete(familySavedMenuMeals).where(and(eq(familySavedMenuMeals.savedMenuId, savedMenuId), eq(familySavedMenuMeals.dayOfWeek, dayOfWeek), eq(familySavedMenuMeals.mealType, mealType)));
  return getSavedMenu(db, userId, familyId, savedMenuId);
}

// The duplicate becomes an independent menu owned by whoever duplicated it, with its own
// copied (not shared) meal rows and audience-member rows, and is never automatically
// activated.
export async function duplicateSavedMenu(db: Database, userId: string, familyId: string, savedMenuId: string) {
  const { membership, savedMenu } = await requireEligibleSavedMenu(db, userId, familyId, savedMenuId);
  const meals = await selectSavedMenuMeals(db, savedMenuId);
  const newName = `${savedMenu.name} copy`.slice(0, 100);

  const audienceMemberIds = savedMenu.audienceType === 'members'
    ? (await db.select({ memberId: familySavedMenuMembers.memberId }).from(familySavedMenuMembers).where(eq(familySavedMenuMembers.savedMenuId, savedMenuId))).map((row) => row.memberId)
    : [];

  const [created] = await db
    .insert(familySavedMenus)
    .values({
      familyId,
      audienceType: savedMenu.audienceType,
      householdId: savedMenu.householdId,
      createdByMemberId: membership.id,
      name: newName,
      description: savedMenu.description,
      isActive: false
    })
    .returning({ id: familySavedMenus.id });
  if (!created) throw new Error('Saved menu duplication did not return the created record.');

  if (meals.length > 0) {
    await db.insert(familySavedMenuMeals).values(meals.map((meal) => ({
      familyId,
      savedMenuId: created.id,
      dayOfWeek: meal.dayOfWeek,
      mealType: meal.mealType,
      mealName: meal.mealName,
      note: meal.note
    })));
  }

  if (audienceMemberIds.length > 0) {
    await db.insert(familySavedMenuMembers).values(audienceMemberIds.map((memberId) => ({ familyId, savedMenuId: created.id, memberId })));
  }

  return getSavedMenu(db, userId, familyId, created.id);
}

// Reuses menus-service's own createMenu (find-or-create) and setMeal (validated,
// eligibility-checked upsert) rather than duplicating weekly-menu business logic. This
// overwrites whatever is currently in each of the applied slots for that week — it's a
// deliberate "use this template" action, unlike Copy Previous Week's additive merge. The
// saved menu's own rows are never touched. Weekly plans only support whole-family/
// household targeting (unchanged in this phase), so a 'members' (or 'family') audience
// always applies to the whole-family week; only 'household' carries its household target
// through.
export async function applySavedMenuToWeek(db: Database, userId: string, familyId: string, savedMenuId: string, rawWeekStartDate: unknown) {
  const { savedMenu } = await requireEligibleSavedMenu(db, userId, familyId, savedMenuId);
  const meals = await selectSavedMenuMeals(db, savedMenuId);
  const weekStartDate = readWeekStartDate(rawWeekStartDate);
  const householdId = savedMenu.audienceType === 'household' ? savedMenu.householdId ?? undefined : undefined;

  const weeklyMenu = await createMenu(db, userId, familyId, { householdId, weekStartDate });

  for (const meal of meals) {
    const mealDate = formatDateOnly(addDays(parseDateOnly(weekStartDate), meal.dayOfWeek));
    await setMeal(db, userId, familyId, weeklyMenu.id, { mealDate, mealType: meal.mealType as MealType, mealName: meal.mealName, note: meal.note ?? undefined });
  }

  return getMenu(db, userId, familyId, weeklyMenu.id);
}

// Reuses F15's own createShoppingList as-is, exactly like the weekly-menu bridge — no
// shopping authorization logic is duplicated here. Same household-only-target rule as
// applySavedMenuToWeek: shopping lists don't have a "specific people" concept either.
export async function createShoppingListFromSavedMenu(db: Database, userId: string, familyId: string, savedMenuId: string) {
  const { savedMenu } = await requireEligibleSavedMenu(db, userId, familyId, savedMenuId);
  const householdId = savedMenu.audienceType === 'household' ? savedMenu.householdId ?? undefined : undefined;
  return createShoppingList(db, userId, familyId, {
    name: `Shopping — ${savedMenu.name}`,
    householdId
  });
}
