import { and, desc, eq, or, sql } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import {
  familyMembers,
  familyPrivateConversationParticipants,
  familyPrivateConversations,
  familyPrivateMessages,
  users,
  type AvatarConfig
} from '@familyapp/db/schema';

import { MAX_MESSAGE_LENGTH, readMessageText } from './chat-service';
import { requireFamilyMembership } from './family-service';

export { MAX_MESSAGE_LENGTH };
export const PRIVATE_MESSAGE_PAGE_SIZE = 50;
const PRIVATE_INBOX_PAGE_SIZE = 100;

export type PrivateChatErrorCode =
  | 'invalid_conversation'
  | 'invalid_recipient'
  | 'cannot_message_self'
  | 'recipient_not_found'
  | 'conversation_not_found'
  | 'invalid_private_message'
  | 'private_message_not_found';

export class PrivateChatServiceError extends Error {
  constructor(public readonly code: PrivateChatErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'PrivateChatServiceError';
  }
}

function assertUuid(value: string, kind: 'conversation' | 'recipient' | 'message') {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    if (kind === 'message') {
      throw new PrivateChatServiceError('invalid_private_message', 'The message identifier is not valid.');
    }
    throw new PrivateChatServiceError(
      kind === 'conversation' ? 'invalid_conversation' : 'invalid_recipient',
      `The ${kind} identifier is not valid.`
    );
  }
}

const recipientSelection = {
  memberId: familyMembers.id,
  displayName: users.name,
  avatar: users.image,
  identityType: users.identityType,
  avatarConfig: users.avatarConfig,
  hasPhoto: sql<boolean>`${users.photoObjectKey} is not null`,
  role: familyMembers.role
};

async function requirePrivateConversation(db: Database, userId: string, familyId: string, conversationId: string) {
  assertUuid(conversationId, 'conversation');
  const membership = await requireFamilyMembership(db, userId, familyId);
  const [conversation] = await db.select({
    id: familyPrivateConversations.id,
    familyId: familyPrivateConversations.familyId,
    memberOneId: familyPrivateConversations.memberOneId,
    memberTwoId: familyPrivateConversations.memberTwoId,
    lastMessageAt: familyPrivateConversations.lastMessageAt,
    createdAt: familyPrivateConversations.createdAt
  }).from(familyPrivateConversationParticipants)
    .innerJoin(familyPrivateConversations, and(
      eq(familyPrivateConversationParticipants.conversationId, familyPrivateConversations.id),
      eq(familyPrivateConversationParticipants.familyId, familyPrivateConversations.familyId)
    ))
    .where(and(
      eq(familyPrivateConversationParticipants.conversationId, conversationId),
      eq(familyPrivateConversationParticipants.familyId, familyId),
      eq(familyPrivateConversationParticipants.memberId, membership.id),
      or(
        eq(familyPrivateConversations.memberOneId, membership.id),
        eq(familyPrivateConversations.memberTwoId, membership.id)
      )
    )).limit(1);
  if (!conversation) {
    throw new PrivateChatServiceError('conversation_not_found', 'Private conversation not found.', 404);
  }

  const recipientMemberId = conversation.memberOneId === membership.id
    ? conversation.memberTwoId
    : conversation.memberOneId;
  const [recipient] = await db.select(recipientSelection).from(familyMembers)
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(and(eq(familyMembers.id, recipientMemberId), eq(familyMembers.familyId, familyId)))
    .limit(1);
  if (!recipient) {
    throw new PrivateChatServiceError('conversation_not_found', 'Private conversation not found.', 404);
  }
  return { membership, conversation, recipient };
}

function publicConversation(conversation: Awaited<ReturnType<typeof requirePrivateConversation>>['conversation'], recipient: Awaited<ReturnType<typeof requirePrivateConversation>>['recipient']) {
  return {
    id: conversation.id,
    familyId: conversation.familyId,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    recipient
  };
}

type InboxRow = {
  id: string;
  familyId: string;
  createdAt: Date;
  lastMessageAt: Date | null;
  recipientMemberId: string;
  recipientDisplayName: string;
  recipientAvatar: string | null;
  recipientIdentityType: string;
  recipientAvatarConfig: AvatarConfig | null;
  recipientHasPhoto: boolean;
  recipientRole: 'owner' | 'guardian' | 'member';
  latestMessageId: string | null;
  latestMessageText: string | null;
  latestMessageCreatedAt: Date | null;
  latestMessageSenderMemberId: string | null;
  unreadCount: number;
};

