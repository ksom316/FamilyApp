import { sql } from 'drizzle-orm';
import {
  check,
  boolean,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
};

export const familyRole = pgEnum('family_role', ['owner', 'guardian', 'member']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('display_name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('avatar_url'),
  ...timestamps
});

export const authSessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' })
  },
  (table) => [index('sessions_user_idx').on(table.userId), index('sessions_expires_at_idx').on(table.expiresAt)]
);

export const authAccounts = pgTable(
  'accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps
  },
  (table) => [
    unique('accounts_provider_account_unique').on(table.providerId, table.accountId),
    index('accounts_user_idx').on(table.userId)
  ]
);

export const authVerifications = pgTable(
  'verifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)]
);

export const families = pgTable(
  'families',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    ...timestamps
  },
  (table) => [index('families_created_by_idx').on(table.createdBy)]
);

export const familyMembers = pgTable(
  'family_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: familyRole('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('family_members_family_user_unique').on(table.familyId, table.userId),
    unique('family_members_id_family_unique').on(table.id, table.familyId),
    index('family_members_family_idx').on(table.familyId),
    index('family_members_user_idx').on(table.userId)
  ]
);

export const households = pgTable(
  'households',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    ...timestamps
  },
  (table) => [
    unique('households_id_family_unique').on(table.id, table.familyId),
    index('households_family_idx').on(table.familyId)
  ]
);

export const householdMembers = pgTable(
  'household_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id').notNull(),
    householdId: uuid('household_id').notNull(),
    familyMemberId: uuid('family_member_id').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      name: 'household_members_household_family_fk',
      columns: [table.householdId, table.familyId],
      foreignColumns: [households.id, households.familyId]
    }).onDelete('cascade'),
    foreignKey({
      name: 'household_members_member_family_fk',
      columns: [table.familyMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('cascade'),
    uniqueIndex('household_members_household_member_unique').on(
      table.householdId,
      table.familyMemberId
    ),
    index('household_members_member_idx').on(table.familyMemberId)
  ]
);

export const familyInvitations = pgTable(
  'family_invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id').notNull(),
    inviterMemberId: uuid('inviter_member_id').notNull(),
    role: familyRole('role').notNull().default('member'),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      name: 'family_invitations_inviter_family_fk',
      columns: [table.inviterMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('cascade'),
    uniqueIndex('family_invitations_token_hash_unique').on(table.tokenHash),
    index('family_invitations_family_idx').on(table.familyId),
    check('family_invitations_expiry_after_creation', sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      'family_invitations_single_terminal_state',
      sql`not (${table.acceptedAt} is not null and ${table.revokedAt} is not null)`
    )
  ]
);
