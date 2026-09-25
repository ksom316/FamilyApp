import { and, desc, eq } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { familyEmergencyAcknowledgements, familyEmergencyIncidents, familyMembers, users } from '@familyapp/db/schema';

import { requireFamilyMembership } from './family-service';
import { createNotifications, familyMemberIds, recipientsExcluding } from './notifications-service';

export const EMERGENCY_TYPES = ['need_help', 'medical', 'safety_concern', 'other'] as const;
export type EmergencyType = (typeof EMERGENCY_TYPES)[number];

export const RESPONSE_STATUSES = ['seen', 'responding'] as const;
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

const EMERGENCY_TYPE_LABELS: Record<EmergencyType, string> = {
  need_help: 'Need help',
  medical: 'Medical',
  safety_concern: 'Safety concern',
  other: 'Other'
};

const ACTIVE_INCIDENTS_LIMIT = 50;
const RESOLVED_INCIDENTS_LIMIT = 30;
const MAX_MESSAGE_LENGTH = 300;

export type EmergencyErrorCode =
  | 'invalid_type'
  | 'invalid_message'
  | 'invalid_response'
  | 'incident_not_found'
  | 'incident_resolved'
  | 'already_acknowledged'
  | 'forbidden_resolve';

export class EmergencyServiceError extends Error {
  constructor(public readonly code: EmergencyErrorCode, message: string, public readonly status = 400) {
    super(message);
    this.name = 'EmergencyServiceError';
  }
}

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new EmergencyServiceError('incident_not_found', 'That emergency could not be found.', 404);
  }
}

function readEmergencyType(value: unknown): EmergencyType {
  if (typeof value !== 'string' || !EMERGENCY_TYPES.includes(value as EmergencyType)) {
    throw new EmergencyServiceError('invalid_type', 'Choose a valid emergency type.');
  }
  return value as EmergencyType;
}

function readMessage(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new EmergencyServiceError('invalid_message', 'That message is not valid.');
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new EmergencyServiceError('invalid_message', `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`);
  }
  return trimmed;
}

function readResponseStatus(value: unknown): ResponseStatus {
  if (value === undefined || value === null) return 'seen';
  if (typeof value !== 'string' || !RESPONSE_STATUSES.includes(value as ResponseStatus)) {
    throw new EmergencyServiceError('invalid_response', 'Choose a valid response.');
  }
  return value as ResponseStatus;
}

const incidentSelection = {
  id: familyEmergencyIncidents.id,
  emergencyType: familyEmergencyIncidents.emergencyType,
  message: familyEmergencyIncidents.message,
  status: familyEmergencyIncidents.status,
  createdAt: familyEmergencyIncidents.createdAt,
  resolvedAt: familyEmergencyIncidents.resolvedAt,
  resolvedByMemberId: familyEmergencyIncidents.resolvedByMemberId,
  createdBy: {
    memberId: familyMembers.id,
    displayName: users.name,
    avatar: users.image
  }
};

function selectIncidents(db: Database) {
  return db
    .select(incidentSelection)
    .from(familyEmergencyIncidents)
    .innerJoin(
      familyMembers,
      and(eq(familyEmergencyIncidents.createdByMemberId, familyMembers.id), eq(familyEmergencyIncidents.familyId, familyMembers.familyId))
    )
    .innerJoin(users, eq(familyMembers.userId, users.id));
}

const resolverSelection = {
  memberId: familyMembers.id,
  displayName: users.name
};

async function selectResolver(db: Database, familyId: string, resolvedByMemberId: string | null) {
  if (!resolvedByMemberId) return null;
  const [resolver] = await db
    .select(resolverSelection)
    .from(familyMembers)
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(and(eq(familyMembers.id, resolvedByMemberId), eq(familyMembers.familyId, familyId)))
    .limit(1);
  return resolver ?? null;
}

const ackSelection = {
  id: familyEmergencyAcknowledgements.id,
  responseStatus: familyEmergencyAcknowledgements.responseStatus,
  createdAt: familyEmergencyAcknowledgements.createdAt,
  member: {
    memberId: familyMembers.id,
    displayName: users.name,
    avatar: users.image
  }
};

