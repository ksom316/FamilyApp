import { sql } from 'drizzle-orm';
import {
  check,
  boolean,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
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

// Family Network subgroups (e.g. "Parents", "Kids", "Accra Household"). A member can
// belong to any number of these without leaving the family itself — the family remains
// the only security boundary; households are purely an organizational grouping within it.
export const households = pgTable(
  'households',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    ...timestamps
  },
  (table) => [
    foreignKey({
      name: 'households_creator_family_fk',
      columns: [table.createdByMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('restrict'),
    unique('households_id_family_unique').on(table.id, table.familyId),
    uniqueIndex('households_family_name_unique').on(table.familyId, table.name),
    index('households_family_idx').on(table.familyId),
    index('households_creator_idx').on(table.createdByMemberId),
    check(
      'households_name_length',
      sql`char_length(${table.name}) between 1 and 80 and ${table.name} = btrim(${table.name})`
    ),
    check(
      'households_description_length',
      sql`${table.description} is null or (char_length(${table.description}) between 1 and 500 and ${table.description} = btrim(${table.description}))`
    )
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

export const familyEvents = pgTable(
  'family_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    foreignKey({
      name: 'family_events_creator_family_fk',
      columns: [table.createdByMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('restrict'),
    index('family_events_family_starts_at_idx').on(table.familyId, table.startsAt),
    index('family_events_creator_idx').on(table.createdByMemberId),
    check('family_events_end_after_start', sql`${table.endsAt} is null or ${table.endsAt} >= ${table.startsAt}`)
  ]
);

export const familyCalendarEvents = pgTable(
  'family_calendar_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    audienceType: text('audience_type').notNull().default('family'),
    householdId: uuid('household_id'),
    title: text('title').notNull(),
    description: text('description'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    location: text('location'),
    allDay: boolean('all_day').notNull().default(false),
    ...timestamps
  },
  (table) => [
    foreignKey({
      name: 'family_calendar_events_creator_family_fk',
      columns: [table.createdByMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('restrict'),
    foreignKey({
      name: 'family_calendar_events_household_family_fk',
      columns: [table.householdId, table.familyId],
      foreignColumns: [households.id, households.familyId]
    }).onDelete('cascade'),
    unique('family_calendar_events_id_family_unique').on(table.id, table.familyId),
    index('family_calendar_events_family_starts_at_idx').on(table.familyId, table.startsAt),
    index('family_calendar_events_family_ends_at_idx').on(table.familyId, table.endsAt),
    index('family_calendar_events_household_idx').on(table.householdId),
    index('family_calendar_events_creator_idx').on(table.createdByMemberId),
    check(
      'family_calendar_events_title_length',
      sql`char_length(${table.title}) between 1 and 140 and ${table.title} = btrim(${table.title})`
    ),
    check(
      'family_calendar_events_description_length',
      sql`${table.description} is null or (char_length(${table.description}) between 1 and 2000 and ${table.description} = btrim(${table.description}))`
    ),
    check(
      'family_calendar_events_location_length',
      sql`${table.location} is null or (char_length(${table.location}) between 1 and 300 and ${table.location} = btrim(${table.location}))`
    ),
    check('family_calendar_events_audience_type_allowed', sql`${table.audienceType} in ('family', 'household', 'members')`),
    check(
      'family_calendar_events_household_consistency',
      sql`(${table.audienceType} = 'household') = (${table.householdId} is not null)`
    ),
    check('family_calendar_events_end_after_start', sql`${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`)
  ]
);

export const familyCalendarEventMembers = pgTable(
  'family_calendar_event_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id').notNull(),
    eventId: uuid('event_id').notNull(),
    memberId: uuid('member_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      name: 'family_calendar_event_members_event_family_fk',
      columns: [table.eventId, table.familyId],
      foreignColumns: [familyCalendarEvents.id, familyCalendarEvents.familyId]
    }).onDelete('cascade'),
    foreignKey({
      name: 'family_calendar_event_members_member_family_fk',
      columns: [table.memberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('cascade'),
    uniqueIndex('family_calendar_event_members_event_member_unique').on(table.eventId, table.memberId),
    index('family_calendar_event_members_member_idx').on(table.memberId)
  ]
);

export const familyTasks = pgTable(
  'family_tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    assignedMemberId: uuid('assigned_member_id'),
    title: text('title').notNull(),
    description: text('description'),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    foreignKey({
      name: 'family_tasks_creator_family_fk',
      columns: [table.createdByMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('restrict'),
    foreignKey({
      name: 'family_tasks_assignee_family_fk',
      columns: [table.assignedMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('restrict'),
    index('family_tasks_family_due_at_idx').on(table.familyId, table.dueAt),
    index('family_tasks_family_completed_at_idx').on(table.familyId, table.completedAt),
    index('family_tasks_creator_idx').on(table.createdByMemberId),
    index('family_tasks_assignee_idx').on(table.assignedMemberId)
  ]
);

export const familyMessages = pgTable(
  'family_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    senderMemberId: uuid('sender_member_id').notNull(),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      name: 'family_messages_sender_family_fk',
      columns: [table.senderMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('restrict'),
    index('family_messages_family_created_at_idx').on(table.familyId, table.createdAt),
    index('family_messages_sender_idx').on(table.senderMemberId),
    check(
      'family_messages_text_length',
      sql`char_length(${table.text}) between 1 and 2000 and ${table.text} = btrim(${table.text})`
    )
  ]
);

export const familyPrivateConversations = pgTable(
  'family_private_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id').notNull(),
    memberOneId: uuid('member_one_id').notNull(),
    memberTwoId: uuid('member_two_id').notNull(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      name: 'family_private_conversations_member_one_family_fk',
      columns: [table.memberOneId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('cascade'),
    foreignKey({
      name: 'family_private_conversations_member_two_family_fk',
      columns: [table.memberTwoId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('cascade'),
    unique('family_private_conversations_id_family_unique').on(table.id, table.familyId),
    uniqueIndex('family_private_conversations_pair_unique').on(table.familyId, table.memberOneId, table.memberTwoId),
    index('family_private_conversations_family_activity_idx').on(table.familyId, table.lastMessageAt),
    check('family_private_conversations_canonical_pair', sql`${table.memberOneId} < ${table.memberTwoId}`)
  ]
);

export const familyPrivateConversationParticipants = pgTable(
  'family_private_conversation_participants',
  {
    conversationId: uuid('conversation_id').notNull(),
    familyId: uuid('family_id').notNull(),
    memberId: uuid('member_id').notNull(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      name: 'family_private_conversation_participants_conversation_family_fk',
      columns: [table.conversationId, table.familyId],
      foreignColumns: [familyPrivateConversations.id, familyPrivateConversations.familyId]
    }).onDelete('cascade'),
    foreignKey({
      name: 'family_private_conversation_participants_member_family_fk',
      columns: [table.memberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('cascade'),
    unique('family_private_conversation_participants_identity_unique').on(
      table.conversationId,
      table.familyId,
      table.memberId
    ),
    index('family_private_conversation_participants_member_idx').on(table.familyId, table.memberId)
  ]
);

export const familyPrivateMessages = pgTable(
  'family_private_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    senderMemberId: uuid('sender_member_id').notNull(),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      name: 'family_private_messages_sender_participant_fk',
      columns: [table.conversationId, table.familyId, table.senderMemberId],
      foreignColumns: [
        familyPrivateConversationParticipants.conversationId,
        familyPrivateConversationParticipants.familyId,
        familyPrivateConversationParticipants.memberId
      ]
    }).onDelete('cascade'),
    index('family_private_messages_conversation_created_at_idx').on(table.conversationId, table.createdAt),
    index('family_private_messages_sender_idx').on(table.senderMemberId),
    check(
      'family_private_messages_text_length',
      sql`char_length(${table.text}) between 1 and 2000 and ${table.text} = btrim(${table.text})`
    )
  ]
);

export const memoryMediaType = pgEnum('memory_media_type', ['image']);

export const familyMemories = pgTable(
  'family_memories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    title: text('title'),
    memoryDate: date('memory_date', { mode: 'string' }).notNull(),
    mediaType: memoryMediaType('media_type').notNull().default('image'),
    objectKey: text('object_key').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    ...timestamps
  },
  (table) => [
    foreignKey({
      name: 'family_memories_creator_family_fk',
      columns: [table.createdByMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('restrict'),
    unique('family_memories_id_family_unique').on(table.id, table.familyId),
    unique('family_memories_object_key_unique').on(table.objectKey),
    index('family_memories_family_memory_date_idx').on(table.familyId, table.memoryDate),
    index('family_memories_creator_idx').on(table.createdByMemberId),
    check(
      'family_memories_title_length',
      sql`${table.title} is null or char_length(${table.title}) between 1 and 120`
    ),
    check('family_memories_file_size_positive', sql`${table.fileSizeBytes} > 0`)
  ]
);

export const familyMemoryFavorites = pgTable(
  'family_memory_favorites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    memoryId: uuid('memory_id').notNull(),
    memberId: uuid('member_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      name: 'family_memory_favorites_memory_family_fk',
      columns: [table.memoryId, table.familyId],
      foreignColumns: [familyMemories.id, familyMemories.familyId]
    }).onDelete('cascade'),
    foreignKey({
      name: 'family_memory_favorites_member_family_fk',
      columns: [table.memberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('cascade'),
    uniqueIndex('family_memory_favorites_memory_member_unique').on(table.memoryId, table.memberId),
    index('family_memory_favorites_member_idx').on(table.memberId)
  ]
);

export const familyTimeCapsules = pgTable(
  'family_time_capsules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    title: text('title').notNull(),
    message: text('message'),
    unlockAt: timestamp('unlock_at', { withTimezone: true }).notNull(),
    ...timestamps
  },
  (table) => [
    foreignKey({
      name: 'family_time_capsules_creator_family_fk',
      columns: [table.createdByMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('restrict'),
    unique('family_time_capsules_id_family_unique').on(table.id, table.familyId),
    index('family_time_capsules_family_unlock_at_idx').on(table.familyId, table.unlockAt),
    index('family_time_capsules_creator_idx').on(table.createdByMemberId),
    check(
      'family_time_capsules_title_length',
      sql`char_length(${table.title}) between 1 and 120 and ${table.title} = btrim(${table.title})`
    ),
    check(
      'family_time_capsules_message_length',
      sql`${table.message} is null or (char_length(${table.message}) between 1 and 5000 and ${table.message} = btrim(${table.message}))`
    ),
    check('family_time_capsules_unlock_after_creation', sql`${table.unlockAt} > ${table.createdAt}`)
  ]
);

export const familyTimeCapsuleMemories = pgTable(
  'family_time_capsule_memories',
  {
    familyId: uuid('family_id').notNull(),
    capsuleId: uuid('capsule_id').notNull(),
    memoryId: uuid('memory_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      name: 'family_time_capsule_memories_capsule_family_fk',
      columns: [table.capsuleId, table.familyId],
      foreignColumns: [familyTimeCapsules.id, familyTimeCapsules.familyId]
    }).onDelete('cascade'),
    foreignKey({
      name: 'family_time_capsule_memories_memory_family_fk',
      columns: [table.memoryId, table.familyId],
      foreignColumns: [familyMemories.id, familyMemories.familyId]
    }).onDelete('cascade'),
    uniqueIndex('family_time_capsule_memories_capsule_memory_unique').on(table.capsuleId, table.memoryId),
    index('family_time_capsule_memories_memory_idx').on(table.memoryId)
  ]
);

export const familyTimeCapsuleAttachments = pgTable(
  'family_time_capsule_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id').notNull(),
    capsuleId: uuid('capsule_id').notNull(),
    objectKey: text('object_key').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      name: 'family_time_capsule_attachments_capsule_family_fk',
      columns: [table.capsuleId, table.familyId],
      foreignColumns: [familyTimeCapsules.id, familyTimeCapsules.familyId]
    }).onDelete('cascade'),
    unique('family_time_capsule_attachments_object_key_unique').on(table.objectKey),
    index('family_time_capsule_attachments_capsule_idx').on(table.capsuleId),
    check('family_time_capsule_attachments_file_size_positive', sql`${table.fileSizeBytes} > 0`)
  ]
);

// Live location sharing: exactly one row per member, upserted on every start/refresh.
// There is intentionally no history table — stopping or expiring a share simply makes
// it invisible to normal queries; nothing beyond the current fix is ever retained.
export const familyLocationShares = pgTable(
  'family_location_shares',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').notNull(),
    // Nullable: coordinates are cleared (not merely hidden) the moment a share is
    // stopped, expires, or is lazily swept up as stale — see the location service for
    // where each of those clears happens. A null lat/lng always means "no current
    // precise location retained for this member," never "sharing, location unknown."
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    accuracyMeters: doublePrecision('accuracy_meters'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    stoppedAt: timestamp('stopped_at', { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    foreignKey({
      name: 'family_location_shares_member_family_fk',
      columns: [table.memberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('cascade'),
    unique('family_location_shares_member_unique').on(table.memberId),
    index('family_location_shares_family_active_idx').on(table.familyId, table.stoppedAt, table.expiresAt),
    index('family_location_shares_expires_at_idx').on(table.expiresAt),
    check(
      'family_location_shares_latitude_range',
      sql`${table.latitude} is null or ${table.latitude} between -90 and 90`
    ),
    check(
      'family_location_shares_longitude_range',
      sql`${table.longitude} is null or ${table.longitude} between -180 and 180`
    ),
    check(
      'family_location_shares_coords_consistency',
      sql`(${table.latitude} is null) = (${table.longitude} is null)`
    ),
    check(
      'family_location_shares_accuracy_range',
      sql`${table.accuracyMeters} is null or ${table.accuracyMeters} between 0 and 50000`
    )
  ]
);

export const findMeResponse = pgEnum('find_me_response', ['coming', 'dismissed']);

// One outstanding outgoing request per requester, upserted the same way as location
// shares. The requester is always the person being located; recipients never initiate
// tracking of someone else.
export const familyFindMeRequests = pgTable(
  'family_find_me_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    requesterMemberId: uuid('requester_member_id').notNull(),
    recipientMemberId: uuid('recipient_member_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    response: findMeResponse('response'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      name: 'family_find_me_requester_family_fk',
      columns: [table.requesterMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('cascade'),
    foreignKey({
      name: 'family_find_me_recipient_family_fk',
      columns: [table.recipientMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('cascade'),
    unique('family_find_me_requester_unique').on(table.requesterMemberId),
    index('family_find_me_recipient_idx').on(table.recipientMemberId),
    index('family_find_me_expires_at_idx').on(table.expiresAt),
    check('family_find_me_not_self', sql`${table.requesterMemberId} <> ${table.recipientMemberId}`),
    check(
      'family_find_me_response_consistency',
      sql`(${table.response} is null) = (${table.respondedAt} is null)`
    )
  ]
);

// Polls target either the whole family (householdId null) or one existing subgroup
// (householdId set, FK-checked to belong to the same family). Open/closed state is
// derived at read time from closesAt/closedAt and server time — there is no separate
// stored boolean to drift out of sync.
export const familyPolls = pgTable(
  'family_polls',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    householdId: uuid('household_id'),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    question: text('question').notNull(),
    description: text('description'),
    closesAt: timestamp('closes_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    foreignKey({
      name: 'family_polls_creator_family_fk',
      columns: [table.createdByMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('restrict'),
    foreignKey({
      name: 'family_polls_household_family_fk',
      columns: [table.householdId, table.familyId],
      foreignColumns: [households.id, households.familyId]
    }).onDelete('cascade'),
    unique('family_polls_id_family_unique').on(table.id, table.familyId),
    index('family_polls_family_created_at_idx').on(table.familyId, table.createdAt),
    index('family_polls_household_idx').on(table.householdId),
    index('family_polls_creator_idx').on(table.createdByMemberId),
    index('family_polls_closes_at_idx').on(table.closesAt),
    check(
      'family_polls_question_length',
      sql`char_length(${table.question}) between 1 and 200 and ${table.question} = btrim(${table.question})`
    ),
    check(
      'family_polls_description_length',
      sql`${table.description} is null or (char_length(${table.description}) between 1 and 1000 and ${table.description} = btrim(${table.description}))`
    ),
    check('family_polls_closes_after_creation', sql`${table.closesAt} is null or ${table.closesAt} > ${table.createdAt}`)
  ]
);

export const familyPollOptions = pgTable(
  'family_poll_options',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id').notNull(),
    pollId: uuid('poll_id').notNull(),
    text: text('text').notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      name: 'family_poll_options_poll_family_fk',
      columns: [table.pollId, table.familyId],
      foreignColumns: [familyPolls.id, familyPolls.familyId]
    }).onDelete('cascade'),
    unique('family_poll_options_id_poll_unique').on(table.id, table.pollId),
    uniqueIndex('family_poll_options_poll_position_unique').on(table.pollId, table.position),
    index('family_poll_options_poll_idx').on(table.pollId),
    check(
      'family_poll_options_text_length',
      sql`char_length(${table.text}) between 1 and 140 and ${table.text} = btrim(${table.text})`
    ),
    check('family_poll_options_position_range', sql`${table.position} between 0 and 9`)
  ]
);

// One row per (poll, member) — changing a vote updates optionId in place rather than
// inserting a second row, so there is never more than one active vote per member.
export const familyPollVotes = pgTable(
  'family_poll_votes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id').notNull(),
    pollId: uuid('poll_id').notNull(),
    memberId: uuid('member_id').notNull(),
    optionId: uuid('option_id').notNull(),
    ...timestamps
  },
  (table) => [
    foreignKey({
      name: 'family_poll_votes_poll_family_fk',
      columns: [table.pollId, table.familyId],
      foreignColumns: [familyPolls.id, familyPolls.familyId]
    }).onDelete('cascade'),
    foreignKey({
      name: 'family_poll_votes_member_family_fk',
      columns: [table.memberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('cascade'),
    // Ties the vote's option to the SAME poll being voted on — a vote can never
    // reference an option belonging to a different poll.
    foreignKey({
      name: 'family_poll_votes_option_poll_fk',
      columns: [table.optionId, table.pollId],
      foreignColumns: [familyPollOptions.id, familyPollOptions.pollId]
    }).onDelete('cascade'),
    uniqueIndex('family_poll_votes_poll_member_unique').on(table.pollId, table.memberId),
    index('family_poll_votes_option_idx').on(table.optionId)
  ]
);

// Shopping lists target either the whole family (householdId null) or one existing
// subgroup (householdId set, FK-checked to belong to the same family) — same targeting
// shape as polls. Completion is a manual, one-way flag (completedAt), never derived from
// shoppingDate — a list doesn't auto-complete just because its shopping date has passed.
export const familyShoppingLists = pgTable(
  'family_shopping_lists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    householdId: uuid('household_id'),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    shoppingDate: timestamp('shopping_date', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    foreignKey({
      name: 'family_shopping_lists_creator_family_fk',
      columns: [table.createdByMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('restrict'),
    foreignKey({
      name: 'family_shopping_lists_household_family_fk',
      columns: [table.householdId, table.familyId],
      foreignColumns: [households.id, households.familyId]
    }).onDelete('cascade'),
    unique('family_shopping_lists_id_family_unique').on(table.id, table.familyId),
    index('family_shopping_lists_family_created_at_idx').on(table.familyId, table.createdAt),
    index('family_shopping_lists_household_idx').on(table.householdId),
    index('family_shopping_lists_family_completed_idx').on(table.familyId, table.completedAt),
    index('family_shopping_lists_creator_idx').on(table.createdByMemberId),
    check(
      'family_shopping_lists_name_length',
      sql`char_length(${table.name}) between 1 and 100 and ${table.name} = btrim(${table.name})`
    ),
    check(
      'family_shopping_lists_description_length',
      sql`${table.description} is null or (char_length(${table.description}) between 1 and 1000 and ${table.description} = btrim(${table.description}))`
    )
  ]
);

export const familyShoppingItems = pgTable(
  'family_shopping_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id').notNull(),
    listId: uuid('list_id').notNull(),
    name: text('name').notNull(),
    quantity: doublePrecision('quantity'),
    unit: text('unit'),
    note: text('note'),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }),
    addedByMemberId: uuid('added_by_member_id').notNull(),
    ...timestamps
  },
  (table) => [
    foreignKey({
      name: 'family_shopping_items_list_family_fk',
      columns: [table.listId, table.familyId],
      foreignColumns: [familyShoppingLists.id, familyShoppingLists.familyId]
    }).onDelete('cascade'),
    foreignKey({
      name: 'family_shopping_items_added_by_family_fk',
      columns: [table.addedByMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('restrict'),
    index('family_shopping_items_list_idx').on(table.listId),
    index('family_shopping_items_list_purchased_idx').on(table.listId, table.purchasedAt),
    index('family_shopping_items_added_by_idx').on(table.addedByMemberId),
    check(
      'family_shopping_items_name_length',
      sql`char_length(${table.name}) between 1 and 140 and ${table.name} = btrim(${table.name})`
    ),
    check(
      'family_shopping_items_unit_length',
      sql`${table.unit} is null or (char_length(${table.unit}) between 1 and 30 and ${table.unit} = btrim(${table.unit}))`
    ),
    check(
      'family_shopping_items_note_length',
      sql`${table.note} is null or (char_length(${table.note}) between 1 and 300 and ${table.note} = btrim(${table.note}))`
    ),
    check('family_shopping_items_quantity_positive', sql`${table.quantity} is null or ${table.quantity} > 0`)
  ]
);

// Menus target either the whole family (householdId null) or one existing subgroup —
// same shape as polls/shopping lists. weekStartDate is always a Monday (enforced by
// check below), giving every week a single canonical identity per target.
export const familyMenus = pgTable(
  'family_menus',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    householdId: uuid('household_id'),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    weekStartDate: date('week_start_date', { mode: 'string' }).notNull(),
    title: text('title'),
    ...timestamps
  },
  (table) => [
    foreignKey({
      name: 'family_menus_creator_family_fk',
      columns: [table.createdByMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('restrict'),
    foreignKey({
      name: 'family_menus_household_family_fk',
      columns: [table.householdId, table.familyId],
      foreignColumns: [households.id, households.familyId]
    }).onDelete('cascade'),
    unique('family_menus_id_family_unique').on(table.id, table.familyId),
    // Defense-in-depth against duplicate menus for the same target/week. The primary
    // guard is an application-level find-or-create check (see menus-service), since a
    // plain unique index can't by itself distinguish "no household" from "no household"
    // across two different rows the way NULL comparisons work in Postgres for the
    // household-less case; this index still fully protects the household-targeted case.
    unique('family_menus_family_household_week_unique').on(table.familyId, table.householdId, table.weekStartDate),
    index('family_menus_family_week_idx').on(table.familyId, table.weekStartDate),
    index('family_menus_household_idx').on(table.householdId),
    index('family_menus_creator_idx').on(table.createdByMemberId),
    check('family_menus_week_start_is_monday', sql`extract(dow from ${table.weekStartDate}) = 1`),
    check(
      'family_menus_title_length',
      sql`${table.title} is null or (char_length(${table.title}) between 1 and 100 and ${table.title} = btrim(${table.title}))`
    )
  ]
);

// A meal "slot" only exists as a row when it has content — an empty Breakfast/Lunch/
// Dinner is simply the absence of a row for that (menuId, mealDate, mealType), not a row
// with an empty name. mealType is plain text with a check constraint (rather than a
// pgEnum) specifically so adding e.g. "snack" later is a one-line constraint change
// instead of an enum-value migration.
export const familyMenuMeals = pgTable(
  'family_menu_meals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id').notNull(),
    menuId: uuid('menu_id').notNull(),
    mealDate: date('meal_date', { mode: 'string' }).notNull(),
    mealType: text('meal_type').notNull(),
    mealName: text('meal_name').notNull(),
    note: text('note'),
    ...timestamps
  },
  (table) => [
    foreignKey({
      name: 'family_menu_meals_menu_family_fk',
      columns: [table.menuId, table.familyId],
      foreignColumns: [familyMenus.id, familyMenus.familyId]
    }).onDelete('cascade'),
    uniqueIndex('family_menu_meals_menu_date_type_unique').on(table.menuId, table.mealDate, table.mealType),
    index('family_menu_meals_menu_idx').on(table.menuId),
    check('family_menu_meals_type_allowed', sql`${table.mealType} in ('breakfast', 'lunch', 'dinner')`),
    check(
      'family_menu_meals_name_length',
      sql`char_length(${table.mealName}) between 1 and 140 and ${table.mealName} = btrim(${table.mealName})`
    ),
    check(
      'family_menu_meals_note_length',
      sql`${table.note} is null or (char_length(${table.note}) between 1 and 300 and ${table.note} = btrim(${table.note}))`
    )
  ]
);

// Reusable menu templates (F16B) — deliberately a separate table from family_menus
// rather than a reuse of it, since a template has no calendar week at all (it lives
// indefinitely until replaced) and its meal entries key off a day-of-week, not a date.
//
// F16C: audience is now one of three types rather than an implicit
// whole-family/household toggle. audienceType='household' still uses householdId
// exactly as before; audienceType='members' uses the normalized join table below
// instead of a JSON/text array of member ids, so family scoping stays enforceable via
// composite FKs the same way household membership already is. Multiple saved menus may
// be active simultaneously now (see the removed exclusivity index below) — "active"
// means "surface this prominently," not "the only one in effect."
export const familySavedMenus = pgTable(
  'family_saved_menus',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    audienceType: text('audience_type').notNull().default('family'),
    householdId: uuid('household_id'),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(false),
    ...timestamps
  },
  (table) => [
    foreignKey({
      name: 'family_saved_menus_creator_family_fk',
      columns: [table.createdByMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('restrict'),
    foreignKey({
      name: 'family_saved_menus_household_family_fk',
      columns: [table.householdId, table.familyId],
      foreignColumns: [households.id, households.familyId]
    }).onDelete('cascade'),
    unique('family_saved_menus_id_family_unique').on(table.id, table.familyId),
    index('family_saved_menus_family_idx').on(table.familyId),
    index('family_saved_menus_household_idx').on(table.householdId),
    index('family_saved_menus_creator_idx').on(table.createdByMemberId),
    check(
      'family_saved_menus_name_length',
      sql`char_length(${table.name}) between 1 and 100 and ${table.name} = btrim(${table.name})`
    ),
    check(
      'family_saved_menus_description_length',
      sql`${table.description} is null or (char_length(${table.description}) between 1 and 500 and ${table.description} = btrim(${table.description}))`
    ),
    check('family_saved_menus_audience_type_allowed', sql`${table.audienceType} in ('family', 'household', 'members')`),
    // household_id is set if and only if audience_type = 'household' — keeps the two
    // columns from drifting out of sync with each other.
    check(
      'family_saved_menus_household_consistency',
      sql`(${table.audienceType} = 'household') = (${table.householdId} is not null)`
    )
  ]
);

// Normalized "specific people" audience — one row per targeted member, family-scoped via
// the same composite-FK pattern household_members already uses. Preferred over a
// JSON/text array of member ids specifically so family scoping stays DB-enforced and a
// member leaving the family (or being removed from this list) cleanly disappears.
export const familySavedMenuMembers = pgTable(
  'family_saved_menu_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id').notNull(),
    savedMenuId: uuid('saved_menu_id').notNull(),
    memberId: uuid('member_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      name: 'family_saved_menu_members_menu_family_fk',
      columns: [table.savedMenuId, table.familyId],
      foreignColumns: [familySavedMenus.id, familySavedMenus.familyId]
    }).onDelete('cascade'),
    foreignKey({
      name: 'family_saved_menu_members_member_family_fk',
      columns: [table.memberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('cascade'),
    uniqueIndex('family_saved_menu_members_menu_member_unique').on(table.savedMenuId, table.memberId),
    index('family_saved_menu_members_member_idx').on(table.memberId)
  ]
);

export const familySavedMenuMeals = pgTable(
  'family_saved_menu_meals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id').notNull(),
    savedMenuId: uuid('saved_menu_id').notNull(),
    // 0 = Monday .. 6 = Sunday, matching the Monday-start week convention family_menus
    // already uses.
    dayOfWeek: integer('day_of_week').notNull(),
    mealType: text('meal_type').notNull(),
    mealName: text('meal_name').notNull(),
    note: text('note'),
    ...timestamps
  },
  (table) => [
    foreignKey({
      name: 'family_saved_menu_meals_menu_family_fk',
      columns: [table.savedMenuId, table.familyId],
      foreignColumns: [familySavedMenus.id, familySavedMenus.familyId]
    }).onDelete('cascade'),
    uniqueIndex('family_saved_menu_meals_menu_day_type_unique').on(table.savedMenuId, table.dayOfWeek, table.mealType),
    index('family_saved_menu_meals_menu_idx').on(table.savedMenuId),
    check('family_saved_menu_meals_day_range', sql`${table.dayOfWeek} between 0 and 6`),
    check('family_saved_menu_meals_type_allowed', sql`${table.mealType} in ('breakfast', 'lunch', 'dinner')`),
    check(
      'family_saved_menu_meals_name_length',
      sql`char_length(${table.mealName}) between 1 and 140 and ${table.mealName} = btrim(${table.mealName})`
    ),
    check(
      'family_saved_menu_meals_note_length',
      sql`${table.note} is null or (char_length(${table.note}) between 1 and 300 and ${table.note} = btrim(${table.note}))`
    )
  ]
);

// Voluntary, member-posted safety check-ins — never location, never automatic. A
// member's "current status" is simply their newest row here; there is no separate
// latest-status table to keep in sync.
export const familyCheckIns = pgTable(
  'family_check_ins',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').notNull(),
    status: text('status').notNull(),
    message: text('message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      name: 'family_check_ins_member_family_fk',
      columns: [table.memberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('cascade'),
    index('family_check_ins_family_created_idx').on(table.familyId, table.createdAt),
    check('family_check_ins_status_allowed', sql`${table.status} in ('safe', 'arrived')`),
    check(
      'family_check_ins_message_length',
      sql`${table.message} is null or (char_length(${table.message}) between 1 and 200 and ${table.message} = btrim(${table.message}))`
    )
  ]
);

// A family-wide urgent alert. FamilyApp only ever coordinates the family itself here —
// nothing in this table or the service built on it contacts police/ambulance/fire/any
// outside service, and resolution is a plain in-app status flip, not a "case closed with
// authorities" signal.
export const familyEmergencyIncidents = pgTable(
  'family_emergency_incidents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    emergencyType: text('emergency_type').notNull(),
    message: text('message'),
    status: text('status').notNull().default('active'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedByMemberId: uuid('resolved_by_member_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      name: 'family_emergency_incidents_creator_family_fk',
      columns: [table.createdByMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('cascade'),
    foreignKey({
      name: 'family_emergency_incidents_resolver_family_fk',
      columns: [table.resolvedByMemberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('set null'),
    unique('family_emergency_incidents_id_family_unique').on(table.id, table.familyId),
    index('family_emergency_incidents_family_status_idx').on(table.familyId, table.status, table.createdAt),
    check('family_emergency_incidents_type_allowed', sql`${table.emergencyType} in ('need_help', 'medical', 'safety_concern', 'other')`),
    check('family_emergency_incidents_status_allowed', sql`${table.status} in ('active', 'resolved')`),
    check(
      'family_emergency_incidents_message_length',
      sql`${table.message} is null or (char_length(${table.message}) between 1 and 300 and ${table.message} = btrim(${table.message}))`
    ),
    check(
      'family_emergency_incidents_resolution_consistency',
      sql`(${table.status} = 'resolved') = (${table.resolvedAt} is not null) and (${table.resolvedAt} is not null) = (${table.resolvedByMemberId} is not null)`
    )
  ]
);

// "Seen" vs "responding" for a single incident — one row per (incident, member), never a
// second table to track "current" acknowledgement since there's only ever one per member.
export const familyEmergencyAcknowledgements = pgTable(
  'family_emergency_acknowledgements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id').notNull(),
    incidentId: uuid('incident_id').notNull(),
    memberId: uuid('member_id').notNull(),
    responseStatus: text('response_status').notNull().default('seen'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      name: 'family_emergency_acks_incident_family_fk',
      columns: [table.incidentId, table.familyId],
      foreignColumns: [familyEmergencyIncidents.id, familyEmergencyIncidents.familyId]
    }).onDelete('cascade'),
    foreignKey({
      name: 'family_emergency_acks_member_family_fk',
      columns: [table.memberId, table.familyId],
      foreignColumns: [familyMembers.id, familyMembers.familyId]
    }).onDelete('cascade'),
    uniqueIndex('family_emergency_acks_incident_member_unique').on(table.incidentId, table.memberId),
    index('family_emergency_acks_incident_idx').on(table.incidentId),
    check('family_emergency_acks_response_allowed', sql`${table.responseStatus} in ('seen', 'responding')`)
  ]
);
