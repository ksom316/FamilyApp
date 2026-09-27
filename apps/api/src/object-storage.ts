const MEDIA_BUCKET = 'familyapp-media';

export type ObjectStorageObject = {
  body: ReadableStream<Uint8Array>;
};

export interface ObjectStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<ObjectStorageObject | null>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;
}

export type ObjectStorageBindings = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

function encodeObjectKey(key: string) {
  return key.split('/').map(encodeURIComponent).join('/');
}

function createHeaders(serviceRoleKey: string, additional?: HeadersInit) {
  const headers = new Headers(additional);
  headers.set('apikey', serviceRoleKey);
  headers.set('Authorization', `Bearer ${serviceRoleKey}`);
  return headers;
}

function storageError(operation: string, response: Response) {
  return new Error(`Supabase Storage ${operation} failed with status ${response.status}.`);
}

type SupabaseListEntry = {
  id?: string | null;
  name?: string;
  metadata?: unknown;
};

export function createObjectStorage(bindings: ObjectStorageBindings): ObjectStorage | undefined {
  const serviceRoleKey = bindings.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const projectUrl = bindings.SUPABASE_URL?.trim().replace(/\/$/, '');
  if (!serviceRoleKey || !projectUrl) return undefined;

  const bucket = encodeURIComponent(MEDIA_BUCKET);
  const objectUrl = (key: string) => `${projectUrl}/storage/v1/object/${bucket}/${encodeObjectKey(key)}`;
  const authenticatedObjectUrl = (key: string) => `${projectUrl}/storage/v1/object/authenticated/${bucket}/${encodeObjectKey(key)}`;
  const deleteKeys = async (keys: string[]) => {
    if (keys.length === 0) return;
    const response = await fetch(`${projectUrl}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: createHeaders(serviceRoleKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: keys })
    });
    if (!response.ok) throw storageError('delete', response);
  };

  async function listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    const folders: string[] = [prefix.replace(/\/$/, '')];

    while (folders.length > 0) {
      const folder = folders.pop()!;
      for (let offset = 0; ; offset += 100) {
        const response = await fetch(`${projectUrl}/storage/v1/object/list/${bucket}`, {
          method: 'POST',
          headers: createHeaders(serviceRoleKey!, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            prefix: folder,
            limit: 100,
            offset,
            sortBy: { column: 'name', order: 'asc' }
          })
        });
        if (!response.ok) throw storageError('list', response);
        const entries = await response.json() as SupabaseListEntry[];
        if (!Array.isArray(entries)) throw new Error('Supabase Storage list returned an invalid response.');

        for (const entry of entries) {
          if (!entry.name || entry.name === '.' || entry.name === '..') continue;
          const name = entry.name;
          // The REST API returns a child name for normal listings. Accept a full key too,
          // which keeps this adapter compatible with either response shape.
          const key = name.startsWith(`${folder}/`) ? name : `${folder}/${name}`;
          if (entry.id || entry.metadata) keys.push(key);
          else folders.push(key);
        }
        if (entries.length < 100) break;
      }
    }
    return keys;
  }

  return {
    async put(key, bytes, contentType) {
      const response = await fetch(objectUrl(key), {
        method: 'POST',
        headers: createHeaders(serviceRoleKey, {
          'Content-Type': contentType,
          'x-upsert': 'true'
        }),
        body: bytes
      });
      if (!response.ok) throw storageError('upload', response);
    },

    async get(key) {
      const response = await fetch(authenticatedObjectUrl(key), {
        headers: createHeaders(serviceRoleKey)
      });
      if (response.status === 404) return null;
      if (!response.ok) throw storageError('download', response);
      if (!response.body) throw new Error('Supabase Storage download returned an empty response body.');
      return { body: response.body };
    },

    async delete(key) {
      await deleteKeys([key]);
    },

    async deletePrefix(prefix) {
      // Prefix deletion is intentionally restricted to an explicit directory. This
      // prevents a caller from turning a missing/empty identifier into a bucket wipe.
      const normalized = prefix.replace(/^\/+|\/+$/g, '');
      if (!normalized || !prefix.endsWith('/')) {
        throw new Error('Storage prefix deletion requires a non-empty directory prefix ending in "/".');
      }

      let deleted = 0;
      // Re-list after each delete pass. Besides verifying emptiness, this catches objects
      // that were uploaded while a preceding page was being removed.
      for (let pass = 0; pass < 10; pass += 1) {
        const keys = await listKeys(normalized);
        if (keys.length === 0) return deleted;
        for (let index = 0; index < keys.length; index += 1000) {
          const batch = keys.slice(index, index + 1000);
          await deleteKeys(batch);
          deleted += batch.length;
        }
      }
      throw new Error('Supabase Storage prefix remained non-empty after repeated cleanup attempts.');
    }
  };
}
