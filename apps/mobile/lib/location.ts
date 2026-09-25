import { apiFetch } from './api';

export const SHARE_DURATION_MINUTES = [15, 60, 240] as const;
export type ShareDurationMinutes = (typeof SHARE_DURATION_MINUTES)[number];

export type LocationPerson = { memberId: string; displayName: string; avatar: string | null; role: 'owner' | 'guardian' | 'member' };

export type LocationAudience =
  | { type: 'family' }
  | { type: 'household'; household: { id: string; name: string } }
  | { type: 'members'; members: FindMePerson[] };

export type FamilyLocationShare = {
  id: string;
  memberId: string;
  purpose: 'location' | 'come_find_me';
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  startedAt: string;
  expiresAt: string;
  updatedAt: string;
  member: LocationPerson;
  audience: LocationAudience;
};

export type FindMePerson = { memberId: string; displayName: string; avatar: string | null };

export type OutgoingFindMeRequest = {
  id: string;
  expiresAt: string;
  response: 'coming' | 'dismissed' | null;
  respondedAt: string | null;
  createdAt: string;
  recipient: FindMePerson;
};

export type IncomingFindMeRequest = {
  id: string;
  expiresAt: string;
  response: 'coming' | 'dismissed' | null;
  respondedAt: string | null;
  createdAt: string;
  requester: FindMePerson;
};

export type StartShareInput = { latitude: number; longitude: number; accuracyMeters?: number | null; durationMinutes: ShareDurationMinutes };
export type PingShareInput = { latitude: number; longitude: number; accuracyMeters?: number | null };
export type FindMeInput = { recipientMemberId: string; durationMinutes: ShareDurationMinutes; latitude: number; longitude: number; accuracyMeters?: number | null };
export type ComeFindMeAudienceInput =
  | { audienceType: 'family' }
  | { audienceType: 'household'; householdId: string }
  | { audienceType: 'members'; memberIds: string[] };
export type StartComeFindMeInput = StartShareInput & ComeFindMeAudienceInput;

export class LocationApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'LocationApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new LocationApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

/** Keep optional provider accuracy from invalidating an otherwise usable location. */
export function normalizeLocationAccuracy(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 50_000
    ? value
    : null;
}

function withNormalizedAccuracy<T extends { accuracyMeters?: number | null }>(input: T): T {
  return { ...input, accuracyMeters: normalizeLocationAccuracy(input.accuracyMeters) };
}

export async function getFamilyLocationShares(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/location/shares`);
  return (await readResponse<{ shares: FamilyLocationShare[] }>(response)).shares;
}

export async function getFamilyLocationShare(familyId: string, shareId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/location/shares/${encodeURIComponent(shareId)}`);
  return (await readResponse<{ share: FamilyLocationShare }>(response)).share;
}

export async function startMyLocationShare(familyId: string, input: StartShareInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/location/shares/me/start`, jsonRequest('POST', withNormalizedAccuracy(input)));
  return (await readResponse<{ share: FamilyLocationShare }>(response)).share;
}

export async function pingMyLocationShare(familyId: string, input: PingShareInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/location/shares/me`, jsonRequest('PATCH', withNormalizedAccuracy(input)));
  return (await readResponse<{ share: FamilyLocationShare }>(response)).share;
}

export async function stopMyLocationShare(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/location/shares/me/stop`, { method: 'POST' });
  if (!response.ok) await readResponse(response);
}

export async function startComeFindMe(familyId: string, input: StartComeFindMeInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/location/come-find-me/start`, jsonRequest('POST', withNormalizedAccuracy(input)));
  return (await readResponse<{ share: FamilyLocationShare }>(response)).share;
}

export async function updateComeFindMeAudience(familyId: string, input: ComeFindMeAudienceInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/location/come-find-me/me/audience`, jsonRequest('PATCH', input));
  return (await readResponse<{ share: FamilyLocationShare }>(response)).share;
}

export async function createFindMeRequest(familyId: string, input: FindMeInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/find-me`, jsonRequest('POST', withNormalizedAccuracy(input)));
  return (await readResponse<{ request: OutgoingFindMeRequest }>(response)).request;
}

export async function getOutgoingFindMeRequest(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/find-me/outgoing`);
  return (await readResponse<{ request: OutgoingFindMeRequest | null }>(response)).request;
}

export async function getIncomingFindMeRequests(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/find-me/incoming`);
  return (await readResponse<{ requests: IncomingFindMeRequest[] }>(response)).requests;
}

export async function respondToFindMeRequest(familyId: string, requestId: string, response: 'coming' | 'dismissed') {
  const apiResponse = await apiFetch(`/families/${encodeURIComponent(familyId)}/find-me/${encodeURIComponent(requestId)}/respond`, jsonRequest('PATCH', { response }));
  if (!apiResponse.ok) await readResponse(apiResponse);
}

export async function cancelMyFindMeRequest(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/find-me/me`, { method: 'DELETE' });
  if (!response.ok) await readResponse(response);
}

const EARTH_RADIUS_KM = 6371;

/** Approximate straight-line distance in kilometers between two coordinates (Haversine). Not travel distance/time. */
export function haversineDistanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatDistanceKm(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km away`;
}

export function mapsUrl(latitude: number, longitude: number) {
  return `https://maps.google.com/?q=${latitude},${longitude}`;
}

export function directionsUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

export function formatLocationAudience(audience: LocationAudience) {
  if (audience.type === 'family') return 'Entire family';
  if (audience.type === 'household') return audience.household.name;
  if (audience.members.length === 1) return audience.members[0]?.displayName ?? 'One person';
  return `${audience.members.length} people`;
}
