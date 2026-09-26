import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { familyMembers, familyMemories, familyMemoryFavorites, users } from '@familyapp/db/schema';

import { requireFamilyMembership } from './family-service';
import type { ObjectStorage } from './object-storage';

export const MAX_MEMORY_IMAGE_BYTES = 8 * 1024 * 1024;
export const MEMORIES_PAGE_SIZE = 200;

export type MemoriesErrorCode =
  | 'invalid_memory'
  | 'invalid_title'
  | 'invalid_date'
  | 'invalid_media'
  | 'unsupported_media_type'
  | 'media_too_large'
  | 'memory_not_found'
  | 'forbidden_memory_action'
  | 'storage_unavailable'
  | 'storage_error';

export class MemoriesServiceError extends Error {
  constructor(public readonly code: MemoriesErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'MemoriesServiceError';
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new MemoriesServiceError('invalid_memory', 'The memory identifier is not valid.');
  }
}

function readTitle(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 120) {
    throw new MemoriesServiceError('invalid_title', 'Title must be 120 characters or fewer.');
  }
  return value.trim() || null;
}

function readMemoryDate(value: unknown) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
    throw new MemoriesServiceError('invalid_date', 'Choose a valid date for this memory (YYYY-MM-DD).');
  }
  return value;
}

export function sniffImageMimeType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

function canManage(role: 'owner' | 'guardian' | 'member', membershipId: string, creatorId: string) {
  return role === 'owner' || role === 'guardian' || membershipId === creatorId;
}

const memorySelection = {
  id: familyMemories.id,
  familyId: familyMemories.familyId,
  createdByMemberId: familyMemories.createdByMemberId,
  title: familyMemories.title,
  memoryDate: familyMemories.memoryDate,
  mediaType: familyMemories.mediaType,
  mimeType: familyMemories.mimeType,
  fileSizeBytes: familyMemories.fileSizeBytes,
  createdAt: familyMemories.createdAt,
  updatedAt: familyMemories.updatedAt,
  sharedBy: {
    memberId: familyMembers.id,
    displayName: users.name,
    avatar: users.image,
    identityType: users.identityType,
    avatarConfig: users.avatarConfig,
    hasPhoto: sql<boolean>`${users.photoObjectKey} is not null`
  }
};

async function selectMemoryById(db: Database, familyId: string, memoryId: string) {
  const [memory] = await db
    .select(memorySelection)
    .from(familyMemories)
    .innerJoin(
      familyMembers,
      and(eq(familyMemories.createdByMemberId, familyMembers.id), eq(familyMemories.familyId, familyMembers.familyId))
    )
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(and(eq(familyMemories.id, memoryId), eq(familyMemories.familyId, familyId)))
    .limit(1);
  return memory ?? null;
}

async function hydrateFavorites(db: Database, familyId: string, memoryIds: string[], viewerMemberId: string) {
  const favorites = new Map<string, { count: number; mine: boolean }>();
  if (memoryIds.length === 0) return favorites;

  const rows = await db
    .select({ memoryId: familyMemoryFavorites.memoryId, memberId: familyMemoryFavorites.memberId })
    .from(familyMemoryFavorites)
    .where(and(eq(familyMemoryFavorites.familyId, familyId), inArray(familyMemoryFavorites.memoryId, memoryIds)));

  for (const row of rows) {
    const entry = favorites.get(row.memoryId) ?? { count: 0, mine: false };
    entry.count += 1;
    if (row.memberId === viewerMemberId) entry.mine = true;
    favorites.set(row.memoryId, entry);
  }
  return favorites;
}

export async function listMemories(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);

  const memories = await db
    .select(memorySelection)
    .from(familyMemories)
    .innerJoin(
      familyMembers,
      and(eq(familyMemories.createdByMemberId, familyMembers.id), eq(familyMemories.familyId, familyMembers.familyId))
    )
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(eq(familyMemories.familyId, familyId))
    .orderBy(desc(familyMemories.memoryDate), desc(familyMemories.createdAt))
    .limit(MEMORIES_PAGE_SIZE);

  const favorites = await hydrateFavorites(db, familyId, memories.map((memory) => memory.id), membership.id);
  return memories.map((memory) => ({
    ...memory,
    favoritesCount: favorites.get(memory.id)?.count ?? 0,
    isFavorited: favorites.get(memory.id)?.mine ?? false
  }));
}

