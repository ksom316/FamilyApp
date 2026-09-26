import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import {
  familyMembers,
  familyMemories,
  familyTimeCapsuleAttachments,
  familyTimeCapsuleMemories,
  familyTimeCapsules,
  users
} from '@familyapp/db/schema';

import { requireFamilyMembership } from './family-service';
import { MAX_MEMORY_IMAGE_BYTES, sniffImageMimeType } from './memories-service';
import type { ObjectStorage } from './object-storage';

const MAX_TITLE_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_ATTACHED_MEMORIES = 24;
const MAX_PRIVATE_PHOTOS = 8;
const CAPSULES_PAGE_SIZE = 200;

export type TimeCapsuleErrorCode =
  | 'invalid_capsule'
  | 'invalid_title'
  | 'invalid_message'
  | 'invalid_unlock_time'
  | 'invalid_memories'
  | 'invalid_private_attachments'
  | 'unsupported_media_type'
  | 'media_too_large'
  | 'storage_unavailable'
  | 'storage_error'
  | 'capsule_not_found'
  | 'attachment_not_found'
  | 'capsule_locked'
  | 'forbidden_capsule_action'
  | 'capsule_already_unlocked';

export class TimeCapsuleServiceError extends Error {
  constructor(public readonly code: TimeCapsuleErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'TimeCapsuleServiceError';
  }
}

type CapsuleInput = { title?: unknown; message?: unknown; unlockAt?: unknown; memoryIds?: unknown };
export type PrivateCapsulePhotoInput = { bytes: Uint8Array };
type PreparedPrivatePhoto = {
  id: string;
  objectKey: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileSizeBytes: number;
  bytes: Uint8Array;
};

function readInput(value: unknown): CapsuleInput {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}

function assertUuid(value: string, label = 'capsule') {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new TimeCapsuleServiceError('invalid_capsule', `The ${label} identifier is not valid.`);
  }
}

function readTitle(value: unknown) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > MAX_TITLE_LENGTH) {
    throw new TimeCapsuleServiceError('invalid_title', `Title must be between 1 and ${MAX_TITLE_LENGTH} characters.`);
  }
  return value.trim();
}

function readMessage(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > MAX_MESSAGE_LENGTH) {
    throw new TimeCapsuleServiceError('invalid_message', `Message must be ${MAX_MESSAGE_LENGTH.toLocaleString()} characters or fewer.`);
  }
  return value.trim() || null;
}

function readUnlockAt(value: unknown, now: Date) {
  if (typeof value !== 'string') throw new TimeCapsuleServiceError('invalid_unlock_time', 'Choose a future unlock date and time.');
  const unlockAt = new Date(value);
  if (Number.isNaN(unlockAt.getTime()) || unlockAt.getTime() <= now.getTime() + 60_000) {
    throw new TimeCapsuleServiceError('invalid_unlock_time', 'Unlock time must be at least one minute in the future.');
  }
  return unlockAt;
}

function readMemoryIds(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) {
    throw new TimeCapsuleServiceError('invalid_memories', 'Choose valid family memories.');
  }
  const memoryIds = [...new Set(value as string[])];
  if (memoryIds.length > MAX_ATTACHED_MEMORIES) {
    throw new TimeCapsuleServiceError('invalid_memories', `Attach up to ${MAX_ATTACHED_MEMORIES} memories.`);
  }
  for (const memoryId of memoryIds) assertUuid(memoryId, 'memory');
  return memoryIds;
}

function preparePrivatePhotos(familyId: string, capsuleId: string, photos: PrivateCapsulePhotoInput[]): PreparedPrivatePhoto[] {
  if (photos.length > MAX_PRIVATE_PHOTOS) {
    throw new TimeCapsuleServiceError('invalid_private_attachments', `Add up to ${MAX_PRIVATE_PHOTOS} private photos.`);
  }
  return photos.map(({ bytes }) => {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      throw new TimeCapsuleServiceError('invalid_private_attachments', 'Choose a photo to upload.');
    }
    if (bytes.byteLength > MAX_MEMORY_IMAGE_BYTES) {
      throw new TimeCapsuleServiceError('media_too_large', `Photos must be ${Math.floor(MAX_MEMORY_IMAGE_BYTES / (1024 * 1024))}MB or smaller.`, 413);
    }
    const mimeType = sniffImageMimeType(bytes);
    if (!mimeType) throw new TimeCapsuleServiceError('unsupported_media_type', 'Photos must be JPEG, PNG, or WebP.', 415);
    const id = crypto.randomUUID();
    return {
      id,
      objectKey: `families/${familyId}/time-capsules/${capsuleId}/attachments/${id}`,
      mimeType,
      fileSizeBytes: bytes.byteLength,
      bytes
    };
  });
}

