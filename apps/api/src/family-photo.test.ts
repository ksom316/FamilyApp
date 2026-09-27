import { describe, expect, it, vi } from 'vitest';

import {
  canManageFamilyPhoto,
  familyPhotoObjectKey,
  getFamilyPhotoKey,
  removeFamilyPhoto,
  uploadFamilyPhoto
} from './family-photo-service';

const FAMILY_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_FAMILY_ID = '66666666-6666-4666-8666-666666666666';
const USER_ID = '55555555-5555-4555-8555-555555555555';

function fakeDb(role: 'owner' | 'guardian' | 'member') {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => [{ id: 'member-id', role }]
  };
  return { select: () => chain };
}

function fakeStorage() {
  return {
    put: vi.fn(async (_key: string, _bytes: Uint8Array, _contentType: string) => undefined),
    get: vi.fn(),
    delete: vi.fn(async (_key: string) => undefined),
    deletePrefix: vi.fn()
  };
}

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);

describe('private family photo lifecycle', () => {
  it('uses the established owner/guardian family-management boundary', () => {
    expect(canManageFamilyPhoto('owner')).toBe(true);
    expect(canManageFamilyPhoto('guardian')).toBe(true);
    expect(canManageFamilyPhoto('member')).toBe(false);
  });

  it.each(['owner', 'guardian'] as const)('allows an authorized %s upload under the family namespace', async (role) => {
    const storage = fakeStorage();
    await uploadFamilyPhoto(fakeDb(role) as never, USER_ID, FAMILY_ID, jpeg, storage);
    expect(storage.put).toHaveBeenCalledWith(`families/${FAMILY_ID}/family-photo`, jpeg, 'image/jpeg');
  });

  it('rejects an ordinary member before touching storage', async () => {
    const storage = fakeStorage();
    await expect(uploadFamilyPhoto(fakeDb('member') as never, USER_ID, FAMILY_ID, jpeg, storage))
      .rejects.toMatchObject({ code: 'forbidden_role', status: 403 });
    expect(storage.put).not.toHaveBeenCalled();
    await expect(removeFamilyPhoto(fakeDb('member') as never, USER_ID, FAMILY_ID, storage))
      .rejects.toMatchObject({ code: 'forbidden_role', status: 403 });
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('replaces in place and removes the same server-controlled object', async () => {
    const storage = fakeStorage();
    const db = fakeDb('owner') as never;
    await uploadFamilyPhoto(db, USER_ID, FAMILY_ID, jpeg, storage);
    await uploadFamilyPhoto(db, USER_ID, FAMILY_ID, jpeg, storage);
    expect(storage.put).toHaveBeenCalledTimes(2);
    expect(new Set(storage.put.mock.calls.map((call) => call[0]))).toEqual(new Set([familyPhotoObjectKey(FAMILY_ID)]));
    await removeFamilyPhoto(db, USER_ID, FAMILY_ID, storage);
    expect(storage.delete).toHaveBeenCalledWith(familyPhotoObjectKey(FAMILY_ID));
  });

  it('keeps family object keys isolated and authorizes reads through membership', async () => {
    expect(await getFamilyPhotoKey(fakeDb('member') as never, USER_ID, FAMILY_ID)).toBe(`families/${FAMILY_ID}/family-photo`);
    expect(familyPhotoObjectKey(OTHER_FAMILY_ID)).toBe(`families/${OTHER_FAMILY_ID}/family-photo`);
    expect(familyPhotoObjectKey(OTHER_FAMILY_ID)).not.toBe(familyPhotoObjectKey(FAMILY_ID));
  });

  it('rejects empty, oversized, and non-image files', async () => {
    const db = fakeDb('owner') as never;
    const storage = fakeStorage();
    await expect(uploadFamilyPhoto(db, USER_ID, FAMILY_ID, new Uint8Array(), storage)).rejects.toMatchObject({ code: 'invalid_photo' });
    await expect(uploadFamilyPhoto(db, USER_ID, FAMILY_ID, new Uint8Array(8 * 1024 * 1024 + 1), storage)).rejects.toMatchObject({ code: 'photo_too_large' });
    await expect(uploadFamilyPhoto(db, USER_ID, FAMILY_ID, new Uint8Array([1, 2, 3, 4]), storage)).rejects.toMatchObject({ code: 'unsupported_photo_type' });
    expect(storage.put).not.toHaveBeenCalled();
  });
});
