import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import {
  familyMembers,
  familyShoppingItems,
  familyShoppingLists,
  householdMembers,
  households,
  users
} from '@familyapp/db/schema';

import { requireFamilyMembership } from './family-service';
import { createNotifications, familyMemberIds, householdMemberIds, recipientsExcluding } from './notifications-service';

export type ShoppingErrorCode =
  | 'invalid_list'
  | 'invalid_item'
  | 'invalid_name'
  | 'invalid_description'
  | 'invalid_quantity'
  | 'invalid_unit'
  | 'invalid_note'
  | 'invalid_household'
  | 'household_not_eligible'
  | 'list_not_found'
  | 'item_not_found'
  | 'list_completed'
  | 'forbidden_list_action';

export class ShoppingServiceError extends Error {
  constructor(public readonly code: ShoppingErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'ShoppingServiceError';
  }
}

function assertUuid(value: string, kind: 'list' | 'item' | 'household' = 'list') {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    const code = kind === 'list' ? 'invalid_list' : kind === 'item' ? 'invalid_item' : 'invalid_household';
    throw new ShoppingServiceError(code, `The ${kind} identifier is not valid.`);
  }
}

function readListName(value: unknown) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 100) {
    throw new ShoppingServiceError('invalid_name', 'List name must be between 1 and 100 characters.');
  }
  return value.trim();
}

function readListDescription(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 1000) {
    throw new ShoppingServiceError('invalid_description', 'Description must be 1,000 characters or fewer.');
  }
  return value.trim() || null;
}

function readShoppingDate(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new ShoppingServiceError('invalid_list', 'Choose a valid shopping date.');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ShoppingServiceError('invalid_list', 'Choose a valid shopping date.');
  return date;
}

function readItemName(value: unknown) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 140) {
    throw new ShoppingServiceError('invalid_name', 'Item name must be between 1 and 140 characters.');
  }
  return value.trim();
}

function readQuantity(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(num) || num <= 0 || num > 1_000_000) {
    throw new ShoppingServiceError('invalid_quantity', 'Quantity must be a positive number.');
  }
  return num;
}

function readUnit(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 30) {
    throw new ShoppingServiceError('invalid_unit', 'Unit must be 30 characters or fewer.');
  }
  return value.trim() || null;
}

function readNote(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 300) {
    throw new ShoppingServiceError('invalid_note', 'Note must be 300 characters or fewer.');
  }
  return value.trim() || null;
}

// A household list may only be created by someone who currently belongs to that
// household. household_members rows are themselves family-scoped, so this single lookup
// also confirms the household belongs to this family.
async function assertHouseholdEligible(db: Database, familyId: string, householdId: string, memberId: string) {
  const [row] = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.familyId, familyId), eq(householdMembers.familyMemberId, memberId)))
    .limit(1);
  if (!row) throw new ShoppingServiceError('household_not_eligible', 'You can only create a list for a group you belong to.', 403);
}

const listBaseSelection = {
  id: familyShoppingLists.id,
  familyId: familyShoppingLists.familyId,
  householdId: familyShoppingLists.householdId,
  householdName: households.name,
  name: familyShoppingLists.name,
  description: familyShoppingLists.description,
  shoppingDate: familyShoppingLists.shoppingDate,
  completedAt: familyShoppingLists.completedAt,
  createdByMemberId: familyShoppingLists.createdByMemberId,
  createdAt: familyShoppingLists.createdAt,
  updatedAt: familyShoppingLists.updatedAt,
  createdBy: {
    memberId: familyMembers.id,
    displayName: users.name,
    avatar: users.image,
    identityType: users.identityType,
    avatarConfig: users.avatarConfig,
    hasPhoto: sql<boolean>`${users.photoObjectKey} is not null`
  }
};

async function selectListRows(db: Database, where: SQL) {
  return db
    .select(listBaseSelection)
    .from(familyShoppingLists)
    .innerJoin(familyMembers, and(eq(familyShoppingLists.createdByMemberId, familyMembers.id), eq(familyShoppingLists.familyId, familyMembers.familyId)))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .leftJoin(households, and(eq(familyShoppingLists.householdId, households.id), eq(familyShoppingLists.familyId, households.familyId)))
    .where(where)
    .orderBy(desc(familyShoppingLists.createdAt));
}

