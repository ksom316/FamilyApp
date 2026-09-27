import { describe, expect, it } from 'vitest';

import { getAuthCookieAttributes, getTrustedOrigins, type AuthBindings } from './auth';

const productionEnv: AuthBindings = {
  APP_URL: 'https://familyapp-api.ksom316.workers.dev',
  BETTER_AUTH_SECRET: 'test-secret',
  DATABASE_URL: 'postgresql://example.invalid/familyapp'
};

describe('web authentication configuration', () => {
  it('normalizes and deduplicates configured production origins', () => {
    expect(getTrustedOrigins({
      ...productionEnv,
      AUTH_TRUSTED_ORIGINS: ' https://familyapp.vercel.app/,https://familyapp.vercel.app '
    })).toEqual(['familyapp://', 'familyapp://*', 'https://familyapp.vercel.app']);
  });

  it('preserves the native application scheme', () => {
    expect(getTrustedOrigins({ ...productionEnv, AUTH_TRUSTED_ORIGINS: 'familyapp://' })).toEqual([
      'familyapp://',
      'familyapp://*'
    ]);
  });

  it('keeps localhost defaults in local development only', () => {
    expect(getTrustedOrigins({ ...productionEnv, APP_URL: 'http://localhost:8787' })).toContain('http://localhost:8081');
    expect(getTrustedOrigins(productionEnv)).not.toContain('http://localhost:8081');
  });

  it('uses secure SameSite=None cookies only when explicitly enabled', () => {
    expect(getAuthCookieAttributes(productionEnv)).toBeUndefined();
    expect(getAuthCookieAttributes({ ...productionEnv, AUTH_CROSS_SITE_COOKIES: 'true' })).toEqual({
      httpOnly: true,
      sameSite: 'none',
      secure: true
    });
  });

  it('keeps first-party production cookies on Better Auth defaults behind the web proxy', () => {
    expect(getAuthCookieAttributes({
      ...productionEnv,
      AUTH_CROSS_SITE_COOKIES: 'false'
    })).toBeUndefined();
  });

  it('rejects cross-site cookies over HTTP', () => {
    expect(() => getAuthCookieAttributes({
      ...productionEnv,
      APP_URL: 'http://localhost:8787',
      AUTH_CROSS_SITE_COOKIES: 'true'
    })).toThrow('AUTH_CROSS_SITE_COOKIES requires an HTTPS APP_URL.');
  });
});