export async function listPrivateConversations(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const result = await db.execute(sql`
    select
      conversation.id,
      conversation.family_id as "familyId",
      conversation.created_at as "createdAt",
      conversation.last_message_at as "lastMessageAt",
      recipient.id as "recipientMemberId",
      recipient_user.display_name as "recipientDisplayName",
      recipient_user.avatar_url as "recipientAvatar",
      recipient_user.identity_type as "recipientIdentityType",
      recipient_user.avatar_config as "recipientAvatarConfig",
      (recipient_user.photo_object_key is not null) as "recipientHasPhoto",
      recipient.role as "recipientRole",
      latest.id as "latestMessageId",
      latest.text as "latestMessageText",
      latest.created_at as "latestMessageCreatedAt",
      latest.sender_member_id as "latestMessageSenderMemberId",
      (
        select count(*)::int
        from family_private_messages unread
        where unread.conversation_id = conversation.id
          and unread.family_id = conversation.family_id
          and unread.sender_member_id <> ${membership.id}::uuid
          and unread.created_at > viewer.last_read_at
      ) as "unreadCount"
    from family_private_conversation_participants viewer
    inner join family_private_conversations conversation
      on conversation.id = viewer.conversation_id
      and conversation.family_id = viewer.family_id
    inner join family_members recipient
      on recipient.family_id = conversation.family_id
      and recipient.id = case
        when conversation.member_one_id = viewer.member_id then conversation.member_two_id
        else conversation.member_one_id
      end
    inner join users recipient_user on recipient_user.id = recipient.user_id
    left join lateral (
      select message.id, message.text, message.created_at, message.sender_member_id
      from family_private_messages message
      where message.conversation_id = conversation.id
        and message.family_id = conversation.family_id
      order by message.created_at desc, message.id desc
      limit 1
    ) latest on true
    where viewer.family_id = ${familyId}::uuid
      and viewer.member_id = ${membership.id}::uuid
      and viewer.member_id in (conversation.member_one_id, conversation.member_two_id)
    order by coalesce(conversation.last_message_at, conversation.created_at) desc, conversation.id desc
    limit ${PRIVATE_INBOX_PAGE_SIZE}
  `) as unknown as { rows: InboxRow[] };

  return result.rows.map((row) => ({
    id: row.id,
    familyId: row.familyId,
    createdAt: row.createdAt,
    lastMessageAt: row.lastMessageAt,
    recipient: {
      memberId: row.recipientMemberId,
      displayName: row.recipientDisplayName,
      avatar: row.recipientAvatar,
      identityType: row.recipientIdentityType,
      avatarConfig: row.recipientAvatarConfig,
      hasPhoto: row.recipientHasPhoto,
      role: row.recipientRole
    },
    latestMessage: row.latestMessageId ? {
      id: row.latestMessageId,
      text: row.latestMessageText ?? '',
      createdAt: row.latestMessageCreatedAt,
      senderMemberId: row.latestMessageSenderMemberId
    } : null,
    unreadCount: Number(row.unreadCount)
  }));
}

export async function startPrivateConversation(
  db: Database,
  userId: string,
  familyId: string,
  rawRecipientMemberId: unknown
) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  if (typeof rawRecipientMemberId !== 'string') {
    throw new PrivateChatServiceError('invalid_recipient', 'Choose a family member to message.');
  }
  const recipientMemberId = rawRecipientMemberId.toLowerCase();
  assertUuid(recipientMemberId, 'recipient');
  if (recipientMemberId === membership.id) {
    throw new PrivateChatServiceError('cannot_message_self', 'Choose another family member to message.');
  }
  const [recipient] = await db.select({ id: familyMembers.id }).from(familyMembers)
    .where(and(eq(familyMembers.id, recipientMemberId), eq(familyMembers.familyId, familyId))).limit(1);
  if (!recipient) {
    throw new PrivateChatServiceError('recipient_not_found', 'That family member is not available.', 404);
  }

  const [memberOneId, memberTwoId] = membership.id < recipientMemberId
    ? [membership.id, recipientMemberId]
    : [recipientMemberId, membership.id];
  const conversationId = crypto.randomUUID();
  const now = new Date();
  const result = await db.execute(sql`
    with conversation as (
      insert into family_private_conversations (
        id, family_id, member_one_id, member_two_id, created_at
      ) values (
        ${conversationId}::uuid, ${familyId}::uuid, ${memberOneId}::uuid, ${memberTwoId}::uuid, ${now}
      )
      on conflict (family_id, member_one_id, member_two_id)
      do update set family_id = excluded.family_id
      returning id, family_id
    ), participants as (
      insert into family_private_conversation_participants (
        conversation_id, family_id, member_id, last_read_at
      )
      select conversation.id, conversation.family_id, member.member_id, ${now}
      from conversation
      cross join (values (${memberOneId}::uuid), (${memberTwoId}::uuid)) member(member_id)
      on conflict (conversation_id, family_id, member_id) do nothing
    )
    select id from conversation
  `) as unknown as { rows: Array<{ id: string }> };
  const resolvedId = result.rows[0]?.id;
  if (!resolvedId) throw new Error('Private conversation creation did not return a record.');
  const resolved = await requirePrivateConversation(db, userId, familyId, resolvedId);
  return publicConversation(resolved.conversation, resolved.recipient);
}