function summarizeList(list: Awaited<ReturnType<typeof selectListRows>>[number], totalItems: number, purchasedItems: number) {
  return {
    id: list.id,
    familyId: list.familyId,
    household: list.householdId ? { id: list.householdId, name: list.householdName ?? 'Group' } : null,
    name: list.name,
    description: list.description,
    shoppingDate: list.shoppingDate,
    completedAt: list.completedAt,
    isCompleted: Boolean(list.completedAt),
    createdByMemberId: list.createdByMemberId,
    createdBy: list.createdBy,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
    totalItems,
    purchasedItems,
    remainingItems: totalItems - purchasedItems
  };
}

export async function listShoppingLists(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);

  const myHouseholds = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(and(eq(householdMembers.familyId, familyId), eq(householdMembers.familyMemberId, membership.id)));
  const myHouseholdIds = myHouseholds.map((row) => row.householdId);

  // Eligible lists: whole-family lists (householdId null) plus lists targeted at any
  // household the caller currently belongs to. Owner/guardian status grants nothing
  // extra — eligibility is membership-only, matching the F14 poll privacy model.
  const eligibility = myHouseholdIds.length > 0
    ? or(isNull(familyShoppingLists.householdId), inArray(familyShoppingLists.householdId, myHouseholdIds))
    : isNull(familyShoppingLists.householdId);

  const rows = await selectListRows(db, and(eq(familyShoppingLists.familyId, familyId), eligibility)!);
  if (rows.length === 0) return [];

  const listIds = rows.map((row) => row.id);
  const counts = await db
    .select({
      listId: familyShoppingItems.listId,
      total: sql<number>`count(*)::int`,
      purchased: sql<number>`count(${familyShoppingItems.purchasedAt})::int`
    })
    .from(familyShoppingItems)
    .where(inArray(familyShoppingItems.listId, listIds))
    .groupBy(familyShoppingItems.listId);
  const countsByList = new Map(counts.map((row) => [row.listId, row]));

  return rows.map((row) => {
    const count = countsByList.get(row.id);
    return summarizeList(row, count?.total ?? 0, count?.purchased ?? 0);
  });
}

async function requireEligibleList(db: Database, userId: string, familyId: string, listId: string) {
  assertUuid(listId);
  const membership = await requireFamilyMembership(db, userId, familyId);

  const [list] = await db.select().from(familyShoppingLists).where(and(eq(familyShoppingLists.id, listId), eq(familyShoppingLists.familyId, familyId))).limit(1);
  if (!list) throw new ShoppingServiceError('list_not_found', 'Shopping list not found.', 404);

  if (list.householdId) {
    const [membershipRow] = await db
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, list.householdId), eq(householdMembers.familyId, familyId), eq(householdMembers.familyMemberId, membership.id)))
      .limit(1);
    // Same not-found response as a genuinely missing list: a guessed list id must never
    // reveal that a household list exists to someone outside that household.
    if (!membershipRow) throw new ShoppingServiceError('list_not_found', 'Shopping list not found.', 404);
  }

  return { membership, list };
}

async function requireActiveEligibleList(db: Database, userId: string, familyId: string, listId: string) {
  const result = await requireEligibleList(db, userId, familyId, listId);
  if (result.list.completedAt) throw new ShoppingServiceError('list_completed', 'This list is completed and read-only.', 409);
  return result;
}

const itemSelection = {
  id: familyShoppingItems.id,
  listId: familyShoppingItems.listId,
  name: familyShoppingItems.name,
  quantity: familyShoppingItems.quantity,
  unit: familyShoppingItems.unit,
  note: familyShoppingItems.note,
  purchasedAt: familyShoppingItems.purchasedAt,
  addedByMemberId: familyShoppingItems.addedByMemberId,
  addedBy: {
    memberId: familyMembers.id,
    displayName: users.name,
    avatar: users.image,
    identityType: users.identityType,
    avatarConfig: users.avatarConfig,
    hasPhoto: sql<boolean>`${users.photoObjectKey} is not null`
  },
  createdAt: familyShoppingItems.createdAt,
  updatedAt: familyShoppingItems.updatedAt
};

async function selectItems(db: Database, listId: string) {
  return db
    .select(itemSelection)
    .from(familyShoppingItems)
    .innerJoin(familyMembers, and(eq(familyShoppingItems.addedByMemberId, familyMembers.id), eq(familyShoppingItems.familyId, familyMembers.familyId)))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(eq(familyShoppingItems.listId, listId))
    .orderBy(sql`${familyShoppingItems.purchasedAt} is null desc`, asc(familyShoppingItems.createdAt));
}

