import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import {
  familyCalendarEventMembers,
  familyCalendarEvents,
  familyMembers,
  householdMembers,
  households,
  users
} from '@familyapp/db/schema';

import { requireFamilyMembership } from './family-service';
import { createNotifications, familyMemberIds, householdMemberIds, recipientsExcluding } from './notifications-service';

const MAX_TITLE_LENGTH = 140;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_LOCATION_LENGTH = 300;
const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const EVENT_PAGE_SIZE = 500;
const AUDIENCE_TYPES = ['family', 'household', 'members'] as const;
type AudienceType = typeof AUDIENCE_TYPES[number];

export type CalendarErrorCode =
  | 'invalid_event'
  | 'invalid_title'
  | 'invalid_description'
  | 'invalid_location'
  | 'invalid_date'
  | 'invalid_range'
  | 'invalid_audience'
  | 'invalid_household'
  | 'invalid_member'
  | 'household_not_eligible'
  | 'event_not_found'
  | 'forbidden_event_action';

export class CalendarServiceError extends Error {
  constructor(public readonly code: CalendarErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'CalendarServiceError';
  }
}

type EventInput = {
  title?: unknown;
  description?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  location?: unknown;
  allDay?: unknown;
  audienceType?: unknown;
  householdId?: unknown;
  memberIds?: unknown;
};

function assertUuid(value: string, label = 'event') {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new CalendarServiceError('invalid_event', `The ${label} identifier is not valid.`);
  }
}

function readText(value: unknown, label: string, maximum: number, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > maximum) {
    const code = label === 'Title' ? 'invalid_title' : label === 'Location' ? 'invalid_location' : 'invalid_description';
    throw new CalendarServiceError(code, `${label} must be ${optional ? `between 1 and ${maximum.toLocaleString()}` : `between 1 and ${maximum}`} characters${optional ? ', or left blank' : ''}.`);
  }
  return value.trim();
}

function readBoolean(value: unknown) {
  if (typeof value !== 'boolean') throw new CalendarServiceError('invalid_date', 'Choose whether this is an all-day event.');
  return value;
}

function readDate(value: unknown, label: string, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string') throw new CalendarServiceError('invalid_date', `${label} is required.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new CalendarServiceError('invalid_date', `${label} is not valid.`);
  return date;
}

function utcDayStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function utcDayEnd(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) - 1);
}

function readAudienceType(value: unknown) {
  if (typeof value !== 'string' || !AUDIENCE_TYPES.includes(value as AudienceType)) {
    throw new CalendarServiceError('invalid_audience', 'Choose who this event is for.');
  }
  return value as AudienceType;
}

function readMemberIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CalendarServiceError('invalid_audience', 'Choose at least one person.');
  }
  const ids = value.map((id) => {
    if (typeof id !== 'string') throw new CalendarServiceError('invalid_audience', 'Choose valid people.');
    assertUuid(id, 'member');
    return id;
  });
  return [...new Set(ids)];
}

async function assertMembersEligible(db: Database, familyId: string, memberIds: string[]) {
  const rows = await db.select({ id: familyMembers.id }).from(familyMembers)
    .where(and(eq(familyMembers.familyId, familyId), inArray(familyMembers.id, memberIds)));
  if (rows.length !== memberIds.length) {
    throw new CalendarServiceError('invalid_member', 'Choose people from your family.');
  }
}

async function assertHouseholdEligible(db: Database, familyId: string, householdId: string, memberId: string) {
  assertUuid(householdId, 'group');
  const [row] = await db.select({ id: householdMembers.id }).from(householdMembers).where(and(
    eq(householdMembers.householdId, householdId),
    eq(householdMembers.familyId, familyId),
    eq(householdMembers.familyMemberId, memberId)
  )).limit(1);
  if (!row) {
    throw new CalendarServiceError('household_not_eligible', 'You can only create an event for a group you belong to.', 403);
  }
}

function readRange(rawFrom: unknown, rawTo: unknown) {
  const from = readDate(rawFrom, 'Range start') as Date;
  const to = readDate(rawTo, 'Range end') as Date;
  if (to.getTime() <= from.getTime()) {
    throw new CalendarServiceError('invalid_range', 'Range end must be after range start.');
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    throw new CalendarServiceError('invalid_range', 'Calendar ranges may cover at most 366 days.');
  }
  return { from, to };
}

type ExistingEvent = typeof familyCalendarEvents.$inferSelect;

