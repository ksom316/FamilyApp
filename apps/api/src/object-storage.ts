const MEDIA_BUCKET = 'familyapp-media';

export type ObjectStorageObject = {
  body: ReadableStream<Uint8Array>;
};

export interface ObjectStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<ObjectStorageObject | null>;
  delete(key: string): Promise<void>;
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

export function createObjectStorage(bindings: ObjectStorageBindings): ObjectStorage | undefined {
  const serviceRoleKey = bindings.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const projectUrl = bindings.SUPABASE_URL?.trim().replace(/\/$/, '');
  if (!serviceRoleKey || !projectUrl) return undefined;

  const bucket = encodeURIComponent(MEDIA_BUCKET);
  const objectUrl = (key: string) => `${projectUrl}/storage/v1/object/${bucket}/${encodeObjectKey(key)}`;
  const authenticatedObjectUrl = (key: string) => `${projectUrl}/storage/v1/object/authenticated/${bucket}/${encodeObjectKey(key)}`;

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
      const response = await fetch(`${projectUrl}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: createHeaders(serviceRoleKey, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ prefixes: [key] })
      });
      if (!response.ok) throw storageError('delete', response);
    }
  };
}
