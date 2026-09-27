import type { Database } from '@familyapp/db';

import { requireFamilyMembership } from './family-service';
import { MAX_MEMORY_IMAGE_BYTES, sniffImageMimeType } from './memories-service';
import type { ObjectStorage } from './object-storage';

export type FamilyPhotoErrorCode =
  | 'invalid_photo'
  | 'photo_too_large'
  | 'unsupported_photo_type'
  | 'forbidden_role'
  | 'photo_not_found'
  | 'storage_unavailable'
  | 'storage_error';

export class FamilyPhotoServiceError extends Error {
  constructor(public readonly code: FamilyPhotoErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'FamilyPhotoServiceError';
  }
}

export function familyPhotoObjectKey(familyId: string) {
  return `families/${familyId}/family-photo`;
}

export function canManageFamilyPhoto(role: string) {
  return role === 'owner' || role === 'guardian';
}

async function requirePhotoManager(db: Database, userId: string, familyId: string) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  if (!canManageFamilyPhoto(membership.role)) {
    throw new FamilyPhotoServiceError('forbidden_role', 'Only family owners and guardians can manage the family photo.', 403);
  }
}

export async function getFamilyPhotoKey(db: Database, userId: string, familyId: string) {
  await requireFamilyMembership(db, userId, familyId);
  return familyPhotoObjectKey(familyId);
}

export async function uploadFamilyPhoto(
  db: Database,
  userId: string,
  familyId: string,
  bytes: Uint8Array,
  storage: ObjectStorage | undefined
) {
  await requirePhotoManager(db, userId, familyId);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new FamilyPhotoServiceError('invalid_photo', 'Choose a family photo to upload.');
  }
  if (bytes.byteLength > MAX_MEMORY_IMAGE_BYTES) {
    throw new FamilyPhotoServiceError('photo_too_large', `Family photos must be ${Math.floor(MAX_MEMORY_IMAGE_BYTES / (1024 * 1024))}MB or smaller.`, 413);
  }
  const mimeType = sniffImageMimeType(bytes);
  if (!mimeType) throw new FamilyPhotoServiceError('unsupported_photo_type', 'Family photos must be JPEG, PNG, or WebP.', 415);
  if (!storage) throw new FamilyPhotoServiceError('storage_unavailable', 'Family photo storage is not configured yet.', 503);

  const objectKey = familyPhotoObjectKey(familyId);
  try {
    // A single server-controlled key means replacement is an upsert: the previous bytes
    // are replaced in place and can never become an orphaned family-photo object.
    await storage.put(objectKey, bytes, mimeType);
  } catch {
    throw new FamilyPhotoServiceError('storage_error', 'The family photo could not be uploaded. Please try again.', 502);
  }
  return { version: Date.now().toString() };
}

export async function removeFamilyPhoto(
  db: Database,
  userId: string,
  familyId: string,
  storage: ObjectStorage | undefined
) {
  await requirePhotoManager(db, userId, familyId);
  if (!storage) throw new FamilyPhotoServiceError('storage_unavailable', 'Family photo storage is not configured yet.', 503);
  try {
    await storage.delete(familyPhotoObjectKey(familyId));
  } catch {
    throw new FamilyPhotoServiceError('storage_error', 'The family photo could not be removed. Please try again.', 502);
  }
}
