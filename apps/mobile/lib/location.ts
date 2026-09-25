import { apiFetch } from './api';

export const SHARE_DURATION_MINUTES = [15, 60, 240] as const;
export type ShareDurationMinutes = (typeof SHARE_DURATION_MINUTES)[number];

export type LocationPerson = { memberId: string; displayName: string; avatar: string | null; role: 'owner' | 'guardian' | 'member' };

export type FamilyLocationShare = {
  memberId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  expiresAt: string;
  updatedAt: string;
  member: LocationPerson;
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

export async function getFamilyLocationShares(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/location/shares`);
  return (await readResponse<{ shares: FamilyLocationShare[] }>(response)).shares;
}

export async function startMyLocationShare(familyId: string, input: StartShareInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/location/shares/me/start`, jsonRequest('POST', input));
  return (await readResponse<{ share: FamilyLocationShare }>(response)).share;
}

export async function pingMyLocationShare(familyId: string, input: PingShareInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/location/shares/me`, jsonRequest('PATCH', input));
  return (await readResponse<{ share: FamilyLocationShare }>(response)).share;
}

export async function stopMyLocationShare(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/location/shares/me/stop`, { method: 'POST' });
  if (!response.ok) await readResponse(response);
}

export async function createFindMeRequest(familyId: string, input: FindMeInput) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/find-me`, jsonRequest('POST', input));
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
