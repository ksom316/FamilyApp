import { describe, expect, it } from 'vitest';

import { buildWorkerPushPayload, validateVapidConfig, VapidConfigurationError } from './vapid';

function base64Url(bytes: ArrayBuffer | Uint8Array) {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeBase64Url(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const binary = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function generateVapidConfig() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
  ) as CryptoKeyPair;
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey) as JsonWebKey;
  const publicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer);
  if (!privateJwk.d) throw new Error('Generated test key has no private scalar.');
  return {
    subject: 'mailto:test@example.com',
    privateKey: privateJwk.d,
    publicKey: base64Url(publicBytes)
  };
}

async function generateSubscription() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  ) as CryptoKeyPair;
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-only',
    expirationTime: null,
    keys: {
      p256dh: base64Url(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer),
      auth: base64Url(crypto.getRandomValues(new Uint8Array(16)))
    }
  };
}

describe('Worker-compatible VAPID validation', () => {
  it('accepts a generated standard VAPID pair and reaches signing and encryption', async () => {
    const config = await generateVapidConfig();
    expect(decodeBase64Url(config.privateKey)).toHaveLength(32);
    expect(decodeBase64Url(config.publicKey)).toHaveLength(65);

    const validated = await validateVapidConfig(config);
    const payload = await buildWorkerPushPayload(
      { data: 'test-only', options: { ttl: 60 } },
      await generateSubscription(),
      validated
    );

    expect(payload.method).toBe('post');
    expect(payload.headers.authorization).toMatch(/^vapid t=/);
    expect(payload.headers['content-encoding']).toBe('aes128gcm');
    expect(payload.body.byteLength).toBe(4096);
  });

  it('rejects a mathematically mismatched public/private pair before delivery', async () => {
    const first = await generateVapidConfig();
    const second = await generateVapidConfig();
    await expect(validateVapidConfig({ ...first, publicKey: second.publicKey }))
      .rejects.toEqual(expect.objectContaining({
        name: 'VapidConfigurationError',
        message: 'The Web Push VAPID public and private keys do not form the same P-256 key pair.'
      }));
  });

  it('rejects a noncanonical or incorrectly sized private scalar without logging it', async () => {
    const config = await generateVapidConfig();
    await expect(validateVapidConfig({ ...config, privateKey: `${config.privateKey}=` }))
      .rejects.toBeInstanceOf(VapidConfigurationError);
    await expect(validateVapidConfig({ ...config, privateKey: base64Url(new Uint8Array(31)) }))
      .rejects.toThrow(/invalid decoded length/i);
    await expect(validateVapidConfig({ ...config, privateKey: ` ${config.privateKey}` }))
      .rejects.toThrow(/whitespace/i);
  });

  it('reports malformed public-key encoding, length, and curve points distinctly', async () => {
    const config = await generateVapidConfig();
    await expect(validateVapidConfig({ ...config, publicKey: `${config.publicKey}=` }))
      .rejects.toThrow(/public key must use unpadded base64url/i);
    await expect(validateVapidConfig({ ...config, publicKey: base64Url(new Uint8Array(64)) }))
      .rejects.toThrow(/public key has an invalid decoded length/i);
    const invalidPoint = new Uint8Array(65);
    invalidPoint[0] = 4;
    await expect(validateVapidConfig({ ...config, publicKey: base64Url(invalidPoint) }))
      .rejects.toThrow(/public key is not a valid P-256 point/i);
  });
});
