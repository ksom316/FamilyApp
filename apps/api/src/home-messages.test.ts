import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildHomeMessagesSummary,
  HOME_MESSAGE_PREVIEW_LENGTH,
  HOME_MESSAGES_ROUTE,
  isCompactHomeMessages,
  type HomePrivateConversation
} from '../../mobile/lib/home-messages';

const MEMBER_ID = '11111111-1111-4111-8111-111111111111';

function conversation(overrides: Partial<HomePrivateConversation> = {}): HomePrivateConversation {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    familyId: '33333333-3333-4333-8333-333333333333',
    createdAt: '2026-09-27T10:00:00.000Z',
    lastMessageAt: '2026-09-27T11:00:00.000Z',
    recipient: { displayName: 'Kwaku' },
    latestMessage: { text: 'Are we meeting today?', senderMemberId: '44444444-4444-4444-8444-444444444444' },
    unreadCount: 2,
    ...overrides
  };
}

describe('Home Messages summary', () => {
  it('reports an all-caught-up state at zero', () => {
    expect(buildHomeMessagesSummary('Our Family', MEMBER_ID, 0, [])).toEqual({ familyUnreadCount: 0, privateUnreadCount: 0, totalUnreadCount: 0, entries: [] });
    expect(HOME_MESSAGES_ROUTE).toBe('/(family)/chat');
  });

  it('summarizes family chat with its existing route', () => {
    const result = buildHomeMessagesSummary('Our Family', MEMBER_ID, 3, []);
    expect(result.totalUnreadCount).toBe(3);
    expect(result.entries[0]).toMatchObject({ title: 'Our Family', unreadCount: 3, route: '/(family)/chat/family' });
  });

  it('summarizes private chat with sender context and its conversation route', () => {
    const result = buildHomeMessagesSummary('Our Family', MEMBER_ID, 0, [conversation()]);
    expect(result.privateUnreadCount).toBe(2);
    expect(result.entries[0]).toMatchObject({ title: 'Kwaku', preview: 'Are we meeting today?', route: '/(family)/private-chat/22222222-2222-4222-8222-222222222222' });
  });

  it('combines family and private unread totals without marking either read', () => {
    const result = buildHomeMessagesSummary('Our Family', MEMBER_ID, 3, [conversation()]);
    expect(result.totalUnreadCount).toBe(5);
    expect(result.entries).toHaveLength(2);
    expect(conversation().unreadCount).toBe(2);
  });

  it('normalizes and safely truncates a long sender preview', () => {
    const long = `First line\n ${'message '.repeat(30)}`;
    const result = buildHomeMessagesSummary('Our Family', MEMBER_ID, 0, [conversation({ latestMessage: { ...conversation().latestMessage!, text: long } })]);
    expect(Array.from(result.entries[0]?.preview ?? '')).toHaveLength(HOME_MESSAGE_PREVIEW_LENGTH);
    expect(result.entries[0]?.preview).not.toMatch(/\n|\s{2,}/);
    expect(result.entries[0]?.preview.endsWith('…')).toBe(true);
  });

  it('reflects a read-state refresh and ignores conversations from the supplied family dataset that have no unread state', () => {
    expect(buildHomeMessagesSummary('Our Family', MEMBER_ID, 0, [conversation()]).totalUnreadCount).toBe(2);
    expect(buildHomeMessagesSummary('Our Family', MEMBER_ID, 0, [conversation({ unreadCount: 0 })]).totalUnreadCount).toBe(0);
  });

  it('uses a stacked layout only on narrow screens', () => {
    expect(isCompactHomeMessages(390)).toBe(true);
    expect(isCompactHomeMessages(619)).toBe(true);
    expect(isCompactHomeMessages(620)).toBe(false);
    expect(isCompactHomeMessages(1200)).toBe(false);
  });

  it('keeps the decorative family artwork beneath a transparent failed-photo fallback', () => {
    const source = readFileSync(new URL('../../mobile/app/(family)/home.tsx', import.meta.url), 'utf8');
    expect(source).toContain('<View style={[styles.artOrb');
    expect(source).toContain('<Avatar name={familyName}');
    expect(source).toMatch(/<AuthorizedImage[\s\S]*transparentFallback/);
    expect(source.indexOf('<Avatar name={familyName}')).toBeLessThan(source.indexOf('<AuthorizedImage'));
  });
});