export async function getMemory(db: Database, userId: string, familyId: string, memoryId: string) {
  assertUuid(memoryId);
  const membership = await requireFamilyMembership(db, userId, familyId);
  const memory = await selectMemoryById(db, familyId, memoryId);
  if (!memory) throw new MemoriesServiceError('memory_not_found', 'Memory not found.', 404);
  const favorites = await hydrateFavorites(db, familyId, [memory.id], membership.id);
  return { ...memory, favoritesCount: favorites.get(memory.id)?.count ?? 0, isFavorited: favorites.get(memory.id)?.mine ?? false };
}

export async function getMemoryMedia(db: Database, userId: string, familyId: string, memoryId: string) {
  assertUuid(memoryId);
  await requireFamilyMembership(db, userId, familyId);
  const [memory] = await db
    .select({ objectKey: familyMemories.objectKey, mimeType: familyMemories.mimeType })
    .from(familyMemories)
    .where(and(eq(familyMemories.id, memoryId), eq(familyMemories.familyId, familyId)))
    .limit(1);
  if (!memory) throw new MemoriesServiceError('memory_not_found', 'Memory not found.', 404);
  return memory;
}

type CreateMemoryInput = { title: unknown; memoryDate: unknown; bytes: Uint8Array };

export async function createMemory(
  db: Database,
  userId: string,
  familyId: string,
  input: CreateMemoryInput,
  storage: ObjectStorage | undefined
) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const title = readTitle(input.title);
  const memoryDate = readMemoryDate(input.memoryDate);

  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) {
    throw new MemoriesServiceError('invalid_media', 'Choose a photo to upload.');
  }
  if (input.bytes.byteLength > MAX_MEMORY_IMAGE_BYTES) {
    throw new MemoriesServiceError(
      'media_too_large',
      `Photos must be ${Math.floor(MAX_MEMORY_IMAGE_BYTES / (1024 * 1024))}MB or smaller.`,
      413
    );
  }
  const mimeType = sniffImageMimeType(input.bytes);
  if (!mimeType) throw new MemoriesServiceError('unsupported_media_type', 'Photos must be JPEG, PNG, or WebP.', 415);
  if (!storage) throw new MemoriesServiceError('storage_unavailable', 'Photo storage is not configured yet.', 503);

  const id = crypto.randomUUID();
  const objectKey = `families/${familyId}/memories/${id}`;

  try {
    await storage.put(objectKey, input.bytes, mimeType);
  } catch {
    throw new MemoriesServiceError('storage_error', 'The photo could not be uploaded. Please try again.', 502);
  }

  try {
    const [created] = await db
      .insert(familyMemories)
      .values({
        id,
        familyId,
        createdByMemberId: membership.id,
        title,
        memoryDate,
        mediaType: 'image',
        objectKey,
        mimeType,
        fileSizeBytes: input.bytes.byteLength
      })
      .returning({ id: familyMemories.id });
    if (!created) throw new Error('Memory creation did not return the created record.');
  } catch (error) {
    // Roll back the uploaded object so a failed DB write never leaves orphaned storage.
    await storage.delete(objectKey).catch(() => {});
    throw error;
  }

  const memory = await selectMemoryById(db, familyId, id);
  if (!memory) throw new Error('Created memory could not be loaded.');
  return { ...memory, favoritesCount: 0, isFavorited: false };
}

type UpdateMemoryInput = { title?: unknown; memoryDate?: unknown };