async function selectAcknowledgements(db: Database, incidentId: string) {
  return db
    .select(ackSelection)
    .from(familyEmergencyAcknowledgements)
    .innerJoin(
      familyMembers,
      and(eq(familyEmergencyAcknowledgements.memberId, familyMembers.id), eq(familyEmergencyAcknowledgements.familyId, familyMembers.familyId))
    )
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(eq(familyEmergencyAcknowledgements.incidentId, incidentId))
    .orderBy(familyEmergencyAcknowledgements.createdAt);
}

export async function listEmergencies(db: Database, userId: string, familyId: string) {
  await requireFamilyMembership(db, userId, familyId);

  const active = await selectIncidents(db)
    .where(and(eq(familyEmergencyIncidents.familyId, familyId), eq(familyEmergencyIncidents.status, 'active')))
    .orderBy(desc(familyEmergencyIncidents.createdAt))
    .limit(ACTIVE_INCIDENTS_LIMIT);

  const resolved = await selectIncidents(db)
    .where(and(eq(familyEmergencyIncidents.familyId, familyId), eq(familyEmergencyIncidents.status, 'resolved')))
    .orderBy(desc(familyEmergencyIncidents.resolvedAt))
    .limit(RESOLVED_INCIDENTS_LIMIT);

  const [activeWithAcks, resolvedWithResolvers] = await Promise.all([
    Promise.all(active.map(async (incident) => ({ ...incident, acknowledgements: await selectAcknowledgements(db, incident.id) }))),
    Promise.all(resolved.map(async (incident) => ({
      ...incident,
      resolvedBy: await selectResolver(db, familyId, incident.resolvedByMemberId),
      acknowledgements: await selectAcknowledgements(db, incident.id)
    })))
  ]);

  return { active: activeWithAcks, resolved: resolvedWithResolvers };
}

async function loadIncidentRow(db: Database, familyId: string, incidentId: string) {
  const [row] = await db
    .select({
      id: familyEmergencyIncidents.id,
      status: familyEmergencyIncidents.status,
      createdByMemberId: familyEmergencyIncidents.createdByMemberId,
      resolvedByMemberId: familyEmergencyIncidents.resolvedByMemberId
    })
    .from(familyEmergencyIncidents)
    .where(and(eq(familyEmergencyIncidents.id, incidentId), eq(familyEmergencyIncidents.familyId, familyId)))
    .limit(1);
  return row ?? null;
}

async function loadIncidentDetail(db: Database, familyId: string, incidentId: string) {
  const [incident] = await selectIncidents(db)
    .where(and(eq(familyEmergencyIncidents.id, incidentId), eq(familyEmergencyIncidents.familyId, familyId)))
    .limit(1);
  if (!incident) throw new EmergencyServiceError('incident_not_found', 'That emergency could not be found.', 404);
  const resolvedBy = await selectResolver(db, familyId, incident.resolvedByMemberId);
  const acknowledgements = await selectAcknowledgements(db, incidentId);
  return { ...incident, resolvedBy, acknowledgements };
}

export async function getEmergency(db: Database, userId: string, familyId: string, incidentId: string) {
  assertUuid(incidentId);
  await requireFamilyMembership(db, userId, familyId);
  return loadIncidentDetail(db, familyId, incidentId);
}

type CreateEmergencyInput = { emergencyType: unknown; message?: unknown };

// Actor identity always comes from the authenticated session's own membership row — a
// member can only ever report an emergency as themselves.
export async function createEmergency(db: Database, userId: string, familyId: string, input: CreateEmergencyInput) {
  const membership = await requireFamilyMembership(db, userId, familyId);
  const emergencyType = readEmergencyType(input.emergencyType);
  const message = readMessage(input.message);

  const [inserted] = await db
    .insert(familyEmergencyIncidents)
    .values({ familyId, createdByMemberId: membership.id, emergencyType, message })
    .returning({ id: familyEmergencyIncidents.id });

  const incident = await loadIncidentDetail(db, familyId, inserted.id);
  const recipientIds = await familyMemberIds(db, familyId);
  await createNotifications(db, recipientsExcluding(recipientIds, membership.id).map((recipientMemberId) => ({
    familyId,
    recipientMemberId,
    actorMemberId: membership.id,
    type: 'emergency_reported',
    title: `${incident.createdBy.displayName} reported a ${EMERGENCY_TYPE_LABELS[emergencyType]} emergency`,
    message: incident.message,
    entityType: 'emergency_incident',
    entityId: inserted.id,
    route: `/(family)/emergency/${inserted.id}`
  })));

  return incident;
}