export async function getShoppingList(db: Database, userId: string, familyId: string, listId: string) {
  await requireEligibleList(db, userId, familyId, listId);
  const rows = await selectListRows(db, and(eq(familyShoppingLists.id, listId), eq(familyShoppingLists.familyId, familyId))!);
  const [list] = rows;
  if (!list) throw new ShoppingServiceError('list_not_found', 'Shopping list not found.', 404);

  const items = await selectItems(db, listId);
  const totalItems = items.length;
  const purchasedItems = items.filter((item) => item.purchasedAt).length;

  return { ...summarizeList(list, totalItems, purchasedItems), items };
}

type CreateListInput = { name?: unknown; description?: unknown; shoppingDate?: unknown; householdId?: unknown };

export async function createShoppingList(db: Database, userId: string, familyId: string, input: CreateListInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const name = readListName(input.name);
  const description = readListDescription(input.description);
  const shoppingDate = readShoppingDate(input.shoppingDate);

  let householdId: string | null = null;
  if (input.householdId !== undefined && input.householdId !== null && input.householdId !== '') {
    if (typeof input.householdId !== 'string') throw new ShoppingServiceError('invalid_household', 'Choose a valid group.');
    assertUuid(input.householdId, 'household');
    await assertHouseholdEligible(db, familyId, input.householdId, membership.id);
    householdId = input.householdId;
  }

  const [created] = await db
    .insert(familyShoppingLists)
    .values({ familyId, householdId, createdByMemberId: membership.id, name, description, shoppingDate })
    .returning({ id: familyShoppingLists.id });
  if (!created) throw new Error('Shopping list creation did not return the created record.');

  const list = await getShoppingList(db, userId, familyId, created.id);
  const recipientIds = householdId ? await householdMemberIds(db, familyId, householdId) : await familyMemberIds(db, familyId);
  await createNotifications(db, recipientsExcluding(recipientIds, membership.id).map((recipientMemberId) => ({
    familyId,
    recipientMemberId,
    actorMemberId: membership.id,
    type: 'shopping_list_created',
    title: `${list.createdBy.displayName} created a shopping list: ${list.name}`,
    entityType: 'shopping_list',
    entityId: created.id,
    route: `/(family)/shopping/${created.id}`
  })));

  return list;
}

type UpdateListInput = { name?: unknown; description?: unknown; shoppingDate?: unknown };

export async function updateShoppingList(db: Database, userId: string, familyId: string, listId: string, input: UpdateListInput) {
  const { membership, list } = await requireActiveEligibleList(db, userId, familyId, listId);
  if (list.createdByMemberId !== membership.id) {
    throw new ShoppingServiceError('forbidden_list_action', 'Only the list creator can edit it.', 403);
  }

  const name = input.name === undefined ? list.name : readListName(input.name);
  const description = input.description === undefined ? list.description : readListDescription(input.description);
  const shoppingDate = input.shoppingDate === undefined ? list.shoppingDate : readShoppingDate(input.shoppingDate);

  await db.update(familyShoppingLists).set({ name, description, shoppingDate, updatedAt: new Date() }).where(and(eq(familyShoppingLists.id, listId), eq(familyShoppingLists.familyId, familyId)));
  return getShoppingList(db, userId, familyId, listId);
}

// Manual, creator-only, and one-way — owner/guardian role grants no special ability to
// complete or delete someone else's list, and there is no reopening in this phase.
export async function completeShoppingList(db: Database, userId: string, familyId: string, listId: string) {
  const { membership, list } = await requireEligibleList(db, userId, familyId, listId);
  if (list.createdByMemberId !== membership.id) {
    throw new ShoppingServiceError('forbidden_list_action', 'Only the list creator can complete it.', 403);
  }
  if (!list.completedAt) {
    await db.update(familyShoppingLists).set({ completedAt: new Date(), updatedAt: new Date() }).where(and(eq(familyShoppingLists.id, listId), eq(familyShoppingLists.familyId, familyId)));
  }
  return getShoppingList(db, userId, familyId, listId);
}

export async function deleteShoppingList(db: Database, userId: string, familyId: string, listId: string) {
  const { membership, list } = await requireEligibleList(db, userId, familyId, listId);
  if (list.createdByMemberId !== membership.id) {
    throw new ShoppingServiceError('forbidden_list_action', 'Only the list creator can delete it.', 403);
  }
  await db.delete(familyShoppingLists).where(and(eq(familyShoppingLists.id, listId), eq(familyShoppingLists.familyId, familyId)));
}

