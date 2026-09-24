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
  MEMORIES_BUCKET?: R2Bucket;
};

export function getTrustedOrigins(env: AuthBindings) {
  const configured = env.AUTH_TRUSTED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
  return [
    'familyapp://',
    'familyapp://*',
    'http://localhost:8081',
    'http://localhost:19006',
    'http://localhost:3000',
    ...configured
  ];
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
