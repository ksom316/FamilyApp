import { and, desc, eq, sql } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { familyMembers, familyMessages, users } from '@familyapp/db/schema';

import { requireFamilyMembership } from './family-service';

export const MAX_MESSAGE_LENGTH = 2000;
export const MESSAGE_PAGE_SIZE = 50;

export type ChatErrorCode = 'invalid_message' | 'message_not_found';

export class ChatServiceError extends Error {
  constructor(public readonly code: ChatErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'ChatServiceError';
  }
}

export function readMessageText(value: unknown) {
  if (typeof value !== 'string') {
    throw new ChatServiceError('invalid_message', 'Message text is required.');
  }

  const text = value.trim();
  if (!text) throw new ChatServiceError('invalid_message', 'Write a message before sending.');
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new ChatServiceError(
      'invalid_message',
      `Messages must be ${MAX_MESSAGE_LENGTH.toLocaleString()} characters or fewer.`
    );
  }
  return text;
}

const messageSelection = {
  id: familyMessages.id,
  familyId: familyMessages.familyId,
  senderMemberId: familyMessages.senderMemberId,
  text: familyMessages.text,
  createdAt: familyMessages.createdAt,
  sender: {
    memberId: familyMembers.id,
    displayName: users.name,
    avatar: users.image,
    role: familyMembers.role
  }
};

export async function listFamilyMessages(db: Database, userId: string, familyId: string) {
  await requireFamilyMembership(db, userId, familyId);

  const messages = await db
    .select(messageSelection)
    .from(familyMessages)
    .innerJoin(
      familyMembers,
      and(
        eq(familyMessages.senderMemberId, familyMembers.id),
        eq(familyMessages.familyId, familyMembers.familyId)
      )
    )
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(eq(familyMessages.familyId, familyId))
    .orderBy(desc(familyMessages.createdAt), desc(familyMessages.id))
    .limit(MESSAGE_PAGE_SIZE);

  return messages.reverse();
}

export async function createFamilyMessage(
  db: Database,
  userId: string,
  familyId: string,
  input: unknown
) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const text = readMessageText(
    typeof input === 'object' && input !== null && 'text' in input
      ? input.text
      : undefined
  );

  const [created] = await db
    .insert(familyMessages)
    .values({ familyId, senderMemberId: membership.id, text })
    .returning({ id: familyMessages.id });

  if (!created) throw new Error('Message creation did not return the created record.');

  const [message] = await db
    .select(messageSelection)
    .from(familyMessages)
    .innerJoin(
      familyMembers,
      and(
        eq(familyMessages.senderMemberId, familyMembers.id),
        eq(familyMessages.familyId, familyMembers.familyId)
      )
    )
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(and(eq(familyMessages.id, created.id), eq(familyMessages.familyId, familyId)))
    .limit(1);

  if (!message) throw new Error('Created message could not be loaded.');
  return message;
}

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ChatServiceError('message_not_found', 'That message could not be found.', 404);
  }
}

// No read-state row yet means this member has never had a read position recorded for the
// shared family chat — deliberately treated as "nothing unread" rather than counting the
// family's entire message history against them. A row is only ever created the first time
// they actually mark the chat read (see markGroupChatRead), so a member who has simply
// never opened Chat sees no badge until there is real activity after that first open.
//
// The whole comparison is done in one SQL statement, with lastReadAt read via a correlated
// subquery rather than being pulled into JS first. Postgres `timestamptz` stores
// microsecond precision, but a JS `Date` (what drizzle would otherwise hand back from a
// plain `.select()`) only carries milliseconds — round-tripping lastReadAt through JS before
// using it as a query parameter silently truncated it, which let the exact message just
// marked read (or any message sharing its millisecond) keep satisfying "createdAt > lastReadAt"
// and stay stuck as unread forever. Comparing entirely inside SQL avoids that truncation.
// `coalesce(..., 'infinity')` reproduces the "no row yet → 0 unread" rule without a second
// query: nothing can be newer than infinity, so the count is naturally 0.
export async function getGroupChatUnreadCount(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const result = await db.execute(sql`
    select count(*)::int as count
    from family_messages
    where family_messages.family_id = ${familyId}::uuid
      and family_messages.sender_member_id <> ${membership.id}::uuid
      and family_messages.created_at > coalesce(
        (
          select last_read_at from family_chat_read_states
          where family_chat_read_states.family_id = ${familyId}::uuid
            and family_chat_read_states.member_id = ${membership.id}::uuid
        ),
        'infinity'::timestamptz
      )
  `) as unknown as { rows: Array<{ count: number }> };
  return result.rows[0]?.count ?? 0;
}

// Advances (never rewinds — the greatest() in the upsert guarantees that even if an older
// mark-read request resolves after a newer one) the caller's own read position to a
// specific message's timestamp — the same "read up to this message I actually fetched"
// pattern private chat already uses, rather than trusting a client-supplied "now".
//
// The timestamp is copied straight from family_messages.created_at to
// family_chat_read_states.last_read_at inside this one SQL statement — it never passes
// through a JS Date, so its full microsecond precision survives intact (see the comment on
// getGroupChatUnreadCount for why that matters). The row is upserted here, which is also
// this member's very first read-state row if they have never marked the chat read before.
export async function markGroupChatRead(db: Database, userId: string, familyId: string, rawMessageId: unknown) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  if (typeof rawMessageId !== 'string') {
    throw new ChatServiceError('message_not_found', 'Choose a message to mark as read.');
  }
  const messageId = rawMessageId.toLowerCase();
  assertUuid(messageId);

  const [message] = await db
    .select({ id: familyMessages.id })
    .from(familyMessages)
    .where(and(eq(familyMessages.id, messageId), eq(familyMessages.familyId, familyId)))
    .limit(1);
  if (!message) throw new ChatServiceError('message_not_found', 'That message could not be found.', 404);

  await db.execute(sql`
    insert into family_chat_read_states (family_id, member_id, last_read_at)
    select ${familyId}::uuid, ${membership.id}::uuid, family_messages.created_at
    from family_messages
    where family_messages.id = ${messageId}::uuid
      and family_messages.family_id = ${familyId}::uuid
    on conflict (family_id, member_id) do update
    set last_read_at = greatest(family_chat_read_states.last_read_at, excluded.last_read_at)
  `);
}
