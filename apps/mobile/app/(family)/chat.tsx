import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { PrivateInbox } from '../../components/PrivateInbox';
import { Screen } from '../../components/Screen';
import {
  ChatApiError,
  getFamilyMessages,
  getFamilyMessagesUnreadCount,
  type FamilyMessage
} from '../../lib/chat';
import { useCurrentFamily } from '../../lib/family-context';

const POLL_INTERVAL_MS = 5000;

function activityTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.toLocaleString(undefined, date.toDateString() === today.toDateString()
    ? { hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric' });
}

// The Chat hub. Opening it must never mark Family Chat as read — it only ever reads a
// cheap preview (latest message + unread count) via the same endpoints the Family Chat
// and Notifications badge already use; the read position only advances once the user
// actually opens /(family)/chat/family (see that screen).
export default function ChatHubScreen() {
  const family = useCurrentFamily();
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const [latestMessage, setLatestMessage] = useState<FamilyMessage | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [appState, setAppState] = useState(AppState.currentState);
  const [focused, setFocused] = useState(false);
  const focusedRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  const refresh = useCallback(async () => {
    if (!focusedRef.current || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const [messages, count] = await Promise.all([
        getFamilyMessages(family.familyId),
        getFamilyMessagesUnreadCount(family.familyId)
      ]);
      if (!focusedRef.current) return;
      setLatestMessage(messages[messages.length - 1] ?? null);
      setUnreadCount(count);
      setError(null);
    } catch (caught) {
      if (focusedRef.current) setError(caught instanceof ChatApiError ? caught.message : 'We could not load Family Chat.');
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [family.familyId]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    setFocused(true);
    if (appState === 'active') void refresh();
    const interval = appState === 'active' ? setInterval(() => void refresh(), POLL_INTERVAL_MS) : undefined;
    return () => {
      focusedRef.current = false;
      setFocused(false);
      if (interval) clearInterval(interval);
    };
  }, [appState, refresh]));

  return (
    <Screen scroll maxWidth={1080} contentStyle={styles.content}>
      <View style={styles.header}>
        <AppText variant="eyebrow" tone="primary">{family.familyName}</AppText>
        <AppText variant={isDesktop ? 'display' : 'title'} style={styles.title}>Chat</AppText>
        <AppText variant="body" tone="mutedText" style={styles.subtitle}>
          The family conversation and your private messages, in one place.
        </AppText>
      </View>

      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="caption" tone="danger">{error}</AppText>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/(family)/chat/family' as never)}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Card style={styles.familyRow}>
          <Avatar name={family.familyName} size={48} />
          <View style={styles.familyCopy}>
            <View style={styles.familyTitleRow}>
              <AppText variant="label" numberOfLines={1} style={styles.familyName}>Family Chat</AppText>
              {latestMessage ? <AppText variant="caption" tone="mutedText">{activityTime(latestMessage.createdAt)}</AppText> : null}
            </View>
            <AppText variant="caption" tone="mutedText" numberOfLines={1}>
              {latestMessage
                ? `${latestMessage.senderMemberId === family.id ? 'You: ' : `${latestMessage.sender.displayName}: `}${latestMessage.text}`
                : 'Say hello to your family'}
            </AppText>
          </View>
          {unreadCount > 0 ? (
            <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
              <AppText variant="caption" style={{ color: theme.textOnPrimary }}>{unreadCount > 9 ? '9+' : unreadCount}</AppText>
            </View>
          ) : null}
        </Card>
      </Pressable>

      <PrivateInbox familyId={family.familyId} currentMemberId={family.id} active={focused} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.lg },
  header: { maxWidth: 640 },
  title: { marginTop: spacing.xs },
  subtitle: { marginTop: spacing.sm },
  errorBanner: { borderRadius: radius.md, marginTop: spacing.md, padding: spacing.md },
  pressed: { opacity: 0.86 },
  familyRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl, padding: spacing.lg },
  familyCopy: { flex: 1, minWidth: 0 },
  familyTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  familyName: { flex: 1 },
  unreadBadge: { alignItems: 'center', borderRadius: radius.pill, justifyContent: 'center', minHeight: 26, minWidth: 26, paddingHorizontal: spacing.xs }
});
