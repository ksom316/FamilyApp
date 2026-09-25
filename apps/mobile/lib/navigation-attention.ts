import { getFamilyEmergencies } from './emergency';
import { getFamilyNotifications } from './notifications';
import { getFamilyPolls } from './polls';
import { getFamilyTasks } from './tasks';

export type NavigationAttentionCounts = {
  notifications: number;
  tasks: number;
  polls: number;
  emergencies: number;
};

export const EMPTY_NAVIGATION_ATTENTION_COUNTS: NavigationAttentionCounts = {
  notifications: 0,
  tasks: 0,
  polls: 0,
  emergencies: 0
};

// One combined load for every sidebar attention badge. Each count reuses the same
// authenticated endpoint its own screen already calls, so server-side visibility rules
// (household/member privacy, family scoping) are inherited automatically — nothing here
// computes a count from data the caller could not otherwise see. Requests run in
// parallel and are independent: one feature failing to load only zeroes its own badge,
// never the others.
export async function loadNavigationAttentionCounts(familyId: string): Promise<NavigationAttentionCounts> {
  const [notifications, tasks, polls, emergencies] = await Promise.allSettled([
    getFamilyNotifications(familyId),
    getFamilyTasks(familyId),
    getFamilyPolls(familyId),
    getFamilyEmergencies(familyId)
  ]);

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
    emergencies: emergencies.status === 'fulfilled' ? emergencies.value.active.length : 0
  };
}