async function uploadPrivatePhotos(storage: ObjectStorage | undefined, photos: PreparedPrivatePhoto[]) {
  if (photos.length === 0) return;
  if (!storage) throw new TimeCapsuleServiceError('storage_unavailable', 'Photo storage is not configured yet.', 503);
  const uploaded: string[] = [];
  try {
    for (const photo of photos) {
      await storage.put(photo.objectKey, photo.bytes, photo.mimeType);
      uploaded.push(photo.objectKey);
    }
  } catch {
    await Promise.allSettled(uploaded.map((objectKey) => storage.delete(objectKey)));
    throw new TimeCapsuleServiceError('storage_error', 'The private photo could not be uploaded. Please try again.', 502);
  }
}

async function removeStoredPhotos(storage: ObjectStorage | undefined, objectKeys: string[]) {
  if (!storage || objectKeys.length === 0) return;
  const results = await Promise.allSettled(objectKeys.map((objectKey) => storage.delete(objectKey)));
  if (results.some((result) => result.status === 'rejected')) {
    console.error('One or more sealed capsule objects could not be removed from storage.', { objectKeys });
  }
}

async function requireFamilyMemories(db: Database, familyId: string, memoryIds: string[]) {
  if (memoryIds.length === 0) return;
  const rows = await db.select({ id: familyMemories.id }).from(familyMemories)
    .where(and(eq(familyMemories.familyId, familyId), inArray(familyMemories.id, memoryIds)));
  if (rows.length !== memoryIds.length) {
    throw new TimeCapsuleServiceError('invalid_memories', 'Every attached memory must belong to this family.');
  }
}

function canManage(role: 'owner' | 'guardian' | 'member', membershipId: string, creatorId: string) {
  return role === 'owner' || role === 'guardian' || membershipId === creatorId;
}

const capsuleMetadataSelection = {
  id: familyTimeCapsules.id,
  familyId: familyTimeCapsules.familyId,
  createdByMemberId: familyTimeCapsules.createdByMemberId,
  title: familyTimeCapsules.title,
  unlockAt: familyTimeCapsules.unlockAt,
  createdAt: familyTimeCapsules.createdAt,
  updatedAt: familyTimeCapsules.updatedAt,
  createdBy: {
    memberId: familyMembers.id,
    displayName: users.name,
    avatar: users.image,
    identityType: users.identityType,
    avatarConfig: users.avatarConfig,
    hasPhoto: sql<boolean>`${users.photoObjectKey} is not null`
  }
};

async function selectCapsuleMetadata(db: Database, familyId: string, capsuleId: string) {
  const [capsule] = await db.select(capsuleMetadataSelection).from(familyTimeCapsules)
    .innerJoin(familyMembers, and(
      eq(familyTimeCapsules.createdByMemberId, familyMembers.id),
      eq(familyTimeCapsules.familyId, familyMembers.familyId)
    ))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(and(eq(familyTimeCapsules.id, capsuleId), eq(familyTimeCapsules.familyId, familyId)))
    .limit(1);
  return capsule ?? null;
}

export async function listTimeCapsules(db: Database, userId: string, familyId: string) {
  await requireFamilyMembership(db, userId, familyId);
  const serverNow = new Date();
  const capsules = await db.select(capsuleMetadataSelection).from(familyTimeCapsules)
    .innerJoin(familyMembers, and(
      eq(familyTimeCapsules.createdByMemberId, familyMembers.id),
      eq(familyTimeCapsules.familyId, familyMembers.familyId)
    ))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(eq(familyTimeCapsules.familyId, familyId))
    .orderBy(asc(familyTimeCapsules.unlockAt), desc(familyTimeCapsules.createdAt))
    .limit(CAPSULES_PAGE_SIZE);
  return {
    serverNow: serverNow.toISOString(),
    capsules: capsules.map((capsule) => ({ ...capsule, isLocked: capsule.unlockAt.getTime() > serverNow.getTime() }))
  };
}