function readEventValues(input: EventInput, existing?: ExistingEvent) {
  const allDay = input.allDay === undefined && existing ? existing.allDay : readBoolean(input.allDay);
  const startsAtInput = input.startsAt === undefined && existing ? existing.startsAt.toISOString() : input.startsAt;
  const endsAtInput = input.endsAt === undefined && existing
    ? existing.endsAt?.toISOString() ?? null
    : input.endsAt;
  let startsAt = readDate(startsAtInput, 'Start') as Date;
  let endsAt = readDate(endsAtInput, 'End', true);
  if (allDay) {
    startsAt = utcDayStart(startsAt);
    if (endsAt) endsAt = utcDayEnd(endsAt);
  }
  if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new CalendarServiceError('invalid_date', 'End must be after start.');
  }
  return {
    title: (input.title === undefined && existing ? existing.title : readText(input.title, 'Title', MAX_TITLE_LENGTH)) as string,
    description: input.description === undefined && existing ? existing.description : readText(input.description, 'Description', MAX_DESCRIPTION_LENGTH, true),
    location: input.location === undefined && existing ? existing.location : readText(input.location, 'Location', MAX_LOCATION_LENGTH, true),
    startsAt,
    endsAt,
    allDay
  };
}

const baseSelection = {
  id: familyCalendarEvents.id,
  familyId: familyCalendarEvents.familyId,
  createdByMemberId: familyCalendarEvents.createdByMemberId,
  audienceType: familyCalendarEvents.audienceType,
  householdId: familyCalendarEvents.householdId,
  householdName: households.name,
  title: familyCalendarEvents.title,
  description: familyCalendarEvents.description,
  startsAt: familyCalendarEvents.startsAt,
  endsAt: familyCalendarEvents.endsAt,
  location: familyCalendarEvents.location,
  allDay: familyCalendarEvents.allDay,
  createdAt: familyCalendarEvents.createdAt,
  updatedAt: familyCalendarEvents.updatedAt,
  createdBy: {
    memberId: familyMembers.id,
    displayName: users.name,
    avatar: users.image,
    identityType: users.identityType,
    avatarConfig: users.avatarConfig,
    hasPhoto: sql<boolean>`${users.photoObjectKey} is not null`
  }
};

async function selectRows(db: Database, where: SQL) {
  return db.select(baseSelection).from(familyCalendarEvents)
    .innerJoin(familyMembers, and(
      eq(familyCalendarEvents.createdByMemberId, familyMembers.id),
      eq(familyCalendarEvents.familyId, familyMembers.familyId)
    ))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .leftJoin(households, and(
      eq(familyCalendarEvents.householdId, households.id),
      eq(familyCalendarEvents.familyId, households.familyId)
    ))
    .where(where)
    .orderBy(asc(familyCalendarEvents.startsAt), asc(familyCalendarEvents.id))
    .limit(EVENT_PAGE_SIZE);
}

type EventRow = Awaited<ReturnType<typeof selectRows>>[number];

async function hydrateEvents(db: Database, rows: EventRow[]) {
  const memberEventIds = rows.filter((row) => row.audienceType === 'members').map((row) => row.id);
  const membersByEvent = new Map<string, Array<{ memberId: string; displayName: string; avatar: string | null }>>();
  if (memberEventIds.length) {
    const audienceRows = await db.select({
      eventId: familyCalendarEventMembers.eventId,
      memberId: familyMembers.id,
      displayName: users.name,
      avatar: users.image
    }).from(familyCalendarEventMembers)
      .innerJoin(familyMembers, and(
        eq(familyCalendarEventMembers.memberId, familyMembers.id),
        eq(familyCalendarEventMembers.familyId, familyMembers.familyId)
      ))
      .innerJoin(users, eq(familyMembers.userId, users.id))
      .where(inArray(familyCalendarEventMembers.eventId, memberEventIds))
      .orderBy(asc(users.name));
    for (const row of audienceRows) {
      const members = membersByEvent.get(row.eventId) ?? [];
      members.push({ memberId: row.memberId, displayName: row.displayName, avatar: row.avatar });
      membersByEvent.set(row.eventId, members);
    }
  }
  return rows.map((row) => ({
    id: row.id,
    familyId: row.familyId,
    createdByMemberId: row.createdByMemberId,
    title: row.title,
    description: row.description,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    location: row.location,
    allDay: row.allDay,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    audience: row.audienceType === 'household'
      ? { type: 'household' as const, household: { id: row.householdId as string, name: row.householdName ?? 'Group' } }
      : row.audienceType === 'members'
        ? { type: 'members' as const, members: membersByEvent.get(row.id) ?? [] }
        : { type: 'family' as const }
  }));
}

