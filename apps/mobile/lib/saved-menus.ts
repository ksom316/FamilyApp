import { apiFetch } from './api';
import type { Menu, MenuPerson, MealType } from './menus';
import type { ShoppingListDetail } from './shopping';

export type AudienceType = 'family' | 'household' | 'members';
export type AudiencePerson = { memberId: string; displayName: string; avatar: string | null };

export type Audience =
  | { type: 'family' }
  | { type: 'household'; household: { id: string; name: string } }
  | { type: 'members'; members: AudiencePerson[] };

export type SavedMenuMeal = {
  id: string;
  savedMenuId: string;
  dayOfWeek: number; // 0 = Monday .. 6 = Sunday
  mealType: MealType;
  mealName: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SavedMenuSummary = {
  id: string;
  familyId: string;
  audience: Audience;
  name: string;
  description: string | null;
  isActive: boolean;
  createdByMemberId: string;
  createdBy: MenuPerson;
  createdAt: string;
  updatedAt: string;
};

export type SavedMenuDetail = SavedMenuSummary & { meals: SavedMenuMeal[] };
export type ActiveMenuHomeCard = SavedMenuSummary & { todayMeals: SavedMenuMeal[] };
export type MenuHome = { activeMenus: ActiveMenuHomeCard[]; otherMenus: SavedMenuSummary[] };

export type SavedMenuAudienceInput =
  | { audienceType: 'family' }
  | { audienceType: 'household'; householdId: string }
  | { audienceType: 'members'; memberIds: string[] };

export type CreateSavedMenuInput = { name: string; description?: string } & SavedMenuAudienceInput;

// Note: this is deliberately NOT `{ name?, description? } & Partial<SavedMenuAudienceInput>`.
// `keyof` of a union type is the *intersection* of each member's keys, so
// `Partial<SavedMenuAudienceInput>` collapses to just `{ audienceType?: ... }` and silently
// drops `householdId`/`memberIds`. Spelling out each variant keeps them intact.
type BaseUpdateFields = { name?: string; description?: string | null };
export type UpdateSavedMenuInput =
  | (BaseUpdateFields & { audienceType?: undefined })
  | (BaseUpdateFields & { audienceType: 'family' })
  | (BaseUpdateFields & { audienceType: 'household'; householdId: string })
  | (BaseUpdateFields & { audienceType: 'members'; memberIds: string[] });
export type SetSavedMealInput = { dayOfWeek: number; mealType: MealType; mealName: string; note?: string };

export class SavedMenuApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'SavedMenuApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new SavedMenuApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function getMenuHome(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/saved-menus/home`);
  return readResponse<MenuHome>(response);
}

export async function getSavedMenus(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/saved-menus`);
  return (await readResponse<{ savedMenus: SavedMenuSummary[] }>(response)).savedMenus;
}

export async function getSavedMenu(familyId: string, savedMenuId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/saved-menus/${encodeURIComponent(savedMenuId)}`);
  return (await readResponse<{ savedMenu: SavedMenuDetail }>(response)).savedMenu;
}

export async function createSavedMenu(familyId: string, input: CreateSavedMenuInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/saved-menus`, jsonRequest('POST', input));
  return (await readResponse<{ savedMenu: SavedMenuDetail }>(response)).savedMenu;
}

export async function updateSavedMenu(familyId: string, savedMenuId: string, input: UpdateSavedMenuInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/saved-menus/${encodeURIComponent(savedMenuId)}`, jsonRequest('PATCH', input));
  return (await readResponse<{ savedMenu: SavedMenuDetail }>(response)).savedMenu;
}

export async function deleteSavedMenu(familyId: string, savedMenuId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/saved-menus/${encodeURIComponent(savedMenuId)}`, { method: 'DELETE' });
  if (!response.ok) await readResponse(response);
}

export async function duplicateSavedMenu(familyId: string, savedMenuId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/saved-menus/${encodeURIComponent(savedMenuId)}/duplicate`, { method: 'POST' });
  return (await readResponse<{ savedMenu: SavedMenuDetail }>(response)).savedMenu;
}

export async function setSavedMenuActive(familyId: string, savedMenuId: string, active: boolean) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/saved-menus/${encodeURIComponent(savedMenuId)}/active`, jsonRequest('PATCH', { active }));
  return (await readResponse<{ savedMenu: SavedMenuDetail }>(response)).savedMenu;
}

export async function setSavedMenuMeal(familyId: string, savedMenuId: string, input: SetSavedMealInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/saved-menus/${encodeURIComponent(savedMenuId)}/meals`, jsonRequest('PUT', input));
  return (await readResponse<{ savedMenu: SavedMenuDetail }>(response)).savedMenu;
}

export async function clearSavedMenuMeal(familyId: string, savedMenuId: string, dayOfWeek: number, mealType: MealType) {
  const params = new URLSearchParams({ dayOfWeek: String(dayOfWeek), mealType });
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/saved-menus/${encodeURIComponent(savedMenuId)}/meals?${params.toString()}`, { method: 'DELETE' });
  return (await readResponse<{ savedMenu: SavedMenuDetail }>(response)).savedMenu;
}

export async function applySavedMenuToWeek(familyId: string, savedMenuId: string, weekStartDate: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/saved-menus/${encodeURIComponent(savedMenuId)}/apply`, jsonRequest('POST', { weekStartDate }));
  return (await readResponse<{ menu: Menu }>(response)).menu;
}

export async function createShoppingListFromSavedMenu(familyId: string, savedMenuId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/saved-menus/${encodeURIComponent(savedMenuId)}/shopping-list`, { method: 'POST' });
  return (await readResponse<{ list: ShoppingListDetail }>(response)).list;
}

/** "Entire family" / "Parents" / "James & Ama" / "James, Ama + 2 more" */
export function formatAudienceLabel(audience: Audience) {
  if (audience.type === 'family') return 'Entire family';
  if (audience.type === 'household') return audience.household.name;
  const names = audience.members.map((member) => member.displayName);
  if (names.length === 0) return 'No one yet';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]}, ${names[1]} + ${names.length - 2} more`;
}