export async function getTimeCapsule(db: Database, userId: string, familyId: string, capsuleId: string) {
  await requireFamilyMembership(db, userId, familyId);
  assertUuid(capsuleId);
  const capsule = await selectCapsuleMetadata(db, familyId, capsuleId);
  if (!capsule) throw new TimeCapsuleServiceError('capsule_not_found', 'Time capsule not found.', 404);
  const serverNow = new Date();
  if (capsule.unlockAt.getTime() > serverNow.getTime()) {
    return { serverNow: serverNow.toISOString(), capsule: { ...capsule, isLocked: true as const } };
  }

  const [contents, memories, privateAttachments] = await Promise.all([
    db.select({ message: familyTimeCapsules.message }).from(familyTimeCapsules)
      .where(and(eq(familyTimeCapsules.id, capsuleId), eq(familyTimeCapsules.familyId, familyId))).limit(1),
    db.select({
      id: familyMemories.id,
      familyId: familyMemories.familyId,
      title: familyMemories.title,
      memoryDate: familyMemories.memoryDate,
      sharedBy: { memberId: familyMembers.id, displayName: users.name, avatar: users.image }
    }).from(familyTimeCapsuleMemories)
      .innerJoin(familyMemories, and(
        eq(familyTimeCapsuleMemories.memoryId, familyMemories.id),
        eq(familyTimeCapsuleMemories.familyId, familyMemories.familyId)
      ))
      .innerJoin(familyMembers, and(
        eq(familyMemories.createdByMemberId, familyMembers.id),
        eq(familyMemories.familyId, familyMembers.familyId)
      ))
      .innerJoin(users, eq(familyMembers.userId, users.id))
      .where(and(eq(familyTimeCapsuleMemories.capsuleId, capsuleId), eq(familyTimeCapsuleMemories.familyId, familyId)))
      .orderBy(desc(familyMemories.memoryDate), desc(familyTimeCapsuleMemories.createdAt)),
    db.select({
      id: familyTimeCapsuleAttachments.id,
      familyId: familyTimeCapsuleAttachments.familyId,
      capsuleId: familyTimeCapsuleAttachments.capsuleId,
      mimeType: familyTimeCapsuleAttachments.mimeType
    }).from(familyTimeCapsuleAttachments)
      .where(and(eq(familyTimeCapsuleAttachments.capsuleId, capsuleId), eq(familyTimeCapsuleAttachments.familyId, familyId)))
      .orderBy(asc(familyTimeCapsuleAttachments.createdAt))
  ]);
  return {
    serverNow: serverNow.toISOString(),
    capsule: { ...capsule, isLocked: false as const, message: contents[0]?.message ?? null, memories, privateAttachments }
  };
}

export async function getTimeCapsuleAttachmentMedia(
  db: Database,
  userId: string,
  familyId: string,
  capsuleId: string,
  attachmentId: string
) {
  await requireFamilyMembership(db, userId, familyId);
  assertUuid(capsuleId);
  assertUuid(attachmentId, 'attachment');
  const [capsule] = await db.select({ unlockAt: familyTimeCapsules.unlockAt }).from(familyTimeCapsules)
    .where(and(eq(familyTimeCapsules.id, capsuleId), eq(familyTimeCapsules.familyId, familyId))).limit(1);
  if (!capsule) throw new TimeCapsuleServiceError('capsule_not_found', 'Time capsule not found.', 404);
  // Check the capsule before looking up an attachment so a locked response cannot
  // be used as an attachment-ID existence oracle by another family member.
  if (capsule.unlockAt.getTime() > Date.now()) {
    throw new TimeCapsuleServiceError('capsule_locked', 'This private photo remains sealed.', 403);
  }
  const [attachment] = await db.select({
    objectKey: familyTimeCapsuleAttachments.objectKey,
    mimeType: familyTimeCapsuleAttachments.mimeType
  }).from(familyTimeCapsuleAttachments)
    .where(and(
      eq(familyTimeCapsuleAttachments.id, attachmentId),
      eq(familyTimeCapsuleAttachments.capsuleId, capsuleId),
      eq(familyTimeCapsuleAttachments.familyId, familyId)
    )).limit(1);
  if (!attachment) throw new TimeCapsuleServiceError('attachment_not_found', 'Private capsule photo not found.', 404);
  return { objectKey: attachment.objectKey, mimeType: attachment.mimeType };
}

