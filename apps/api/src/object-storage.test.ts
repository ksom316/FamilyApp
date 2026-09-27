import { afterEach, describe, expect, it, vi } from 'vitest';

import { createObjectStorage } from './object-storage';

const FAMILY_ID = '44444444-4444-4444-8444-444444444444';

afterEach(() => vi.unstubAllGlobals());

describe('Supabase single-object delete', () => {
  it('sends the object key as a bulk-delete prefix and encodes the URL', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init: init! });
      return Response.json({ message: 'Successfully deleted' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const storage = createObjectStorage({
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-only-secret'
    });
    await storage?.delete(`families/${FAMILY_ID}/family-photo`);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toBe('https://project.supabase.co/storage/v1/object/familyapp-media');
    expect(calls[0].init.method).toBe('DELETE');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ prefixes: [`families/${FAMILY_ID}/family-photo`] });
  });

  it('throws when Supabase rejects the delete request', async () => {
    const fetchMock = vi.fn(async () => new Response('forbidden', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    const storage = createObjectStorage({
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-only-secret'
    });
    await expect(storage?.delete(`families/${FAMILY_ID}/family-photo`)).rejects.toThrow(/delete failed with status 403/i);
  });

  it('returns null for a missing object and throws for other download failures', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    const storage = createObjectStorage({
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-only-secret'
    });
    expect(await storage?.get(`families/${FAMILY_ID}/family-photo`)).toBeNull();

    vi.stubGlobal('fetch', vi.fn(async () => new Response('error', { status: 500 })));
    await expect(storage?.get(`families/${FAMILY_ID}/family-photo`)).rejects.toThrow(/download failed with status 500/i);
  });
});

describe('Supabase family-prefix cleanup', () => {
  it('recursively deletes only objects beneath the requested family directory and verifies emptiness', async () => {
    const deletedBatches: string[][] = [];
    let rootLists = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/object/list/')) {
        const request = JSON.parse(String(init?.body)) as { prefix: string };
        if (request.prefix === `families/${FAMILY_ID}`) {
          rootLists += 1;
          return Response.json(rootLists === 1
            ? [{ name: 'family-photo', id: 'three', metadata: { size: 30 } }, { name: 'memories', id: null, metadata: null }, { name: 'time-capsules', id: null, metadata: null }]
            : []);
        }
        if (request.prefix === `families/${FAMILY_ID}/memories`) {
          return Response.json([{ name: 'memory-one', id: 'one', metadata: { size: 10 } }]);
        }
        if (request.prefix === `families/${FAMILY_ID}/time-capsules`) {
          return Response.json([{ name: 'capsule-one', id: null, metadata: null }]);
        }
        if (request.prefix === `families/${FAMILY_ID}/time-capsules/capsule-one`) {
          return Response.json([{ name: 'attachments', id: null, metadata: null }]);
        }
        if (request.prefix === `families/${FAMILY_ID}/time-capsules/capsule-one/attachments`) {
          return Response.json([{ name: 'photo-one', id: 'two', metadata: { size: 20 } }]);
        }
        throw new Error(`Unexpected list prefix ${request.prefix}`);
      }
      const request = JSON.parse(String(init?.body)) as { prefixes: string[] };
      deletedBatches.push(request.prefixes);
      return Response.json({ message: 'Successfully deleted' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const storage = createObjectStorage({
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-only-secret'
    });
    const deleted = await storage?.deletePrefix(`families/${FAMILY_ID}/`);

    expect(deleted).toBe(3);
    expect(deletedBatches.flat().sort()).toEqual([
      `families/${FAMILY_ID}/family-photo`,
      `families/${FAMILY_ID}/memories/memory-one`,
      `families/${FAMILY_ID}/time-capsules/capsule-one/attachments/photo-one`
    ].sort());
    expect(deletedBatches.flat().every((key) => key.startsWith(`families/${FAMILY_ID}/`))).toBe(true);
    expect(deletedBatches.flat().some((key) => key.startsWith('profile-photos/'))).toBe(false);
  });

  it('rejects an empty or non-directory prefix before contacting storage', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const storage = createObjectStorage({
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-only-secret'
    });

    await expect(storage?.deletePrefix('families')).rejects.toThrow(/directory prefix/i);
    await expect(storage?.deletePrefix('/')).rejects.toThrow(/directory prefix/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
