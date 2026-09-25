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
