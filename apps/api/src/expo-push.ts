import { eq, inArray } from 'drizzle-orm';

import type { Database } from '@familyapp/db';
import { familyMembers, pushDevices } from '@familyapp/db/schema';

import { isExpoPushToken } from './push-devices-service';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;

const PUSH_NOTIFICATION_TYPES = new Set([
  'emergency_reported',
  'come_find_me_started',
  'family_message',
  'private_message',
  'task_assigned',
  'task_due_soon',
  'task_overdue',
  'calendar_event_created',
  'calendar_event_today',
  'poll_created',
  'poll_closing_soon',
  'poll_closed',
  'capsule_unlocked',
  'member_left'
]);

const CRITICAL_TYPES = new Set(['emergency_reported', 'come_find_me_started']);

export type PushNotificationRecord = {
  id: string;
  familyId: string;
  recipientMemberId: string;
  type: string;
  title: string;
  message: string | null;
  entityType: string | null;
  entityId: string | null;
  route: string | null;
};

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'default' | 'high';
  channelId: 'familyapp-default' | 'familyapp-urgent';
  data: Record<string, string | null>;
};

type ExpoTicket = { status: 'ok'; id: string } | {
  status: 'error';
  message?: string;
  details?: { error?: string };
};

export function shouldSendNativePush(type: string) {
  return PUSH_NOTIFICATION_TYPES.has(type);
}

export function buildSafePushMessage(notification: PushNotificationRecord, token: string): ExpoMessage | null {
  if (!shouldSendNativePush(notification.type) || !isExpoPushToken(token) || !notification.route) return null;

  let title = notification.title;
  let body = notification.message ?? 'Open FamilyApp to view it.';
  if (notification.type === 'emergency_reported') {
    title = 'Emergency alert';
    body = 'A family emergency alert needs your attention. Open FamilyApp for details.';
  } else if (notification.type === 'come_find_me_started') {
    title = 'Come Find Me request';
    body = 'A family member needs you to open Come Find Me.';
  } else if (notification.type === 'family_message') {
    title = 'New family message';
    body = 'Open FamilyApp to read the family chat.';
  } else if (notification.type === 'private_message') {
    title = 'New private message';
    body = 'Open FamilyApp to read your private conversation.';
  } else if (notification.type === 'capsule_unlocked') {
    title = 'A time capsule is ready';
    body = 'Open FamilyApp to view the unlocked capsule.';
  }

  const critical = CRITICAL_TYPES.has(notification.type);
  return {
    to: token,
    title: title.slice(0, 140),
    body: body.slice(0, 300),
    sound: 'default',
    priority: critical ? 'high' : 'default',
    channelId: critical ? 'familyapp-urgent' : 'familyapp-default',
    data: {
      kind: 'familyapp_notification',
      notificationId: notification.id,
      familyId: notification.familyId,
      type: notification.type,
      route: notification.route,
      entityType: notification.entityType,
      entityId: notification.entityId
    }
  };
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function shortTokenFingerprint(token: string) {
  return token.length > 12 ? `${token.slice(0, 6)}…${token.slice(-4)}` : '[redacted]';
}

async function deleteRegistrations(db: Database, ids: string[]) {
  if (ids.length) await db.delete(pushDevices).where(inArray(pushDevices.id, [...new Set(ids)]));
}

export async function deliverNativePushes(db: Database, notifications: PushNotificationRecord[]) {
  const eligible = notifications.filter((notification) => shouldSendNativePush(notification.type));
  if (!eligible.length) return;

  try {
    const memberIds = [...new Set(eligible.map((notification) => notification.recipientMemberId))];
    const registrations = await db
      .select({ id: pushDevices.id, token: pushDevices.expoPushToken, memberId: familyMembers.id })
      .from(familyMembers)
      .innerJoin(pushDevices, eq(familyMembers.userId, pushDevices.userId))
      .where(inArray(familyMembers.id, memberIds));

    const invalidIds = registrations.filter((registration) => !isExpoPushToken(registration.token)).map((registration) => registration.id);
    await deleteRegistrations(db, invalidIds);

    const deliveries = eligible.flatMap((notification) => registrations
      .filter((registration) => registration.memberId === notification.recipientMemberId && isExpoPushToken(registration.token))
      .map((registration) => ({
        registration,
        message: buildSafePushMessage(notification, registration.token)
      }))
      .filter((delivery): delivery is { registration: typeof registrations[number]; message: ExpoMessage } => Boolean(delivery.message)));

    for (const batch of chunks(deliveries, EXPO_BATCH_SIZE)) {
      let response: Response;
      try {
        response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(batch.map((delivery) => delivery.message))
        });
      } catch (error) {
        console.error('Expo push request failed', error);
        continue;
      }
      if (!response.ok) {
        console.error(`Expo push request failed with status ${response.status}`);
        continue;
      }

      const payload = await response.json().catch(() => null) as { data?: ExpoTicket[] } | null;
      const tickets = Array.isArray(payload?.data) ? payload.data : [];
      const permanentlyInvalidIds: string[] = [];
      tickets.forEach((ticket, index) => {
        if (ticket.status !== 'error') return;
        const registration = batch[index]?.registration;
        if (!registration) return;
        if (ticket.details?.error === 'DeviceNotRegistered') permanentlyInvalidIds.push(registration.id);
        else console.warn(`Expo rejected push for ${shortTokenFingerprint(registration.token)}: ${ticket.details?.error ?? 'unknown error'}`);
      });
      await deleteRegistrations(db, permanentlyInvalidIds);
    }
  } catch (error) {
    // Push is deliberately best effort. The in-app notification already exists and remains
    // authoritative even if token lookup, Expo, or cleanup is temporarily unavailable.
    console.error('Native push delivery failed', error);
  }
}
