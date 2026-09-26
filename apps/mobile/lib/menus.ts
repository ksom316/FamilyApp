import { apiFetch } from './api';
import type { AvatarConfig } from './profile';
import type { ShoppingListDetail } from './shopping';

export type MenuPerson = {
  memberId: string;
  displayName: string;
  avatar: string | null;
  identityType: string;
  avatarConfig: AvatarConfig | null;
  hasPhoto: boolean;
};
export type MealType = 'breakfast' | 'lunch' | 'dinner';

export type Meal = {
  id: string;
  menuId: string;
  mealDate: string;
  mealType: MealType;
  mealName: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Menu = {
  id: string;
  familyId: string;
  household: { id: string; name: string } | null;
  weekStartDate: string;
  weekEndDate: string;
  title: string | null;
  createdByMemberId: string;
  createdBy: MenuPerson;
  createdAt: string;
  updatedAt: string;
  meals: Meal[];
};

export type MenuForTarget = { weekStartDate: string; weekEndDate: string; menu: Menu | null; hasPreviousMenu: boolean };

export type CreateMenuInput = { householdId?: string; weekStartDate: string; title?: string };
export type SetMealInput = { mealDate: string; mealType: MealType; mealName: string; note?: string };

export class MenuApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'MenuApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new MenuApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function getMenuForTarget(familyId: string, householdId: string | null, weekStartDate: string) {
  const params = new URLSearchParams({ weekStartDate });
  if (householdId) params.set('householdId', householdId);
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/menus?${params.toString()}`);
  return readResponse<MenuForTarget>(response);
}

export async function getMenu(familyId: string, menuId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/menus/${encodeURIComponent(menuId)}`);
  return (await readResponse<{ menu: Menu }>(response)).menu;
}

export async function createMenu(familyId: string, input: CreateMenuInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/menus`, jsonRequest('POST', input));
  return (await readResponse<{ menu: Menu }>(response)).menu;
}

export async function updateMenu(familyId: string, menuId: string, input: { title?: string | null }) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/menus/${encodeURIComponent(menuId)}`, jsonRequest('PATCH', input));
  return (await readResponse<{ menu: Menu }>(response)).menu;
}

export async function deleteMenu(familyId: string, menuId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/menus/${encodeURIComponent(menuId)}`, { method: 'DELETE' });
  if (!response.ok) await readResponse(response);
}

export async function setMeal(familyId: string, menuId: string, input: SetMealInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/menus/${encodeURIComponent(menuId)}/meals`, jsonRequest('PUT', input));
  return (await readResponse<{ menu: Menu }>(response)).menu;
}

export async function clearMeal(familyId: string, menuId: string, mealDate: string, mealType: MealType) {
  const params = new URLSearchParams({ mealDate, mealType });
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/menus/${encodeURIComponent(menuId)}/meals?${params.toString()}`, { method: 'DELETE' });
  return (await readResponse<{ menu: Menu }>(response)).menu;
}

export async function copyPreviousWeek(familyId: string, menuId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/menus/${encodeURIComponent(menuId)}/copy-previous-week`, { method: 'POST' });
  return (await readResponse<{ menu: Menu }>(response)).menu;
}

export async function createShoppingListFromMenu(familyId: string, menuId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/menus/${encodeURIComponent(menuId)}/shopping-list`, { method: 'POST' });
  return (await readResponse<{ list: ShoppingListDetail }>(response)).list;
}