const privateMessageSelection = {
  id: familyPrivateMessages.id,
  familyId: familyPrivateMessages.familyId,
  conversationId: familyPrivateMessages.conversationId,
  senderMemberId: familyPrivateMessages.senderMemberId,
  text: familyPrivateMessages.text,
  createdAt: familyPrivateMessages.createdAt,
  sender: recipientSelection
};

export async function listPrivateMessages(db: Database, userId: string, familyId: string, conversationId: string) {
  const authorized = await requirePrivateConversation(db, userId, familyId, conversationId);
  const messages = await db.select(privateMessageSelection).from(familyPrivateMessages)
    .innerJoin(familyMembers, and(
      eq(familyPrivateMessages.senderMemberId, familyMembers.id),
      eq(familyPrivateMessages.familyId, familyMembers.familyId)
    ))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(and(
      eq(familyPrivateMessages.conversationId, conversationId),
      eq(familyPrivateMessages.familyId, familyId)
    ))
    .orderBy(desc(familyPrivateMessages.createdAt), desc(familyPrivateMessages.id))
    .limit(PRIVATE_MESSAGE_PAGE_SIZE);
  return {
    conversation: publicConversation(authorized.conversation, authorized.recipient),
    messages: messages.reverse()
  };
}

export async function createPrivateMessage(
  db: Database,
  userId: string,
  familyId: string,
  conversationId: string,
  input: unknown
) {
  const authorized = await requirePrivateConversation(db, userId, familyId, conversationId);
  const text = readMessageText(
    typeof input === 'object' && input !== null && 'text' in input ? input.text : undefined
  );
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const insertMessage = db.insert(familyPrivateMessages).values({
    id,
    familyId,
    conversationId,
    senderMemberId: authorized.membership.id,
    text,
    createdAt
  });
  const updateConversation = db.update(familyPrivateConversations).set({
    lastMessageAt: sql`greatest(coalesce(${familyPrivateConversations.lastMessageAt}, ${createdAt}), ${createdAt})`
  }).where(and(
    eq(familyPrivateConversations.id, conversationId),
    eq(familyPrivateConversations.familyId, familyId)
  ));
  await db.batch([insertMessage, updateConversation] as const);

  const [message] = await db.select(privateMessageSelection).from(familyPrivateMessages)
    .innerJoin(familyMembers, and(
      eq(familyPrivateMessages.senderMemberId, familyMembers.id),
      eq(familyPrivateMessages.familyId, familyMembers.familyId)
    ))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(and(eq(familyPrivateMessages.id, id), eq(familyPrivateMessages.familyId, familyId))).limit(1);
  if (!message) throw new Error('Created private message could not be loaded.');
  return message;
}

export async function markPrivateConversationRead(
  db: Database,
  userId: string,
  familyId: string,
  conversationId: string,
  rawMessageId: unknown
) {
  const authorized = await requirePrivateConversation(db, userId, familyId, conversationId);
  if (typeof rawMessageId !== 'string') {
    throw new PrivateChatServiceError('invalid_private_message', 'Choose a message to mark as read.');
  }
  const messageId = rawMessageId.toLowerCase();
  assertUuid(messageId, 'message');
  const [message] = await db.select({ createdAt: familyPrivateMessages.createdAt }).from(familyPrivateMessages)
    .where(and(
      eq(familyPrivateMessages.id, messageId),
      eq(familyPrivateMessages.conversationId, conversationId),
      eq(familyPrivateMessages.familyId, familyId)
    )).limit(1);
  if (!message) {
    throw new PrivateChatServiceError('private_message_not_found', 'Private message not found.', 404);
  }
  await db.update(familyPrivateConversationParticipants).set({
    lastReadAt: sql`greatest(${familyPrivateConversationParticipants.lastReadAt}, ${message.createdAt})`
  }).where(and(
    eq(familyPrivateConversationParticipants.conversationId, conversationId),
    eq(familyPrivateConversationParticipants.familyId, familyId),
    eq(familyPrivateConversationParticipants.memberId, authorized.membership.id)
  ));
}
