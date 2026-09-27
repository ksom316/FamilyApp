import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { expo } from '@better-auth/expo';

import { createDatabase } from '@familyapp/db';
import * as schema from '@familyapp/db/schema';

export type AuthBindings = {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  APP_URL: string;
  AUTH_TRUSTED_ORIGINS?: string;
  AUTH_CROSS_SITE_COOKIES?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
};

const LOCAL_WEB_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:3000'
];

function normalizeOrigin(origin: string) {
  const trimmed = origin.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

export function getTrustedOrigins(env: AuthBindings) {
  const configured = env.AUTH_TRUSTED_ORIGINS?.split(',').map(normalizeOrigin).filter((origin): origin is string => Boolean(origin)) ?? [];
  const localOrigins = env.APP_URL.startsWith('https://') ? [] : LOCAL_WEB_ORIGINS;
  return [...new Set([
    'familyapp://',
    'familyapp://*',
    ...localOrigins,
    ...configured
  ])];
}

export function getAuthCookieAttributes(env: AuthBindings) {
  if (env.AUTH_CROSS_SITE_COOKIES?.trim().toLowerCase() !== 'true') return undefined;
  if (!env.APP_URL.startsWith('https://')) {
    throw new Error('AUTH_CROSS_SITE_COOKIES requires an HTTPS APP_URL.');
  }
  return { httpOnly: true, sameSite: 'none' as const, secure: true };
}

export function createAuth(env: AuthBindings) {
  if (!env.DATABASE_URL || !env.BETTER_AUTH_SECRET || !env.APP_URL) {
    throw new Error('DATABASE_URL, BETTER_AUTH_SECRET, and APP_URL are required for authentication.');
  }

  const database = createDatabase(env.DATABASE_URL);

  return betterAuth({
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: {
            ...schema,
            users: schema.users,
            sessions: schema.authSessions,
            accounts: schema.authAccounts,
            verifications: schema.authVerifications
          }
    }),
    user: {
      modelName: 'users'
    },
    session: {
      modelName: 'sessions'
    },
    account: {
      modelName: 'accounts'
    },
    verification: {
      modelName: 'verifications'
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8
    },
    advanced: {
      useSecureCookies: env.APP_URL.startsWith('https://'),
      defaultCookieAttributes: getAuthCookieAttributes(env),
      database: {
        generateId: 'uuid'
      },
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for']
      }
    },
    trustedOrigins: getTrustedOrigins(env),
    plugins: [expo()]
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth['$Infer']['Session'];