export async function createTimeCapsule(
  db: Database,
  userId: string,
  familyId: string,
  rawInput: unknown,
  privatePhotoInputs: PrivateCapsulePhotoInput[] = [],
  storage?: ObjectStorage
) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const input = readInput(rawInput);
  const now = new Date();
  const title = readTitle(input.title);
  const message = readMessage(input.message) ?? null;
  const unlockAt = readUnlockAt(input.unlockAt, now);
  const memoryIds = readMemoryIds(input.memoryIds) ?? [];
  await requireFamilyMemories(db, familyId, memoryIds);
  const capsuleId = crypto.randomUUID();
  const privatePhotos = preparePrivatePhotos(familyId, capsuleId, privatePhotoInputs);
  await uploadPrivatePhotos(storage, privatePhotos);

  const capsuleInsert = db.insert(familyTimeCapsules).values({
    id: capsuleId, familyId, createdByMemberId: membership.id, title, message, unlockAt
  });
  const memoriesInsert = memoryIds.length
    ? db.insert(familyTimeCapsuleMemories).values(memoryIds.map((memoryId) => ({ familyId, capsuleId, memoryId })))
    : null;
  const attachmentsInsert = privatePhotos.length
    ? db.insert(familyTimeCapsuleAttachments).values(privatePhotos.map((photo) => ({
      id: photo.id,
      familyId,
      capsuleId,
      objectKey: photo.objectKey,
      mimeType: photo.mimeType,
      fileSizeBytes: photo.fileSizeBytes
    })))
    : null;
  try {
    if (memoriesInsert && attachmentsInsert) await db.batch([capsuleInsert, memoriesInsert, attachmentsInsert] as const);
    else if (memoriesInsert) await db.batch([capsuleInsert, memoriesInsert] as const);
    else if (attachmentsInsert) await db.batch([capsuleInsert, attachmentsInsert] as const);
    else await capsuleInsert;
  } catch (error) {
    await removeStoredPhotos(storage, privatePhotos.map((photo) => photo.objectKey));
    throw error;
  }
  return getTimeCapsule(db, userId, familyId, capsuleId);
}

export async function updateTimeCapsule(
  db: Database,
  userId: string,
  familyId: string,
  capsuleId: string,
  rawInput: unknown,
  privatePhotoInputs: PrivateCapsulePhotoInput[] | undefined,
  storage?: ObjectStorage
) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const input = readInput(rawInput);
  assertUuid(capsuleId);
  const [existing] = await db.select().from(familyTimeCapsules)
    .where(and(eq(familyTimeCapsules.id, capsuleId), eq(familyTimeCapsules.familyId, familyId))).limit(1);
  if (!existing) throw new TimeCapsuleServiceError('capsule_not_found', 'Time capsule not found.', 404);
  const now = new Date();
  if (existing.unlockAt.getTime() <= now.getTime()) {
    throw new TimeCapsuleServiceError('capsule_already_unlocked', 'Unlocked capsules can no longer be changed.', 409);
  }
  if (!canManage(membership.role, membership.id, existing.createdByMemberId)) {
    throw new TimeCapsuleServiceError('forbidden_capsule_action', 'You cannot edit this time capsule.', 403);
  }

  const title = input.title === undefined ? existing.title : readTitle(input.title);
  const message = input.message === undefined ? existing.message : readMessage(input.message) ?? null;
  const unlockAt = input.unlockAt === undefined ? existing.unlockAt : readUnlockAt(input.unlockAt, now);
  const memoryIds = readMemoryIds(input.memoryIds);
  if (memoryIds) await requireFamilyMemories(db, familyId, memoryIds);
  const replacementPhotos = privatePhotoInputs === undefined ? undefined : preparePrivatePhotos(familyId, capsuleId, privatePhotoInputs);
  const oldPrivatePhotos = replacementPhotos === undefined ? [] : await db
    .select({ objectKey: familyTimeCapsuleAttachments.objectKey }).from(familyTimeCapsuleAttachments)
    .where(and(eq(familyTimeCapsuleAttachments.capsuleId, capsuleId), eq(familyTimeCapsuleAttachments.familyId, familyId)));
  if (replacementPhotos !== undefined && oldPrivatePhotos.length > 0 && !storage) {
    throw new TimeCapsuleServiceError('storage_unavailable', 'Photo storage is not configured yet.', 503);
  }
  if (replacementPhotos) await uploadPrivatePhotos(storage, replacementPhotos);

  let replacementCommitted = false;
  try {
    const [updated] = await db.update(familyTimeCapsules).set({ title, message, unlockAt, updatedAt: now })
      .where(and(
        eq(familyTimeCapsules.id, capsuleId),
        eq(familyTimeCapsules.familyId, familyId),
        sql`${familyTimeCapsules.unlockAt} > now()`
      )).returning({ id: familyTimeCapsules.id });
    if (!updated) throw new TimeCapsuleServiceError('capsule_already_unlocked', 'This capsule has already unlocked.', 409);

    if (memoryIds !== undefined) {
      const removeMemories = db.delete(familyTimeCapsuleMemories).where(and(
        eq(familyTimeCapsuleMemories.capsuleId, capsuleId),
        eq(familyTimeCapsuleMemories.familyId, familyId)
      ));
      if (memoryIds.length) {
        const addMemories = db.insert(familyTimeCapsuleMemories).values(
          memoryIds.map((memoryId) => ({ familyId, capsuleId, memoryId }))
        );
        await db.batch([removeMemories, addMemories] as const);
      } else await removeMemories;
    }

    if (replacementPhotos !== undefined) {
      const removeAttachments = db.delete(familyTimeCapsuleAttachments).where(and(
        eq(familyTimeCapsuleAttachments.capsuleId, capsuleId),
        eq(familyTimeCapsuleAttachments.familyId, familyId)
      ));
      if (replacementPhotos.length) {
        const addAttachments = db.insert(familyTimeCapsuleAttachments).values(replacementPhotos.map((photo) => ({
          id: photo.id,
          familyId,
          capsuleId,
          objectKey: photo.objectKey,
          mimeType: photo.mimeType,
          fileSizeBytes: photo.fileSizeBytes
        })));
        await db.batch([removeAttachments, addAttachments] as const);
      } else await removeAttachments;
      replacementCommitted = true;
    }
  } catch (error) {
    if (replacementPhotos && !replacementCommitted) {
      await removeStoredPhotos(storage, replacementPhotos.map((photo) => photo.objectKey));
    }
    throw error;
  }

  if (replacementPhotos !== undefined) {
    await removeStoredPhotos(storage, oldPrivatePhotos.map((photo) => photo.objectKey));
  }
  return getTimeCapsule(db, userId, familyId, capsuleId);
}

