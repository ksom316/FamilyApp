import { and, desc, eq } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { familyMembers, familyMessages, users } from '@familyapp/db/schema';

import { requireFamilyMembership } from './family-service';

export const MAX_MESSAGE_LENGTH = 2000;
export const MESSAGE_PAGE_SIZE = 50;

export type ChatErrorCode = 'invalid_message';

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
