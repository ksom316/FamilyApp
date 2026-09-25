import { apiFetch } from './api';

export type ShoppingPerson = { memberId: string; displayName: string; avatar: string | null };

export type ShoppingItem = {
  id: string;
  listId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  purchasedAt: string | null;
  addedByMemberId: string;
  addedBy: ShoppingPerson;
  createdAt: string;
  updatedAt: string;
};

export type ShoppingListSummary = {
  id: string;
  familyId: string;
  household: { id: string; name: string } | null;
  name: string;
  description: string | null;
  shoppingDate: string | null;
  completedAt: string | null;
  isCompleted: boolean;
  createdByMemberId: string;
  createdBy: ShoppingPerson;
  createdAt: string;
  updatedAt: string;
  totalItems: number;
  purchasedItems: number;
  remainingItems: number;
};

export type ShoppingListDetail = ShoppingListSummary & { items: ShoppingItem[] };

export type CreateListInput = { name: string; description?: string; shoppingDate?: string; householdId?: string };
export type UpdateListInput = { name?: string; description?: string | null; shoppingDate?: string | null };
export type ItemInput = { name: string; quantity?: number | null; unit?: string | null; note?: string | null };

export class ShoppingApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'ShoppingApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new ShoppingApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function getShoppingLists(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/shopping-lists`);
  return (await readResponse<{ lists: ShoppingListSummary[] }>(response)).lists;
}

export async function getShoppingList(familyId: string, listId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/shopping-lists/${encodeURIComponent(listId)}`);
  return (await readResponse<{ list: ShoppingListDetail }>(response)).list;
}

export async function createShoppingList(familyId: string, input: CreateListInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/shopping-lists`, jsonRequest('POST', input));
  return (await readResponse<{ list: ShoppingListDetail }>(response)).list;
}

export async function updateShoppingList(familyId: string, listId: string, input: UpdateListInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/shopping-lists/${encodeURIComponent(listId)}`, jsonRequest('PATCH', input));
  return (await readResponse<{ list: ShoppingListDetail }>(response)).list;
}

export async function completeShoppingList(familyId: string, listId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/shopping-lists/${encodeURIComponent(listId)}/complete`, { method: 'POST' });
  return (await readResponse<{ list: ShoppingListDetail }>(response)).list;
}

export async function deleteShoppingList(familyId: string, listId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/shopping-lists/${encodeURIComponent(listId)}`, { method: 'DELETE' });
  if (!response.ok) await readResponse(response);
}

export async function addShoppingItem(familyId: string, listId: string, input: ItemInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/shopping-lists/${encodeURIComponent(listId)}/items`, jsonRequest('POST', input));
  return (await readResponse<{ list: ShoppingListDetail }>(response)).list;
}

export async function updateShoppingItem(familyId: string, listId: string, itemId: string, input: Partial<ItemInput>) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/shopping-lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`, jsonRequest('PATCH', input));
  return (await readResponse<{ list: ShoppingListDetail }>(response)).list;
}

export async function deleteShoppingItem(familyId: string, listId: string, itemId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/shopping-lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
  return (await readResponse<{ list: ShoppingListDetail }>(response)).list;
}

export async function setShoppingItemPurchased(familyId: string, listId: string, itemId: string, purchased: boolean) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/shopping-lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}/purchased`, jsonRequest('PATCH', { purchased }));
  return (await readResponse<{ list: ShoppingListDetail }>(response)).list;
}

export async function clearPurchasedItems(familyId: string, listId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/shopping-lists/${encodeURIComponent(listId)}/items/clear-purchased`, { method: 'POST' });
  return (await readResponse<{ list: ShoppingListDetail }>(response)).list;
}
