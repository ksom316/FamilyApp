import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { familyMembers, familyNotifications, householdMembers, users } from '@familyapp/db/schema';

import { requireFamilyMembership } from './family-service';

const RECENT_NOTIFICATIONS_LIMIT = 50;
const MAX_TITLE_LENGTH = 140;
const MAX_MESSAGE_LENGTH = 300;

export type NotificationErrorCode = 'invalid_notification' | 'notification_not_found';

export class NotificationServiceError extends Error {
  constructor(public readonly code: NotificationErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'NotificationServiceError';
  }
}

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new NotificationServiceError('notification_not_found', 'That notification could not be found.', 404);
  }
}

export type NotificationInput = {
  familyId: string;
  recipientMemberId: string;
  actorMemberId?: string | null;
  type: string;
  title: string;
  message?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  route?: string | null;
  // A deterministic, globally-unique key (see the schema comment on family_notifications)
  // that lets a status/time-derived notification be regenerated safely on every sweep —
  // the database silently drops the insert if this key already exists. Leave unset for
  // ordinary one-off, mutation-triggered notifications.
  dedupeKey?: string | null;
};

// A small reusable server-side helper — every feature that wants to notify family members
// calls this after its own mutation has already committed successfully. It deliberately
// never throws: a notification-delivery failure must never surface as if the triggering
// action (creating an event, reporting an emergency, etc.) itself failed.
export async function createNotifications(db: Database, entries: NotificationInput[]) {
  if (entries.length === 0) return;
  try {
    await db.insert(familyNotifications).values(entries.map((entry) => ({
      familyId: entry.familyId,
      recipientMemberId: entry.recipientMemberId,
      actorMemberId: entry.actorMemberId ?? null,
      type: entry.type,
      title: entry.title.slice(0, MAX_TITLE_LENGTH),
      message: entry.message ? entry.message.slice(0, MAX_MESSAGE_LENGTH) : null,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      route: entry.route ?? null,
      dedupeKey: entry.dedupeKey ?? null
    }))).onConflictDoNothing({ target: familyNotifications.dedupeKey });
  } catch (err) {
    console.error('Failed to create notifications', err);
  }
}

/** All current member ids for a family. */
export async function familyMemberIds(db: Database, familyId: string) {
  const rows = await db.select({ id: familyMembers.id }).from(familyMembers).where(eq(familyMembers.familyId, familyId));
  return rows.map((row) => row.id);
}

/** Current member ids of one household (already family-scoped by household_members). */
export async function householdMemberIds(db: Database, familyId: string, householdId: string) {
  const rows = await db
    .select({ id: householdMembers.familyMemberId })
    .from(householdMembers)
    .where(and(eq(householdMembers.familyId, familyId), eq(householdMembers.householdId, householdId)));
  return rows.map((row) => row.id);
}

/** Recipient member ids for a notification: everyone eligible, minus the actor themselves. */
export function recipientsExcluding(memberIds: string[], actorMemberId: string) {
  return [...new Set(memberIds)].filter((id) => id !== actorMemberId);
}

const notificationSelection = {
  id: familyNotifications.id,
  type: familyNotifications.type,
  title: familyNotifications.title,
  message: familyNotifications.message,
  entityType: familyNotifications.entityType,
  entityId: familyNotifications.entityId,
  route: familyNotifications.route,
  readAt: familyNotifications.readAt,
  createdAt: familyNotifications.createdAt,
  actor: {
    memberId: familyMembers.id,
    displayName: users.name,
    avatar: users.image,
    identityType: users.identityType,
    avatarConfig: users.avatarConfig,
    hasPhoto: sql<boolean>`${users.photoObjectKey} is not null`
  }
};

export async function listNotifications(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);

  // Lazily generate this member's own status/time-derived reminders (overdue tasks,
  // today's events, etc.) before reading the list back, so they show up immediately.
  // Safe to run on every call — see notification-sweep.ts for why.
  const { runNotificationSweep } = await import('./notification-sweep');
  await runNotificationSweep(db, familyId, membership.id);

  const [notifications, unreadRows] = await Promise.all([
    db
      .select(notificationSelection)
      .from(familyNotifications)
      .leftJoin(familyMembers, and(eq(familyNotifications.actorMemberId, familyMembers.id), eq(familyNotifications.familyId, familyMembers.familyId)))
      .leftJoin(users, eq(familyMembers.userId, users.id))
      .where(eq(familyNotifications.recipientMemberId, membership.id))
      .orderBy(desc(familyNotifications.createdAt))
      .limit(RECENT_NOTIFICATIONS_LIMIT),
    db
      .select({ id: familyNotifications.id })
      .from(familyNotifications)
      .where(and(eq(familyNotifications.recipientMemberId, membership.id), isNull(familyNotifications.readAt)))
  ]);

  return { notifications, unreadCount: unreadRows.length };
}

export async function markNotificationRead(db: Database, userId: string, familyId: string, notificationId: string) {
  assertUuid(notificationId);
  const membership = await requireFamilyMembership(db, userId, familyId);

  // The WHERE clause is the authorization check: only the recipient's own row can ever
  // match, so a notification addressed to someone else simply updates nothing.
  const updated = await db
    .update(familyNotifications)
    .set({ readAt: new Date() })
    .where(and(
      eq(familyNotifications.id, notificationId),
      eq(familyNotifications.familyId, familyId),
      eq(familyNotifications.recipientMemberId, membership.id),
      isNull(familyNotifications.readAt)
    ))
    .returning({ id: familyNotifications.id });

  if (!updated[0]) {
    const [exists] = await db.select({ id: familyNotifications.id }).from(familyNotifications).where(and(
      eq(familyNotifications.id, notificationId),
      eq(familyNotifications.familyId, familyId),
      eq(familyNotifications.recipientMemberId, membership.id)
    )).limit(1);
    if (!exists) throw new NotificationServiceError('notification_not_found', 'That notification could not be found.', 404);
  }
}

export async function markAllNotificationsRead(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  await db
    .update(familyNotifications)
    .set({ readAt: new Date() })
    .where(and(eq(familyNotifications.recipientMemberId, membership.id), isNull(familyNotifications.readAt)));
}