export async function updateMemory(
  db: Database,
  userId: string,
  familyId: string,
  memoryId: string,
  input: UpdateMemoryInput
) {
  assertUuid(memoryId);
  const membership = await requireFamilyMembership(db, userId, familyId);
  const [existing] = await db.select().from(familyMemories).where(and(eq(familyMemories.id, memoryId), eq(familyMemories.familyId, familyId))).limit(1);
  if (!existing) throw new MemoriesServiceError('memory_not_found', 'Memory not found.', 404);
  if (!canManage(membership.role, membership.id, existing.createdByMemberId)) {
    throw new MemoriesServiceError('forbidden_memory_action', 'You cannot edit this memory.', 403);
  }

  const title = input.title === undefined ? existing.title : readTitle(input.title);
  const memoryDate = input.memoryDate === undefined ? existing.memoryDate : readMemoryDate(input.memoryDate);
  await db
    .update(familyMemories)
    .set({ title, memoryDate, updatedAt: new Date() })
    .where(and(eq(familyMemories.id, memoryId), eq(familyMemories.familyId, familyId)));

  const memory = await selectMemoryById(db, familyId, memoryId);
  if (!memory) throw new Error('Updated memory could not be loaded.');
  const favorites = await hydrateFavorites(db, familyId, [memory.id], membership.id);
  return { ...memory, favoritesCount: favorites.get(memory.id)?.count ?? 0, isFavorited: favorites.get(memory.id)?.mine ?? false };
}

export async function deleteMemory(
  db: Database,
  userId: string,
  familyId: string,
  memoryId: string,
  storage: ObjectStorage | undefined
) {
  assertUuid(memoryId);
  const membership = await requireFamilyMembership(db, userId, familyId);
  const [existing] = await db.select().from(familyMemories).where(and(eq(familyMemories.id, memoryId), eq(familyMemories.familyId, familyId))).limit(1);
  if (!existing) throw new MemoriesServiceError('memory_not_found', 'Memory not found.', 404);
  if (!canManage(membership.role, membership.id, existing.createdByMemberId)) {
    throw new MemoriesServiceError('forbidden_memory_action', 'You cannot delete this memory.', 403);
  }
  if (!storage) throw new MemoriesServiceError('storage_unavailable', 'Photo storage is not configured yet.', 503);

  // Delete the stored photo before the database row: if storage deletion fails we abort
  // and leave both intact (retryable), rather than deleting the DB record and risking an
  // orphaned, unreferenced object in storage.
  try {
    await storage.delete(existing.objectKey);
  } catch {
    throw new MemoriesServiceError('storage_error', 'The photo could not be removed from storage. Please try again.', 502);
  }

  try {
    await db.delete(familyMemories).where(and(eq(familyMemories.id, memoryId), eq(familyMemories.familyId, familyId)));
  } catch (error) {
    // The object is already gone from storage at this point; the DB row is the only
    // remaining record. Surfacing this loudly is the documented failure strategy since
    // perfect cross-system atomicity with object storage is not available here.
    console.error('Memory photo deleted from storage but the database record could not be removed; manual cleanup required.', {
      memoryId,
      familyId,
      objectKey: existing.objectKey
    });
    throw error;
  }
}

export async function favoriteMemory(db: Database, userId: string, familyId: string, memoryId: string) {
  assertUuid(memoryId);
  const membership = await requireFamilyMembership(db, userId, familyId);
  const [memory] = await db.select({ id: familyMemories.id }).from(familyMemories).where(and(eq(familyMemories.id, memoryId), eq(familyMemories.familyId, familyId))).limit(1);
  if (!memory) throw new MemoriesServiceError('memory_not_found', 'Memory not found.', 404);
  await db.insert(familyMemoryFavorites).values({ familyId, memoryId, memberId: membership.id }).onConflictDoNothing();
}

export async function unfavoriteMemory(db: Database, userId: string, familyId: string, memoryId: string) {
  assertUuid(memoryId);
  const membership = await requireFamilyMembership(db, userId, familyId);
  await db
    .delete(familyMemoryFavorites)
    .where(and(
      eq(familyMemoryFavorites.familyId, familyId),
      eq(familyMemoryFavorites.memoryId, memoryId),
      eq(familyMemoryFavorites.memberId, membership.id)
    ));
}
