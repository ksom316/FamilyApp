import { encryptNotification, type PushSubscription } from '@block65/webcrypto-web-push';

import type { WebPushConfig } from './api-database';

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const P256_ORDER = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');

export class VapidConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VapidConfigurationError';
  }
}

export type ValidatedVapidConfig = WebPushConfig & { signingKey: CryptoKey };

type WorkerPushMessage = {
  data: string;
  options?: { ttl?: number; topic?: string; urgency?: 'low' | 'normal' | 'high' };
};

function base64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeCanonicalBase64Url(value: string, expectedBytes: number, label: string) {
  if (!BASE64URL.test(value)) {
    throw new VapidConfigurationError(`The Web Push VAPID ${label} must use unpadded base64url encoding.`);
  }
  try {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const binary = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.length !== expectedBytes) throw new Error();
    if (base64Url(bytes) !== value) {
      throw new VapidConfigurationError(`The Web Push VAPID ${label} is not canonical base64url.`);
    }
    return bytes;
  } catch (error) {
    if (error instanceof VapidConfigurationError) throw error;
    throw new VapidConfigurationError(`The Web Push VAPID ${label} has an invalid decoded length.`);
  }
}

function scalarValue(bytes: Uint8Array) {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

export async function validateVapidConfig(config: WebPushConfig): Promise<ValidatedVapidConfig> {
  const publicKey = config.publicKey.trim();
  const privateKey = config.privateKey.trim();
  if (publicKey !== config.publicKey || privateKey !== config.privateKey) {
    throw new VapidConfigurationError('Web Push VAPID keys must not contain leading or trailing whitespace.');
  }
  const publicBytes = decodeCanonicalBase64Url(publicKey, 65, 'public key');
  const privateBytes = decodeCanonicalBase64Url(privateKey, 32, 'private key');

  if (publicBytes[0] !== 4) {
    throw new VapidConfigurationError('The Web Push VAPID public key is not an uncompressed P-256 point.');
  }
  try {
    await crypto.subtle.importKey(
      'raw', publicBytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
    );
  } catch {
    throw new VapidConfigurationError('The Web Push VAPID public key is not a valid P-256 point.');
  }
  const scalar = scalarValue(privateBytes);
  if (scalar === 0n || scalar >= P256_ORDER) {
    throw new VapidConfigurationError('The Web Push VAPID private key is not a valid P-256 scalar.');
  }

  const x = publicBytes.slice(1, 33);
  const y = publicBytes.slice(33, 65);
  let signingKey: CryptoKey;
  try {
    signingKey = await crypto.subtle.importKey('jwk', {
      kty: 'EC',
      crv: 'P-256',
      x: base64Url(x),
      y: base64Url(y),
      d: base64Url(privateBytes),
      ext: false,
      key_ops: ['sign']
    }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

    // Exercise the same Worker signing primitive used for the VAPID JWT. This verifies
    // more than parseability without exposing the signature or any key material.
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, new Uint8Array([0]));
  } catch {
    throw new VapidConfigurationError('The Web Push VAPID public and private keys do not form the same P-256 key pair.');
  }

  return { publicKey, privateKey, subject: config.subject.trim(), signingKey };
}

function encodeJson(value: unknown) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

export async function buildWorkerPushPayload(
  message: WorkerPushMessage,
  subscription: PushSubscription,
  vapid: ValidatedVapidConfig
) {
  const endpoint = new URL(subscription.endpoint);
  if (endpoint.protocol !== 'https:') throw new Error('Web Push subscription endpoint must use HTTPS.');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encodeJson({ typ: 'JWT', alg: 'ES256' })}.${encodeJson({
    iat: now,
    aud: endpoint.origin,
    exp: now + 12 * 60 * 60,
    sub: vapid.subject
  })}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    vapid.signingKey,
    new TextEncoder().encode(unsigned)
  );
  const authorization = `vapid t=${unsigned}.${base64Url(new Uint8Array(signature))}, k=${vapid.publicKey}`;
  const body = await encryptNotification(subscription, new TextEncoder().encode(message.data));

  return {
    headers: {
      authorization,
      ttl: (message.options?.ttl || 60).toString(),
      ...(message.options?.urgency ? { urgency: message.options.urgency } : {}),
      ...(message.options?.topic ? { topic: message.options.topic } : {}),
      'content-encoding': 'aes128gcm',
      'content-length': body.byteLength.toString(),
      'content-type': 'application/octet-stream'
    },
    method: 'post',
    body
  };
}
