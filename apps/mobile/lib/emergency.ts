import { apiFetch } from './api';

export const EMERGENCY_TYPES = ['need_help', 'medical', 'safety_concern', 'other'] as const;
export type EmergencyType = (typeof EMERGENCY_TYPES)[number];

export const RESPONSE_STATUSES = ['seen', 'responding'] as const;
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

export const EMERGENCY_TYPE_LABELS: Record<EmergencyType, string> = {
  need_help: 'Need help',
  medical: 'Medical',
  safety_concern: 'Safety concern',
  other: 'Other'
};

export type EmergencyPerson = { memberId: string; displayName: string; avatar: string | null };

export type EmergencyAcknowledgement = {
  id: string;
  responseStatus: ResponseStatus;
  createdAt: string;
  member: EmergencyPerson;
};

export type EmergencyIncident = {
  id: string;
  emergencyType: EmergencyType;
  message: string | null;
  status: 'active' | 'resolved';
  createdAt: string;
  resolvedAt: string | null;
  createdBy: EmergencyPerson;
  resolvedBy: { memberId: string; displayName: string } | null;
  acknowledgements: EmergencyAcknowledgement[];
};

export type EmergencyList = { active: EmergencyIncident[]; resolved: EmergencyIncident[] };

export class EmergencyApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'EmergencyApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new EmergencyApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function getFamilyEmergencies(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/emergencies`);
  return readResponse<EmergencyList>(response);
}

export async function getEmergency(familyId: string, incidentId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/emergencies/${encodeURIComponent(incidentId)}`);
  return (await readResponse<{ incident: EmergencyIncident }>(response)).incident;
}

export async function reportEmergency(familyId: string, input: { emergencyType: EmergencyType; message?: string | null }) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/emergencies`, jsonRequest('POST', input));
  return (await readResponse<{ incident: EmergencyIncident }>(response)).incident;
}

export async function acknowledgeEmergency(familyId: string, incidentId: string, responseStatus: ResponseStatus) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/emergencies/${encodeURIComponent(incidentId)}/acknowledge`, jsonRequest('POST', { responseStatus }));
  return (await readResponse<{ incident: EmergencyIncident }>(response)).incident;
}

export async function resolveEmergency(familyId: string, incidentId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/emergencies/${encodeURIComponent(incidentId)}/resolve`, { method: 'POST' });
  return (await readResponse<{ incident: EmergencyIncident }>(response)).incident;
}