async function visibilityConditions(db: Database, familyId: string, memberId: string) {
  const myHouseholds = await db.select({ householdId: householdMembers.householdId }).from(householdMembers)
    .where(and(eq(householdMembers.familyId, familyId), eq(householdMembers.familyMemberId, memberId)));
  const conditions: SQL[] = [
    eq(familyCalendarEvents.createdByMemberId, memberId),
    eq(familyCalendarEvents.audienceType, 'family')
  ];
  if (myHouseholds.length) {
    conditions.push(and(
      eq(familyCalendarEvents.audienceType, 'household'),
      inArray(familyCalendarEvents.householdId, myHouseholds.map((row) => row.householdId))
    )!);
  }
  return conditions;
}

// Exported so the notification sweep can find "events happening today" using the exact
// same eligibility rules as the real listing — never a re-derived, potentially-diverging
// copy of the privacy logic.
export async function selectVisibleCalendarRows(db: Database, familyId: string, memberId: string, extraWhere: SQL) {
  const conditions = await visibilityConditions(db, familyId, memberId);
  return db.select(baseSelection).from(familyCalendarEvents)
    .innerJoin(familyMembers, and(
      eq(familyCalendarEvents.createdByMemberId, familyMembers.id),
      eq(familyCalendarEvents.familyId, familyMembers.familyId)
    ))
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .leftJoin(households, and(
      eq(familyCalendarEvents.householdId, households.id),
      eq(familyCalendarEvents.familyId, households.familyId)
    ))
    .leftJoin(familyCalendarEventMembers, and(
      eq(familyCalendarEventMembers.eventId, familyCalendarEvents.id),
      eq(familyCalendarEventMembers.familyId, familyCalendarEvents.familyId),
      eq(familyCalendarEventMembers.memberId, memberId)
    ))
    .where(and(
      eq(familyCalendarEvents.familyId, familyId),
      extraWhere,
      or(...conditions, and(
        eq(familyCalendarEvents.audienceType, 'members'),
        isNotNull(familyCalendarEventMembers.id)
      ))
    ))
    .orderBy(asc(familyCalendarEvents.startsAt), asc(familyCalendarEvents.id))
    .limit(EVENT_PAGE_SIZE);
}

async function requireEligibleEvent(db: Database, userId: string, familyId: string, eventId: string) {
  assertUuid(eventId);
  const membership = await requireFamilyMembership(db, userId, familyId);
  const rows = await selectVisibleCalendarRows(db, familyId, membership.id, eq(familyCalendarEvents.id, eventId));
  const event = rows[0];
  if (!event) throw new CalendarServiceError('event_not_found', 'Calendar event not found.', 404);
  return { membership, event };
}

export async function listCalendarEvents(
  db: Database,
  userId: string,
  familyId: string,
  rawFrom: unknown,
  rawTo: unknown
) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const { from, to } = readRange(rawFrom, rawTo);
  const rows = await selectVisibleCalendarRows(db, familyId, membership.id, and(
    lt(familyCalendarEvents.startsAt, to),
    or(
      gt(familyCalendarEvents.endsAt, from),
      and(isNull(familyCalendarEvents.endsAt), gte(familyCalendarEvents.startsAt, from))
    )
  )!);
  return hydrateEvents(db, rows);
}

export async function getCalendarEvent(db: Database, userId: string, familyId: string, eventId: string) {
  const { event } = await requireEligibleEvent(db, userId, familyId, eventId);
  const [hydrated] = await hydrateEvents(db, [event]);
  return hydrated;
}

