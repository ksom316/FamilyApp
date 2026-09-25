import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Card } from './Card';
import { FamilyApiError, getFamilyMembers, type FamilyMember } from '../lib/families';
import {
  getPrivateConversations,
  PrivateChatApiError,
  startPrivateConversation,
  type PrivateConversationInboxItem
} from '../lib/private-chat';

const POLL_INTERVAL_MS = 5000;

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
  const [conversations, setConversations] = useState<PrivateConversationInboxItem[] | null>(null);
  const [members, setMembers] = useState<FamilyMember[] | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setConversations(await getPrivateConversations(familyId));
      setError(null);
    } catch (caught) {
      if (focusedRef.current) {
        setError(caught instanceof PrivateChatApiError ? caught.message : 'We could not load private conversations.');
      }
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [active, familyId]);

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

  const loadMembers = useCallback(async () => {
    setError(null);
    try {
      setMembers((await getFamilyMembers(familyId)).filter((member) => member.id !== currentMemberId));
    } catch (caught) {
      setError(caught instanceof FamilyApiError ? caught.message : 'We could not load your family members.');
      setMembers([]);
    }
  }, [currentMemberId, familyId]);

  const showNewMessage = useCallback(() => {
    setShowMembers(true);
    if (members === null) void loadMembers();
  }, [loadMembers, members]);

  const openConversation = useCallback(async (memberId: string) => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStartingMemberId(memberId);
    setError(null);
    try {
      const conversation = await startPrivateConversation(familyId, memberId);
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
        <Button label={showMembers ? 'Close' : 'New message'} variant="secondary" onPress={() => showMembers ? setShowMembers(false) : void showNewMessage()} />
      </View>

      {showMembers ? (
        <Card style={styles.memberPicker}>
          <AppText variant="label">Choose a family member</AppText>
          {!members ? <ActivityIndicator color={theme.primary} style={styles.memberLoading} /> : null}
          {members?.length === 0 ? <AppText variant="body" tone="mutedText" style={styles.emptyCopy}>No other family members are available.</AppText> : null}
          {members?.map((member) => (
            <Pressable
              key={member.id}
              accessibilityRole="button"
              disabled={startingMemberId !== null}
              onPress={() => void openConversation(member.id)}
              style={({ pressed }) => [styles.memberRow, { borderColor: theme.border }, pressed && styles.pressed]}
            >
              <Avatar name={member.displayName} imageUrl={member.avatar} size={44} />
              <View style={styles.memberCopy}>
                <AppText variant="label">{member.displayName}</AppText>
                <AppText variant="caption" tone="mutedText">{roleLabel(member.role)}</AppText>
              </View>
              {startingMemberId === member.id ? <ActivityIndicator color={theme.primary} /> : <AppText variant="label" tone="primary">Message</AppText>}
            </Pressable>
          ))}
        </Card>
      ) : null}

      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="caption" tone="danger" style={styles.errorText}>{error}</AppText>
          <Button
            label="Try again"
            variant="quiet"
            onPress={() => {
              if (showMembers && members?.length === 0) {
                setMembers(null);
                void loadMembers();
              } else void refresh();
            }}
          />
        </View>
      ) : null}

      {!conversations && !error ? <View style={styles.loading}><ActivityIndicator color={theme.primary} /><AppText variant="caption" tone="mutedText" style={styles.loadingText}>Opening your private inbox…</AppText></View> : null}
      {conversations?.length === 0 ? (
        <Card style={styles.emptyState}>
          <AppText variant="heading" align="center">No private conversations yet</AppText>
          <AppText variant="body" tone="mutedText" align="center" style={styles.emptyCopy}>Start a message with someone in this family.</AppText>
          <Button label="New message" onPress={() => void showNewMessage()} style={styles.emptyAction} />
        </Card>
      ) : null}
      {conversations?.length ? (
        <Card padded={false} style={styles.inbox}>
          {conversations.map((conversation, index) => (
            <Pressable
              key={conversation.id}
              accessibilityRole="button"
              onPress={() => router.push(`/(family)/private-chat/${conversation.id}` as never)}
              style={({ pressed }) => [
                styles.conversationRow,
                index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 },
                pressed && styles.pressed
              ]}
            >
              <Avatar name={conversation.recipient.displayName} imageUrl={conversation.recipient.avatar} size={48} />
              <View style={styles.conversationCopy}>
                <View style={styles.conversationTitleRow}>
                  <AppText variant="label" numberOfLines={1} style={styles.recipientName}>{conversation.recipient.displayName}</AppText>
                  <AppText variant="caption" tone="mutedText">
                    {activityTime(conversation.latestMessage?.createdAt ?? conversation.createdAt)}
                  </AppText>
                </View>
                <AppText variant="caption" tone="mutedText" numberOfLines={1}>
                  {conversation.latestMessage
                    ? `${conversation.latestMessage.senderMemberId === currentMemberId ? 'You: ' : ''}${conversation.latestMessage.text}`
                    : 'Private conversation ready'}
                </AppText>
              </View>
              {conversation.unreadCount > 0 ? (
                <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
                  <AppText variant="caption" style={{ color: theme.textOnPrimary }}>{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</AppText>
                </View>
              ) : null}
            </Pressable>
          ))}
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
  memberPicker: { gap: spacing.sm, marginTop: spacing.lg },
  memberLoading: { marginVertical: spacing.lg },
  memberRow: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 68, paddingTop: spacing.sm },
  memberCopy: { flex: 1, minWidth: 0 },
  errorBanner: { alignItems: 'center', borderRadius: radius.md, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, paddingHorizontal: spacing.md },
  errorText: { flex: 1 },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xxl },
  loadingText: { marginTop: spacing.md },
  emptyState: { alignItems: 'center', marginTop: spacing.lg, paddingVertical: spacing.xxl },
  emptyCopy: { marginTop: spacing.sm },
  emptyAction: { marginTop: spacing.lg },
  inbox: { marginTop: spacing.lg, overflow: 'hidden' },
  conversationRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, minHeight: 76, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  conversationCopy: { flex: 1, minWidth: 0 },
  conversationTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  recipientName: { flex: 1 },
  unreadBadge: { alignItems: 'center', borderRadius: radius.pill, justifyContent: 'center', minHeight: 26, minWidth: 26, paddingHorizontal: spacing.xs },
  pressed: { opacity: 0.72 }
});
