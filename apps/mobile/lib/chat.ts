import { apiFetch } from './api';
import type { AvatarConfig } from './profile';

export const MAX_MESSAGE_LENGTH = 2000;

export type ChatSender = {
  memberId: string;
  displayName: string;
  avatar: string | null;
  identityType: string;
  avatarConfig: AvatarConfig | null;
  hasPhoto: boolean;
  role: 'owner' | 'guardian' | 'member';
};

export type FamilyMessage = {
  id: string;
  familyId: string;
  senderMemberId: string;
  text: string;
  createdAt: string;
  sender: ChatSender;
};

export class ChatApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'ChatApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new ChatApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

export async function getFamilyMessages(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/messages`);
  return (await readResponse<{ messages: FamilyMessage[] }>(response)).messages;
}

export async function sendFamilyMessage(familyId: string, text: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  return (await readResponse<{ message: FamilyMessage }>(response)).message;
}

export async function getFamilyMessagesUnreadCount(familyId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/messages/unread-count`);
  return (await readResponse<{ unreadCount: number }>(response)).unreadCount;
}

export async function markFamilyMessagesRead(familyId: string, messageId: string) {
  const response = await apiFetch(`/families/${encodeURIComponent(familyId)}/messages/read`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId })
  });
  if (!response.ok) await readResponse(response);
}