async function readAudience(
  db: Database,
  familyId: string,
  creatorMemberId: string,
  input: EventInput,
  existing?: ExistingEvent
) {
  const audienceType = input.audienceType === undefined && existing
    ? existing.audienceType as AudienceType
    : readAudienceType(input.audienceType);
  let householdId: string | null = null;
  let memberIds: string[] | undefined;
  if (audienceType === 'household') {
    const rawHouseholdId = input.householdId === undefined && existing ? existing.householdId : input.householdId;
    if (typeof rawHouseholdId !== 'string') {
      throw new CalendarServiceError('invalid_household', 'Choose a valid family group.');
    }
    householdId = rawHouseholdId;
    await assertHouseholdEligible(db, familyId, householdId, creatorMemberId);
  } else if (audienceType === 'members') {
    if (input.memberIds === undefined && existing?.audienceType === 'members') {
      const rows = await db.select({ memberId: familyCalendarEventMembers.memberId }).from(familyCalendarEventMembers)
        .where(and(eq(familyCalendarEventMembers.eventId, existing.id), eq(familyCalendarEventMembers.familyId, familyId)));
      memberIds = rows.map((row) => row.memberId);
    } else {
      memberIds = readMemberIds(input.memberIds);
    }
    if (!memberIds.length) throw new CalendarServiceError('invalid_audience', 'Choose at least one person.');
    await assertMembersEligible(db, familyId, memberIds);
  }
  return { audienceType, householdId, memberIds: memberIds ?? [] };
}

export async function createCalendarEvent(db: Database, userId: string, familyId: string, input: EventInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const values = readEventValues(input);
  const audience = await readAudience(db, familyId, membership.id, input);
  const eventId = crypto.randomUUID();
  const eventInsert = db.insert(familyCalendarEvents).values({
    id: eventId,
    familyId,
    createdByMemberId: membership.id,
    ...values,
    audienceType: audience.audienceType,
    householdId: audience.householdId
  });
  if (audience.memberIds.length) {
    const audienceInsert = db.insert(familyCalendarEventMembers).values(
      audience.memberIds.map((memberId) => ({ familyId, eventId, memberId }))
    );
    await db.batch([eventInsert, audienceInsert] as const);
  } else await eventInsert;

  const event = await getCalendarEvent(db, userId, familyId, eventId);
  const recipientIds = audience.audienceType === 'family'
    ? await familyMemberIds(db, familyId)
    : audience.audienceType === 'household'
      ? await householdMemberIds(db, familyId, audience.householdId as string)
      : audience.memberIds;
  await createNotifications(db, recipientsExcluding(recipientIds, membership.id).map((recipientMemberId) => ({
    familyId,
    recipientMemberId,
    actorMemberId: membership.id,
    type: 'calendar_event_created',
    title: `${event.createdBy.displayName} created an event: ${event.title}`,
    entityType: 'calendar_event',
    entityId: eventId,
    route: '/(family)/calendar'
  })));

  return event;
}

export async function updateCalendarEvent(
  db: Database,
  userId: string,
  familyId: string,
  eventId: string,
  input: EventInput
) {
  const { membership, event } = await requireEligibleEvent(db, userId, familyId, eventId);
  if (event.createdByMemberId !== membership.id) {
    throw new CalendarServiceError('forbidden_event_action', 'Only the event creator can edit this event.', 403);
  }
  const [existing] = await db.select().from(familyCalendarEvents).where(and(
    eq(familyCalendarEvents.id, eventId), eq(familyCalendarEvents.familyId, familyId)
  )).limit(1);
  if (!existing) throw new CalendarServiceError('event_not_found', 'Calendar event not found.', 404);
  const values = readEventValues(input, existing);
  const audience = await readAudience(db, familyId, membership.id, input, existing);
  const update = db.update(familyCalendarEvents).set({
    ...values,
    audienceType: audience.audienceType,
    householdId: audience.householdId,
    updatedAt: new Date()
  }).where(and(eq(familyCalendarEvents.id, eventId), eq(familyCalendarEvents.familyId, familyId)));
  const removeMembers = db.delete(familyCalendarEventMembers).where(and(
    eq(familyCalendarEventMembers.eventId, eventId), eq(familyCalendarEventMembers.familyId, familyId)
  ));
  if (audience.memberIds.length) {
    const addMembers = db.insert(familyCalendarEventMembers).values(
      audience.memberIds.map((memberId) => ({ familyId, eventId, memberId }))
    );
    await db.batch([update, removeMembers, addMembers] as const);
  } else await db.batch([update, removeMembers] as const);
  return getCalendarEvent(db, userId, familyId, eventId);
}

export async function deleteCalendarEvent(db: Database, userId: string, familyId: string, eventId: string) {
  const { membership, event } = await requireEligibleEvent(db, userId, familyId, eventId);
  if (event.createdByMemberId !== membership.id) {
    throw new CalendarServiceError('forbidden_event_action', 'Only the event creator can delete this event.', 403);
  }
  await db.delete(familyCalendarEvents).where(and(
    eq(familyCalendarEvents.id, eventId), eq(familyCalendarEvents.familyId, familyId)
  ));
}
