import { asc, eq, sql } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { families, familyInvitations, familyMembers } from '@familyapp/db/schema';

export type FamilyErrorCode = 'invalid_name' | 'invalid_invitation' | 'expired_invitation' | 'revoked_invitation' | 'used_invitation';

export class FamilyServiceError extends Error {
  constructor(public readonly code: FamilyErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'FamilyServiceError';
  }
}

export async function listFamilyMemberships(db: Database, userId: string) {
  return db
    .select({
      id: familyMembers.id,
      familyId: familyMembers.familyId,
      familyName: families.name,
      role: familyMembers.role,
      joinedAt: familyMembers.joinedAt
    })
    .from(familyMembers)
    .innerJoin(families, eq(familyMembers.familyId, families.id))
    .where(eq(familyMembers.userId, userId))
    .orderBy(asc(familyMembers.joinedAt));
}

export async function createFamily(db: Database, userId: string, rawName: string) {
  const name = rawName.trim();

  if (name.length < 1 || name.length > 100) {
    throw new FamilyServiceError('invalid_name', 'Family name must be between 1 and 100 characters.');
  }

  const familyId = crypto.randomUUID();
  const familyInsert = db
    .insert(families)
    .values({ id: familyId, name, createdBy: userId })
    .returning({ id: families.id, name: families.name, createdAt: families.createdAt });
  const memberInsert = db
    .insert(familyMembers)
    .values({ familyId, userId, role: 'owner' })
    .returning({ id: familyMembers.id, familyId: familyMembers.familyId, role: familyMembers.role, joinedAt: familyMembers.joinedAt });

  const [familyRows, memberRows] = await db.batch([familyInsert, memberInsert] as const);
  const family = familyRows[0];
  const membership = memberRows[0];

  if (!family || !membership) {
    throw new Error('Family creation did not return the created records.');
  }

  return { family, membership };
}

async function hashInvitationToken(token: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function acceptFamilyInvitation(db: Database, userId: string, rawToken: string) {
  const token = rawToken.trim();

  if (!token) {
    throw new FamilyServiceError('invalid_invitation', 'Enter a valid invitation code.');
  }

  const tokenHash = await hashInvitationToken(token);
  const invitation = await db
    .select({ acceptedAt: familyInvitations.acceptedAt, revokedAt: familyInvitations.revokedAt, expiresAt: familyInvitations.expiresAt })
    .from(familyInvitations)
    .where(eq(familyInvitations.tokenHash, tokenHash))
    .limit(1);

  if (!invitation[0]) {
    throw new FamilyServiceError('invalid_invitation', 'That invitation code is not valid.');
  }
  if (invitation[0].revokedAt) {
    throw new FamilyServiceError('revoked_invitation', 'That invitation has been revoked.', 410);
  }
  if (invitation[0].acceptedAt) {
    throw new FamilyServiceError('used_invitation', 'That invitation has already been used.', 409);
  }
  if (new Date(invitation[0].expiresAt).getTime() <= Date.now()) {
    throw new FamilyServiceError('expired_invitation', 'That invitation has expired.', 410);
  }

  type AcceptanceRow = { familyId: string; joined: boolean };
  const result = await db.execute(sql`
    with accepted_invitation as (
      update family_invitations
      set accepted_at = now()
      where token_hash = ${tokenHash}
        and accepted_at is null
        and revoked_at is null
        and expires_at > now()
      returning family_id, role
    ), new_member as (
      insert into family_members (family_id, user_id, role)
      select family_id, ${userId}::uuid, role
      from accepted_invitation
      on conflict (family_id, user_id) do nothing
      returning family_id
    )
    select accepted_invitation.family_id as "familyId",
           (new_member.family_id is not null) as joined
    from accepted_invitation
    left join new_member on new_member.family_id = accepted_invitation.family_id
  `) as unknown as { rows: AcceptanceRow[] };

  const acceptance = result.rows[0];
  if (!acceptance) {
    throw new FamilyServiceError('used_invitation', 'That invitation is no longer available.', 409);
  }

  return { familyId: acceptance.familyId, status: acceptance.joined ? 'accepted' as const : 'already_member' as const };
}