export async function deleteTimeCapsule(
  db: Database,
  userId: string,
  familyId: string,
  capsuleId: string,
  storage?: ObjectStorage
) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  assertUuid(capsuleId);
  const [existing] = await db.select({
    createdByMemberId: familyTimeCapsules.createdByMemberId,
    unlockAt: familyTimeCapsules.unlockAt
  }).from(familyTimeCapsules)
    .where(and(eq(familyTimeCapsules.id, capsuleId), eq(familyTimeCapsules.familyId, familyId))).limit(1);
  if (!existing) throw new TimeCapsuleServiceError('capsule_not_found', 'Time capsule not found.', 404);
  if (existing.unlockAt.getTime() <= Date.now()) {
    throw new TimeCapsuleServiceError('capsule_already_unlocked', 'Unlocked capsules can no longer be deleted.', 409);
  }
  if (!canManage(membership.role, membership.id, existing.createdByMemberId)) {
    throw new TimeCapsuleServiceError('forbidden_capsule_action', 'You cannot delete this time capsule.', 403);
  }

  const privatePhotos = await db.select({ objectKey: familyTimeCapsuleAttachments.objectKey })
    .from(familyTimeCapsuleAttachments)
    .where(and(eq(familyTimeCapsuleAttachments.capsuleId, capsuleId), eq(familyTimeCapsuleAttachments.familyId, familyId)));
  if (privatePhotos.length && !storage) {
    throw new TimeCapsuleServiceError('storage_unavailable', 'Photo storage is not configured yet.', 503);
  }
  const deleted = await db.delete(familyTimeCapsules).where(and(
    eq(familyTimeCapsules.id, capsuleId),
    eq(familyTimeCapsules.familyId, familyId),
    sql`${familyTimeCapsules.unlockAt} > now()`
  )).returning({ id: familyTimeCapsules.id });
  if (!deleted[0]) throw new TimeCapsuleServiceError('capsule_already_unlocked', 'This capsule has already unlocked.', 409);
  await removeStoredPhotos(storage, privatePhotos.map((photo) => photo.objectKey));
}
