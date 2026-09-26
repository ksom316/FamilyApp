import { and, eq, isNull, ne, sql } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { authAccounts, authSessions, familyMembers, pushDevices, users } from '@familyapp/db/schema';

import { leaveFamily, ownerBlockedFromLeaving } from './family-service';
import { removeMyProfilePhoto } from './profile-service';
import type { ObjectStorage } from './object-storage';

export type AccountErrorCode = 'owner_must_resolve_first';

export class AccountServiceError extends Error {
  constructor(public readonly code: AccountErrorCode, message: string, public readonly status = 409) {
    super(message);
    this.name = 'AccountServiceError';
  }
}

/**
 * Deletes a FamilyApp account. Deliberately does NOT delete the `users` row: countless
 * tables reference a family_members row (which references users.id) with ON DELETE
 * RESTRICT as the creator/sender/assignee of historical family content, so cascading a
 * real user delete through an active, multi-member family would fail outright the moment
 * any such row exists — which is effectively always. Instead this:
 *
 * 1. Leaves every family the user actively belongs to (reusing the exact same leaveFamily
 *    path Leave Family uses — same owner-safety rule, same "notify remaining members" step,
 *    same soft-departure/family-teardown behavior).
 * 2. Deletes the private profile photo, all sessions, all OAuth/credential accounts, and
 *    all registered push devices — the account becomes unusable/unreachable everywhere.
 * 3. Anonymizes the surviving `users` row's PII in place (name, email, avatar, photo).
 *
 * Family-owned historical content (memories, calendar events, chat messages, chores,
 * polls, capsules...) this user created is never touched — it keeps existing, now
 * attributed to the anonymized "Deleted user" record rather than being destroyed, exactly
 * matching what already happens for any other departed member.
 */
export async function deleteAccount(db: Database, userId: string, storage: ObjectStorage | undefined) {
  const activeMemberships = await db
    .select({ id: familyMembers.id, familyId: familyMembers.familyId, role: familyMembers.role })
    .from(familyMembers)
    .where(and(eq(familyMembers.userId, userId), isNull(familyMembers.leftAt)));

  // Pre-flight across every membership before making any change: never silently promote a
  // successor, and never partially delete an account that turns out to be blocked halfway
  // through. If the user owns any family that still has other active members, they must
  // resolve that first (transfer ownership, or have it resolve down to them being the last
  // member) — identical to the rule Leave Family enforces per family.
  const blockingFamilyIds: string[] = [];
  for (const membership of activeMemberships) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(familyMembers)
      .where(and(
        eq(familyMembers.familyId, membership.familyId),
        isNull(familyMembers.leftAt),
        ne(familyMembers.id, membership.id)
      ));
    if (ownerBlockedFromLeaving(membership.role, row?.count ?? 0)) blockingFamilyIds.push(membership.familyId);
  }
  if (blockingFamilyIds.length > 0) {
    throw new AccountServiceError(
      'owner_must_resolve_first',
      `Transfer ownership (or remove other members) in ${blockingFamilyIds.length} famil${blockingFamilyIds.length === 1 ? 'y' : 'ies'} you own before deleting your account.`,
      409
    );
  }

  for (const membership of activeMemberships) {
    await leaveFamily(db, userId, membership.familyId);
  }

  await removeMyProfilePhoto(db, userId, storage).catch(() => {});

  await db.delete(authAccounts).where(eq(authAccounts.userId, userId));
  await db.delete(authSessions).where(eq(authSessions.userId, userId));
  await db.delete(pushDevices).where(eq(pushDevices.userId, userId));

  await db.update(users).set({
    name: 'Deleted user',
    email: `deleted-${userId}@deleted.familyapp.invalid`,
    emailVerified: false,
    image: null,
    identityType: 'initials',
    avatarConfig: null,
    photoObjectKey: null,
    photoMimeType: null,
    updatedAt: new Date()
  }).where(eq(users.id, userId));
}