type ItemInput = { name?: unknown; quantity?: unknown; unit?: unknown; note?: unknown };

// Collaboration is intentionally NOT creator-only: any eligible member may add, edit,
// remove, or toggle items — only list-level management (rename/complete/delete) is
// restricted to the creator.
export async function addShoppingItem(db: Database, userId: string, familyId: string, listId: string, input: ItemInput) {
  const { membership } = await requireActiveEligibleList(db, userId, familyId, listId);
  const name = readItemName(input.name);
  const quantity = readQuantity(input.quantity);
  const unit = readUnit(input.unit);
  const note = readNote(input.note);

  await db.insert(familyShoppingItems).values({ familyId, listId, name, quantity, unit, note, addedByMemberId: membership.id });
  return getShoppingList(db, userId, familyId, listId);
}

export async function updateShoppingItem(db: Database, userId: string, familyId: string, listId: string, itemId: string, input: ItemInput) {
  assertUuid(itemId, 'item');
  await requireActiveEligibleList(db, userId, familyId, listId);

  const [existing] = await db.select().from(familyShoppingItems).where(and(eq(familyShoppingItems.id, itemId), eq(familyShoppingItems.listId, listId), eq(familyShoppingItems.familyId, familyId))).limit(1);
  if (!existing) throw new ShoppingServiceError('item_not_found', 'Item not found.', 404);

  const name = input.name === undefined ? existing.name : readItemName(input.name);
  const quantity = input.quantity === undefined ? existing.quantity : readQuantity(input.quantity);
  const unit = input.unit === undefined ? existing.unit : readUnit(input.unit);
  const note = input.note === undefined ? existing.note : readNote(input.note);

  await db.update(familyShoppingItems).set({ name, quantity, unit, note, updatedAt: new Date() }).where(and(eq(familyShoppingItems.id, itemId), eq(familyShoppingItems.listId, listId)));
  return getShoppingList(db, userId, familyId, listId);
}

export async function deleteShoppingItem(db: Database, userId: string, familyId: string, listId: string, itemId: string) {
  assertUuid(itemId, 'item');
  await requireActiveEligibleList(db, userId, familyId, listId);

  const [existing] = await db.select({ id: familyShoppingItems.id }).from(familyShoppingItems).where(and(eq(familyShoppingItems.id, itemId), eq(familyShoppingItems.listId, listId), eq(familyShoppingItems.familyId, familyId))).limit(1);
  if (!existing) throw new ShoppingServiceError('item_not_found', 'Item not found.', 404);

  await db.delete(familyShoppingItems).where(and(eq(familyShoppingItems.id, itemId), eq(familyShoppingItems.listId, listId)));
  return getShoppingList(db, userId, familyId, listId);
}

export async function setShoppingItemPurchased(db: Database, userId: string, familyId: string, listId: string, itemId: string, purchased: unknown) {
  assertUuid(itemId, 'item');
  if (typeof purchased !== 'boolean') throw new ShoppingServiceError('invalid_item', 'Purchased must be true or false.');
  await requireActiveEligibleList(db, userId, familyId, listId);

  const [existing] = await db.select({ id: familyShoppingItems.id }).from(familyShoppingItems).where(and(eq(familyShoppingItems.id, itemId), eq(familyShoppingItems.listId, listId), eq(familyShoppingItems.familyId, familyId))).limit(1);
  if (!existing) throw new ShoppingServiceError('item_not_found', 'Item not found.', 404);

  await db.update(familyShoppingItems).set({ purchasedAt: purchased ? new Date() : null, updatedAt: new Date() }).where(and(eq(familyShoppingItems.id, itemId), eq(familyShoppingItems.listId, listId)));
  return getShoppingList(db, userId, familyId, listId);
}

// "Clear purchased" removes checked items outright rather than merely unchecking them —
// it's a deliberate declutter action, not something that happens automatically on check.
export async function clearPurchasedItems(db: Database, userId: string, familyId: string, listId: string) {
  await requireActiveEligibleList(db, userId, familyId, listId);
  await db.delete(familyShoppingItems).where(and(eq(familyShoppingItems.listId, listId), eq(familyShoppingItems.familyId, familyId), sql`${familyShoppingItems.purchasedAt} is not null`));
  return getShoppingList(db, userId, familyId, listId);
}
