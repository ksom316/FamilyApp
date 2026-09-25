import { and, eq } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { familyMembers, users, type AvatarConfig } from '@familyapp/db/schema';

import { MAX_MEMORY_IMAGE_BYTES, sniffImageMimeType } from './memories-service';
import { requireFamilyMembership } from './family-service';

export type ProfileErrorCode =
  | 'invalid_identity_type'
  | 'invalid_avatar_config'
  | 'invalid_photo'
  | 'photo_too_large'
  | 'unsupported_photo_type'
  | 'storage_unavailable'
  | 'storage_error'
  | 'photo_not_found';

export class ProfileServiceError extends Error {
  constructor(public readonly code: ProfileErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'ProfileServiceError';
  }
}

const IDENTITY_TYPES = ['photo', 'avatar', 'initials'] as const;
export type IdentityType = (typeof IDENTITY_TYPES)[number];

// Deliberately small, fixed option sets — see AvatarConfig in the schema for why.
const AVATAR_OPTIONS: { [K in keyof AvatarConfig]: readonly AvatarConfig[K][] } = {
  skinTone: ['light', 'medium', 'tan', 'deep'],
  hairstyle: ['bald', 'short', 'curly', 'long', 'bun'],
  hairColor: ['black', 'brown', 'blonde', 'red', 'gray'],
  expression: ['smile', 'neutral', 'grin', 'wink'],
  accessory: ['none', 'glasses', 'sunglasses'],
  top: ['tshirt', 'hoodie', 'dress', 'buttonup'],
  background: ['peach', 'sky', 'mint', 'lilac', 'sun']
};

function readAvatarConfig(value: unknown): AvatarConfig {
  if (typeof value !== 'object' || value === null) {
    throw new ProfileServiceError('invalid_avatar_config', 'Choose a valid avatar configuration.');
  }
  const input = value as Record<string, unknown>;
  const config = {} as AvatarConfig;
  for (const key of Object.keys(AVATAR_OPTIONS) as (keyof AvatarConfig)[]) {
    const raw = input[key];
    const allowed = AVATAR_OPTIONS[key] as readonly string[];
    if (typeof raw !== 'string' || !allowed.includes(raw)) {
      throw new ProfileServiceError('invalid_avatar_config', `Choose a valid ${key} option.`);
    }
    (config as Record<string, string>)[key] = raw;
  }
  return config;
}

const profileSelection = {
  id: users.id,
  displayName: users.name,
  avatar: users.image,
  identityType: users.identityType,
  avatarConfig: users.avatarConfig,
  hasPhoto: users.photoObjectKey
};

export async function getMyProfileIdentity(db: Database, userId: string) {
  const [row] = await db.select(profileSelection).from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw new Error('Signed-in user could not be loaded.');
  return {
    identityType: row.identityType as IdentityType,
    avatarConfig: row.avatarConfig,
    hasPhoto: Boolean(row.hasPhoto),
    avatar: row.avatar
  };
}

type UpdateIdentityInput = { identityType?: unknown; avatarConfig?: unknown };

