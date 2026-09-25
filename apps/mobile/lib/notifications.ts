import { apiFetch } from './api';

export type NotificationActor = { memberId: string; displayName: string; avatar: string | null };

export type FamilyNotification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  entityType: string | null;
  entityId: string | null;
  route: string | null;
  readAt: string | null;
  createdAt: string;
  actor: NotificationActor | null;
};

export type NotificationList = { notifications: FamilyNotification[]; unreadCount: number };

export class NotificationApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'NotificationApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new NotificationApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

export async function getFamilyNotifications(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/notifications`);
  return readResponse<NotificationList>(response);
}

export async function markNotificationRead(familyId: string, notificationId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH' });
  if (!response.ok) await readResponse(response);
}

export async function markAllNotificationsRead(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/notifications/read-all`, { method: 'POST' });
  if (!response.ok) await readResponse(response);
}