type AcknowledgeInput = { responseStatus?: unknown };

export async function acknowledgeEmergency(db: Database, userId: string, familyId: string, incidentId: string, input: AcknowledgeInput) {
  assertUuid(incidentId);
  const membership = await requireFamilyMembership(db, userId, familyId);
  const responseStatus = readResponseStatus(input.responseStatus);

  const incident = await loadIncidentRow(db, familyId, incidentId);
  if (!incident) throw new EmergencyServiceError('incident_not_found', 'That emergency could not be found.', 404);
  if (incident.status === 'resolved') throw new EmergencyServiceError('incident_resolved', 'This emergency has already been resolved.', 409);

  const existing = await db
    .select({ id: familyEmergencyAcknowledgements.id })
    .from(familyEmergencyAcknowledgements)
    .where(and(eq(familyEmergencyAcknowledgements.incidentId, incidentId), eq(familyEmergencyAcknowledgements.memberId, membership.id)))
    .limit(1);
  if (existing[0]) throw new EmergencyServiceError('already_acknowledged', 'You already responded to this emergency.', 409);

  await db.insert(familyEmergencyAcknowledgements).values({ familyId, incidentId, memberId: membership.id, responseStatus });
  const updated = await loadIncidentDetail(db, familyId, incidentId);

  const actorName = updated.acknowledgements.find((ack) => ack.member.memberId === membership.id)?.member.displayName ?? 'A family member';
  const recipientIds = await familyMemberIds(db, familyId);
  await createNotifications(db, recipientsExcluding(recipientIds, membership.id).map((recipientMemberId) => ({
    familyId,
    recipientMemberId,
    actorMemberId: membership.id,
    type: 'emergency_acknowledged',
    title: responseStatus === 'responding' ? `${actorName} is responding to an emergency` : `${actorName} has seen the emergency`,
    entityType: 'emergency_incident',
    entityId: incidentId,
    route: `/(family)/emergency/${incidentId}`
  })));

  return updated;
}

// Only the creator, or an owner/guardian, may resolve — enforced here, not just hidden in
// the UI. Resolving never deletes the incident or its acknowledgements; it only sets the
// resolution fields, which stay visible in history from then on.
export async function resolveEmergency(db: Database, userId: string, familyId: string, incidentId: string) {
  assertUuid(incidentId);
  const membership = await requireFamilyMembership(db, userId, familyId);

  const incident = await loadIncidentRow(db, familyId, incidentId);
  if (!incident) throw new EmergencyServiceError('incident_not_found', 'That emergency could not be found.', 404);
  if (incident.status === 'resolved') return loadIncidentDetail(db, familyId, incidentId);

  const canResolve = incident.createdByMemberId === membership.id || membership.role === 'owner' || membership.role === 'guardian';
  if (!canResolve) throw new EmergencyServiceError('forbidden_resolve', 'Only the person who reported this, or a family owner/guardian, can resolve it.', 403);

  await db
    .update(familyEmergencyIncidents)
    .set({ status: 'resolved', resolvedAt: new Date(), resolvedByMemberId: membership.id })
    .where(and(eq(familyEmergencyIncidents.id, incidentId), eq(familyEmergencyIncidents.familyId, familyId)));

  const updated = await loadIncidentDetail(db, familyId, incidentId);
  const resolverName = updated.resolvedBy?.displayName ?? 'A family member';
  const recipientIds = await familyMemberIds(db, familyId);
  await createNotifications(db, recipientsExcluding(recipientIds, membership.id).map((recipientMemberId) => ({
    familyId,
    recipientMemberId,
    actorMemberId: membership.id,
    type: 'emergency_resolved',
    title: `${resolverName} resolved the ${EMERGENCY_TYPE_LABELS[updated.emergencyType as EmergencyType]} emergency`,
    entityType: 'emergency_incident',
    entityId: incidentId,
    route: `/(family)/emergency/${incidentId}`
  })));

  return updated;
}
