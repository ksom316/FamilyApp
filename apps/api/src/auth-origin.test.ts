import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { resolveClientApiUrl } from '../../mobile/lib/api-origin';

const workerUrl = 'https://familyapp-api.ksom316.workers.dev';
const webUrl = 'https://family-app-api-swart.vercel.app/sign-in';

describe('client API origin selection', () => {
  it('uses the first-party Vercel origin for hosted web authentication and API calls', () => {
    expect(resolveClientApiUrl(workerUrl, 'web', webUrl)).toBe('https://family-app-api-swart.vercel.app');
  });

  it('keeps Android and other native clients pointed directly at the Worker', () => {
    expect(resolveClientApiUrl(workerUrl, 'android', webUrl)).toBe(workerUrl);
    expect(resolveClientApiUrl(workerUrl, 'ios', webUrl)).toBe(workerUrl);
  });

  it('keeps local Expo web development pointed at the local API', () => {
    expect(resolveClientApiUrl('http://localhost:8787', 'web', 'http://localhost:8081/sign-in'))
      .toBe('http://localhost:8787');
    expect(resolveClientApiUrl('http://localhost:8787', 'web', 'http://127.0.0.1:8081/sign-in'))
      .toBe('http://127.0.0.1:8787');
  });

  it('falls back safely when no browser URL is available during static rendering', () => {
    expect(resolveClientApiUrl(`${workerUrl}/`, 'web')).toBe(workerUrl);
    expect(resolveClientApiUrl('not a url/', 'web', webUrl)).toBe('not a url');
  });
});

describe('Vercel API proxy configuration', () => {
  it('proxies every current API namespace before the static Expo Router fallback', () => {
    const config = JSON.parse(readFileSync(
      new URL('../../mobile/vercel.json', import.meta.url),
      'utf8'
    )) as { rewrites: Array<{ source: string; destination: string }> };

    expect(config.rewrites).toEqual([
      { source: '/api/:path*', destination: `${workerUrl}/api/:path*` },
      { source: '/families', destination: `${workerUrl}/families` },
      { source: '/families/:path*', destination: `${workerUrl}/families/:path*` },
      { source: '/me', destination: `${workerUrl}/me` },
      { source: '/me/:path*', destination: `${workerUrl}/me/:path*` },
      { source: '/health', destination: `${workerUrl}/health` },
      { source: '/(.*)', destination: '/index.html' }
    ]);
  });
});
