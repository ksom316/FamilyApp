export const MAX_CHAT_NOTIFICATION_PREVIEW_LENGTH = 160;
const MAX_NOTIFICATION_TITLE_LENGTH = 140;

export function normalizeNotificationText(value: string, maximum: number) {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  const characters = Array.from(normalized);
  if (characters.length <= maximum) return normalized;
  return `${characters.slice(0, Math.max(0, maximum - 1)).join('').trimEnd()}…`;
}

export function familyMessageNotificationContent(senderName: string, familyName: string, message: string) {
  return {
    title: normalizeNotificationText(`${senderName} • ${familyName}`, MAX_NOTIFICATION_TITLE_LENGTH),
    body: normalizeNotificationText(message, MAX_CHAT_NOTIFICATION_PREVIEW_LENGTH)
  };
}

export function privateMessageNotificationContent(senderName: string, message: string) {
  return {
    title: normalizeNotificationText(senderName, MAX_NOTIFICATION_TITLE_LENGTH),
    body: normalizeNotificationText(message, MAX_CHAT_NOTIFICATION_PREVIEW_LENGTH)
  };
}
