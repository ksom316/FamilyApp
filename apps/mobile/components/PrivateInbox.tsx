import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, TextInput, useColorScheme, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Card } from './Card';
import { FamilyApiError, getFamilyMembers, type FamilyMember } from '../lib/families';
import {
  getPrivateConversations,
  PrivateChatApiError,
  startPrivateConversation,
  type PrivateConversationInboxItem
} from '../lib/private-chat';

const POLL_INTERVAL_MS = 5000;

type MemberRow = {
  member: FamilyMember;
  conversation: PrivateConversationInboxItem | null;
};

function activityTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.toLocaleString(undefined, date.toDateString() === today.toDateString()
    ? { hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric' });
}

function roleLabel(role: FamilyMember['role']) {
  if (role === 'owner') return 'Owner';
  if (role === 'guardian') return 'Guardian';
  return 'Member';
}

export function PrivateInbox({ familyId, currentMemberId, active }: {
  familyId: string;
  currentMemberId: string;
  active: boolean;
}) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const [members, setMembers] = useState<FamilyMember[] | null>(null);
  const [conversations, setConversations] = useState<PrivateConversationInboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [startingMemberId, setStartingMemberId] = useState<string | null>(null);
  const [appState, setAppState] = useState(AppState.currentState);
  const focusedRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const startingRef = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  const refresh = useCallback(async () => {
    if (!active || !focusedRef.current || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const [nextMembers, nextConversations] = await Promise.all([
        getFamilyMembers(familyId),
        getPrivateConversations(familyId)
      ]);
      if (!focusedRef.current) return;
      setMembers(nextMembers.filter((member) => member.id !== currentMemberId));
      setConversations(nextConversations);
      setError(null);
    } catch (caught) {
      if (focusedRef.current) {
        setError(
          caught instanceof PrivateChatApiError || caught instanceof FamilyApiError
            ? caught.message
            : 'We could not load your family members.'
        );
      }
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [active, currentMemberId, familyId]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = active;
    if (active && appState === 'active') void refresh();
    const interval = active && appState === 'active'
      ? setInterval(() => void refresh(), POLL_INTERVAL_MS)
      : undefined;
    return () => {
      focusedRef.current = false;
      if (interval) clearInterval(interval);
    };
  }, [active, appState, refresh]));

  // Every current family member (never the signed-in member themselves) merged with their
  // existing private conversation, if any — reusing the same two endpoints the old tabbed
  // inbox already called. A member with no conversation yet still gets a row; opening it
  // creates the conversation on demand rather than requiring it to exist beforehand.
  const rows = useMemo<MemberRow[]>(() => {
    if (!members) return [];
    const memberById = new Map(members.map((member) => [member.id, member]));

    // Conversations already come back ordered by recent activity — walk them in that
    // order first so the list keeps that ordering, rather than re-deriving it here.
    const seenMemberIds = new Set<string>();
    const withConversation: MemberRow[] = [];
    for (const conversation of conversations ?? []) {
      const member = memberById.get(conversation.recipient.memberId);
      if (!member) continue;
      withConversation.push({ member, conversation });
      seenMemberIds.add(member.id);
    }

    // Everyone else in the family — no conversation yet — appended alphabetically.
    const withoutConversation = members
      .filter((member) => !seenMemberIds.has(member.id))
      .map((member): MemberRow => ({ member, conversation: null }))
      .sort((a, b) => a.member.displayName.localeCompare(b.member.displayName));

    return [...withConversation, ...withoutConversation];
  }, [members, conversations]);

  const visibleRows = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return rows;
    return rows.filter((row) => row.member.displayName.toLowerCase().includes(trimmed));
  }, [rows, query]);

  const openConversation = useCallback(async (row: MemberRow) => {
    if (startingRef.current) return;
    if (row.conversation) {
      router.push(`/(family)/private-chat/${row.conversation.id}` as never);
      return;
    }
    startingRef.current = true;
    setStartingMemberId(row.member.id);
    setError(null);
    try {
      // Idempotent server-side (unique per family/member pair, upserted) — opening the
      // same member twice in a row never creates a second conversation.
      const conversation = await startPrivateConversation(familyId, row.member.id);
      router.push(`/(family)/private-chat/${conversation.id}` as never);
    } catch (caught) {
      setError(caught instanceof PrivateChatApiError ? caught.message : 'The private conversation could not open.');
    } finally {
      startingRef.current = false;
      setStartingMemberId(null);
    }
  }, [familyId]);

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <AppText variant="heading">Private conversations</AppText>
          <AppText variant="body" tone="mutedText" style={styles.detail}>Only you and the other family member can see these messages.</AppText>
        </View>
      </View>

      <TextInput
        accessibilityLabel="Search family members"
        onChangeText={setQuery}
        placeholder="Search family members…"
        placeholderTextColor={theme.mutedText}
        style={[styles.search, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
        value={query}
      />

      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="caption" tone="danger" style={styles.errorText}>{error}</AppText>
        </View>
      ) : null}

      {!members && !error ? <View style={styles.loading}><ActivityIndicator color={theme.primary} /><AppText variant="caption" tone="mutedText" style={styles.loadingText}>Loading your family…</AppText></View> : null}

      {members && visibleRows.length === 0 ? (
        <Card style={styles.emptyState}>
          <AppText variant="heading" align="center">{query.trim() ? 'No matches' : 'No other family members yet'}</AppText>
          <AppText variant="body" tone="mutedText" align="center" style={styles.emptyCopy}>
            {query.trim() ? 'Try a different name.' : 'Invite someone to your family to start messaging them.'}
          </AppText>
        </Card>
      ) : null}

      {visibleRows.length ? (
        <Card padded={false} style={styles.inbox}>
          {visibleRows.map((row, index) => {
            const starting = startingMemberId === row.member.id;
            return (
              <Pressable
                key={row.member.id}
                accessibilityRole="button"
                disabled={startingMemberId !== null}
                onPress={() => void openConversation(row)}
                style={({ pressed }) => [
                  styles.conversationRow,
                  index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 },
                  pressed && styles.pressed
                ]}
              >
                <Avatar name={row.member.displayName} imageUrl={row.member.avatar} size={48} />
                <View style={styles.conversationCopy}>
                  <View style={styles.conversationTitleRow}>
                    <AppText variant="label" numberOfLines={1} style={styles.recipientName}>{row.member.displayName}</AppText>
                    {row.conversation?.latestMessage ? (
                      <AppText variant="caption" tone="mutedText">{activityTime(row.conversation.latestMessage.createdAt)}</AppText>
                    ) : null}
                  </View>
                  <AppText variant="caption" tone="mutedText" numberOfLines={1}>
                    {row.conversation
                      ? row.conversation.latestMessage
                        ? `${row.conversation.latestMessage.senderMemberId === currentMemberId ? 'You: ' : ''}${row.conversation.latestMessage.text}`
                        : 'Private conversation ready'
                      : `${roleLabel(row.member.role)} · Start a private conversation`}
                  </AppText>
                </View>
                {starting ? <ActivityIndicator color={theme.primary} /> : row.conversation && row.conversation.unreadCount > 0 ? (
                  <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
                    <AppText variant="caption" style={{ color: theme.textOnPrimary }}>{row.conversation.unreadCount > 9 ? '9+' : row.conversation.unreadCount}</AppText>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 300 },
  headingRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between' },
  headingCopy: { flex: 1, minWidth: 240 },
  detail: { marginTop: spacing.xs },
  search: { borderRadius: radius.md, borderWidth: 1, fontSize: 16, marginTop: spacing.md, minHeight: 46, paddingHorizontal: spacing.md },
  errorBanner: { alignItems: 'center', borderRadius: radius.md, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, paddingHorizontal: spacing.md },
  errorText: { flex: 1 },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xxl },
  loadingText: { marginTop: spacing.md },
  emptyState: { alignItems: 'center', marginTop: spacing.lg, paddingVertical: spacing.xxl },
  emptyCopy: { marginTop: spacing.sm },
  inbox: { marginTop: spacing.lg, overflow: 'hidden' },
  conversationRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, minHeight: 76, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  conversationCopy: { flex: 1, minWidth: 0 },
  conversationTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  recipientName: { flex: 1 },
  unreadBadge: { alignItems: 'center', borderRadius: radius.pill, justifyContent: 'center', minHeight: 26, minWidth: 26, paddingHorizontal: spacing.xs },
  pressed: { opacity: 0.72 }
});