// Actor identity always comes from the authenticated session (userId) — there is no member
// id in this payload at all, so another member's identity can never be targeted from the
// client. Switching identityType never deletes the avatar config or uploaded photo that
// aren't currently active, so a member can freely switch back and forth without redoing
// their avatar or re-uploading their photo.
export async function updateMyIdentity(db: Database, userId: string, input: UpdateIdentityInput) {
  if (typeof input.identityType !== 'string' || !IDENTITY_TYPES.includes(input.identityType as IdentityType)) {
    throw new ProfileServiceError('invalid_identity_type', 'Choose a valid profile identity.');
  }
  const identityType = input.identityType as IdentityType;

  if (identityType === 'avatar') {
    const avatarConfig = readAvatarConfig(input.avatarConfig);
    await db.update(users).set({ identityType, avatarConfig, updatedAt: new Date() }).where(eq(users.id, userId));
  } else if (identityType === 'photo') {
    const [existing] = await db.select({ photoObjectKey: users.photoObjectKey }).from(users).where(eq(users.id, userId)).limit(1);
    if (!existing?.photoObjectKey) {
      throw new ProfileServiceError('invalid_photo', 'Upload a profile photo before selecting it.');
    }
    await db.update(users).set({ identityType, updatedAt: new Date() }).where(eq(users.id, userId));
  } else {
    await db.update(users).set({ identityType, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  return getMyProfileIdentity(db, userId);
}

export async function getMyProfilePhotoMedia(db: Database, userId: string) {
  const [row] = await db.select({ objectKey: users.photoObjectKey, mimeType: users.photoMimeType }).from(users).where(eq(users.id, userId)).limit(1);
  if (!row?.objectKey || !row.mimeType) throw new ProfileServiceError('photo_not_found', 'No profile photo is set.', 404);
  return { objectKey: row.objectKey, mimeType: row.mimeType };
}

// A member's photo is visible to any fellow family member — exactly the same audience that
// already sees their basic profile (name/avatar) via listFamilyMembers, never broader.
// requireFamilyMembership confirms the VIEWER belongs to this family; the join below then
// confirms the TARGET member also belongs to this same family, so no cross-family id can be
// used to fetch a stranger's photo.
export async function getMemberProfilePhotoMedia(db: Database, userId: string, familyId: string, memberId: string) {
  await requireFamilyMembership(db, userId, familyId);
  const [row] = await db
    .select({ objectKey: users.photoObjectKey, mimeType: users.photoMimeType })
    .from(familyMembers)
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(and(eq(familyMembers.id, memberId), eq(familyMembers.familyId, familyId)))
    .limit(1);
  if (!row?.objectKey || !row.mimeType) throw new ProfileServiceError('photo_not_found', 'No profile photo is set.', 404);
  return { objectKey: row.objectKey, mimeType: row.mimeType };
}

// Reuses the exact same sniff/size validation and R2 object-storage pattern Memories
// already established — this is the same bucket, just a different key prefix, rather than
// a new storage architecture.
export async function uploadMyProfilePhoto(db: Database, userId: string, bytes: Uint8Array, bucket: R2Bucket | undefined) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new ProfileServiceError('invalid_photo', 'Choose a photo to upload.');
  }
  if (bytes.byteLength > MAX_MEMORY_IMAGE_BYTES) {
    throw new ProfileServiceError('photo_too_large', `Photos must be ${Math.floor(MAX_MEMORY_IMAGE_BYTES / (1024 * 1024))}MB or smaller.`, 413);
  }
  const mimeType = sniffImageMimeType(bytes);
  if (!mimeType) throw new ProfileServiceError('unsupported_photo_type', 'Photos must be JPEG, PNG, or WebP.', 415);
  if (!bucket) throw new ProfileServiceError('storage_unavailable', 'Photo storage is not configured yet.', 503);

  // One fixed key per user — re-uploading simply overwrites it, so there is never an
  // orphaned old object left behind in storage to clean up.
  const objectKey = `profile-photos/${userId}`;

  try {
    await bucket.put(objectKey, bytes, { httpMetadata: { contentType: mimeType } });
  } catch {
    throw new ProfileServiceError('storage_error', 'The photo could not be uploaded. Please try again.', 502);
  }

  // Uploading always also switches the active identity to "photo" — matching the profile
  // screen's "choose/upload" affordance, which is a single action, not two.
  await db.update(users).set({ photoObjectKey: objectKey, photoMimeType: mimeType, identityType: 'photo', updatedAt: new Date() }).where(eq(users.id, userId));

  return getMyProfileIdentity(db, userId);
}

export async function removeMyProfilePhoto(db: Database, userId: string, bucket: R2Bucket | undefined) {
  const [existing] = await db.select({ photoObjectKey: users.photoObjectKey, identityType: users.identityType }).from(users).where(eq(users.id, userId)).limit(1);
  if (existing?.photoObjectKey && bucket) {
    await bucket.delete(existing.photoObjectKey).catch(() => {});
  }
  await db.update(users).set({
    photoObjectKey: null,
    photoMimeType: null,
    // Removing the active photo falls back to the default (initials/provider avatar); if
    // the member was actually using their avatar, leave that choice alone.
    identityType: existing?.identityType === 'photo' ? 'initials' : (existing?.identityType ?? 'initials'),
    updatedAt: new Date()
  }).where(eq(users.id, userId));
  return getMyProfileIdentity(db, userId);
}
