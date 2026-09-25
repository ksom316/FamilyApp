import { apiFetch } from './api';
import type { AvatarConfig } from './profile';

export const MAX_PRIVATE_MESSAGE_LENGTH = 2000;

export type PrivateChatMember = {
  memberId: string;
  displayName: string;
  avatar: string | null;
  identityType: string;
  avatarConfig: AvatarConfig | null;
  hasPhoto: boolean;
  role: 'owner' | 'guardian' | 'member';
};

export type PrivateConversation = {
  id: string;
  familyId: string;
  createdAt: string;
  lastMessageAt: string | null;
  recipient: PrivateChatMember;
};

export type PrivateConversationInboxItem = PrivateConversation & {
  latestMessage: {
    id: string;
    text: string;
    createdAt: string;
    senderMemberId: string;
  } | null;
  unreadCount: number;
};

export type PrivateMessage = {
  id: string;
  familyId: string;
  conversationId: string;
  senderMemberId: string;
  text: string;
  createdAt: string;
  sender: PrivateChatMember;
};

export class PrivateChatApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'PrivateChatApiError';
  }
}

async function readResponse<T>(response: Response) {
  const body = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new PrivateChatApiError(body.error ?? 'Something went wrong.', body.code);
  return body;
}

function conversationPath(familyId: string, conversationId = '') {
  const base = `/families/${encodeURIComponent(familyId)}/private-conversations`;
  return conversationId ? `${base}/${encodeURIComponent(conversationId)}` : base;
}

export async function getPrivateConversations(familyId: string) {
  const response = await apiFetch(conversationPath(familyId));
  return (await readResponse<{ conversations: PrivateConversationInboxItem[] }>(response)).conversations;
}

export async function startPrivateConversation(familyId: string, recipientMemberId: string) {
  const response = await apiFetch(conversationPath(familyId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipientMemberId })
  });
  return (await readResponse<{ conversation: PrivateConversation }>(response)).conversation;
}

export async function getPrivateMessages(familyId: string, conversationId: string) {
  const response = await apiFetch(`${conversationPath(familyId, conversationId)}/messages`);
  return readResponse<{ conversation: PrivateConversation; messages: PrivateMessage[] }>(response);
}

export async function sendPrivateMessage(familyId: string, conversationId: string, text: string) {
  const response = await apiFetch(`${conversationPath(familyId, conversationId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  return (await readResponse<{ message: PrivateMessage }>(response)).message;
}

export async function markPrivateConversationRead(familyId: string, conversationId: string, messageId: string) {
  const response = await apiFetch(`${conversationPath(familyId, conversationId)}/read`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId })
  });
  if (!response.ok) await readResponse(response);
}
