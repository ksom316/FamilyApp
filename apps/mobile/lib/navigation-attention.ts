import { getFamilyEmergencies } from './emergency';
import { getFamilyMessagesUnreadCount } from './chat';
import { getFamilyNotifications } from './notifications';
import { getFamilyPolls } from './polls';
import { getPrivateConversations } from './private-chat';
import { getFamilyTasks } from './tasks';

export type NavigationAttentionCounts = {
  notifications: number;
  tasks: number;
  polls: number;
  emergencies: number;
  chat: number;
};

export const EMPTY_NAVIGATION_ATTENTION_COUNTS: NavigationAttentionCounts = {
  notifications: 0,
  tasks: 0,
  polls: 0,
  emergencies: 0,
  chat: 0
};

// One combined load for every sidebar attention badge. Each count reuses the same
// authenticated endpoint its own screen already calls, so server-side visibility rules
// (household/member privacy, family scoping) are inherited automatically — nothing here
// computes a count from data the caller could not otherwise see. Requests run in
// parallel and are independent: one feature failing to load only zeroes its own badge,
// never the others.
export async function loadNavigationAttentionCounts(familyId: string): Promise<NavigationAttentionCounts> {
  const [notifications, tasks, polls, emergencies, groupChatUnread, privateConversations] = await Promise.allSettled([
    getFamilyNotifications(familyId),
    getFamilyTasks(familyId),
    getFamilyPolls(familyId),
    getFamilyEmergencies(familyId),
    getFamilyMessagesUnreadCount(familyId),
    getPrivateConversations(familyId)
  ]);

  // Chat's badge is the one count combining two independent sources: the shared family
  // room's unread count (server-computed from this member's own read-state row) plus the
  // sum of every private conversation's own unreadCount (already computed per-conversation,
  // reused as-is — never recomputed from raw messages here).
  const privateUnreadTotal = privateConversations.status === 'fulfilled'
    ? privateConversations.value.reduce((sum, conversation) => sum + conversation.unreadCount, 0)
    : 0;

  return {
    notifications: notifications.status === 'fulfilled' ? notifications.value.unreadCount : 0,
    // Unfinished chores/tasks actually assigned to me — never something I merely
    // created for someone else, and never a completed assignment.
    tasks: tasks.status === 'fulfilled'
      ? tasks.value.filter((task) => task.isAssignedToMe && !task.myCompletedAt).length
      : 0,
    // Polls I can currently see, still open, that I have not voted on yet.
    polls: polls.status === 'fulfilled'
      ? polls.value.filter((poll) => !poll.isClosed && poll.myOptionId === null).length
      : 0,
    emergencies: emergencies.status === 'fulfilled' ? emergencies.value.active.length : 0,
    chat: (groupChatUnread.status === 'fulfilled' ? groupChatUnread.value : 0) + privateUnreadTotal
  };
}

type AttentionRefreshListener = () => void;
const attentionRefreshListeners = new Set<AttentionRefreshListener>();

/**
 * The sidebar's badge counts otherwise only refresh on a fixed 30s cadence (see
 * FamilyNavigation), which is fine for ambient updates but leaves a stale count right after
 * the user does something that demonstrably changed one of them — e.g. actually reading the
 * family chat or a private conversation. Rather than adding a second timer, screens that
 * just changed a read-state call requestAttentionRefresh() once the server has confirmed it,
 * and every subscriber (currently just the sidebar) re-runs its own existing load function
 * immediately. This never fetches on its own — it only fans out a "please refresh now" signal
 * to whoever is already responsible for loading the counts.
 */
export function subscribeToAttentionRefresh(listener: AttentionRefreshListener) {
  attentionRefreshListeners.add(listener);
  return () => {
    attentionRefreshListeners.delete(listener);
  };
}

export function requestAttentionRefresh() {
  for (const listener of attentionRefreshListeners) listener();
}
