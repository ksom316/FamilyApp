export const HOME_MESSAGE_PREVIEW_LENGTH = 96;
export const HOME_MESSAGES_ROUTE = '/(family)/chat';

export type HomePrivateConversation = {
  id: string;
  familyId: string;
  createdAt: string;
  lastMessageAt: string | null;
  recipient: { displayName: string };
  latestMessage: { text: string; senderMemberId: string } | null;
  unreadCount: number;
};

export type HomeMessageEntry = {
  id: string;
  title: string;
  preview: string;
  unreadCount: number;
  route: string;
};

export type HomeMessagesSummary = {
  familyUnreadCount: number;
  privateUnreadCount: number;
  totalUnreadCount: number;
  entries: HomeMessageEntry[];
};

export function normalizeHomeMessagePreview(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const characters = Array.from(normalized);
  return characters.length <= HOME_MESSAGE_PREVIEW_LENGTH
    ? normalized
    : `${characters.slice(0, HOME_MESSAGE_PREVIEW_LENGTH - 1).join('').trimEnd()}…`;
}

export function buildHomeMessagesSummary(
  familyName: string,
  currentMemberId: string,
  familyUnreadCount: number,
  conversations: HomePrivateConversation[]
): HomeMessagesSummary {
  const unreadPrivate = conversations
    .filter((conversation) => conversation.unreadCount > 0)
    .sort((a, b) => new Date(b.lastMessageAt ?? b.createdAt).getTime() - new Date(a.lastMessageAt ?? a.createdAt).getTime());
  const privateUnreadCount = unreadPrivate.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const entries: HomeMessageEntry[] = [];

  if (familyUnreadCount > 0) {
    entries.push({
      id: 'family-chat',
      title: familyName,
      preview: `${familyUnreadCount} unread in Family Chat`,
      unreadCount: familyUnreadCount,
      route: '/(family)/chat/family'
    });
  }
  for (const conversation of unreadPrivate) {
    if (entries.length >= 2) break;
    const latest = conversation.latestMessage;
    const preview = latest && latest.senderMemberId !== currentMemberId
      ? normalizeHomeMessagePreview(latest.text)
      : `${conversation.unreadCount} unread private message${conversation.unreadCount === 1 ? '' : 's'}`;
    entries.push({
      id: conversation.id,
      title: conversation.recipient.displayName,
      preview,
      unreadCount: conversation.unreadCount,
      route: `/(family)/private-chat/${conversation.id}`
    });
  }

  return {
    familyUnreadCount,
    privateUnreadCount,
    totalUnreadCount: familyUnreadCount + privateUnreadCount,
    entries
  };
}

export function isCompactHomeMessages(width: number) {
  return width < 620;
}
