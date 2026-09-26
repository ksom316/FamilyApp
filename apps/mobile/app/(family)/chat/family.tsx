import { useAppTheme } from '../../../lib/app-theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { radius, spacing } from '@familyapp/config';

import { AppText } from '../../../components/AppText';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { MemberAvatar } from '../../../components/MemberAvatar';
import { FadeInView } from '../../../components/Motion';
import { Screen } from '../../../components/Screen';
import {
  ChatApiError,
  getFamilyMessages,
  markFamilyMessagesRead,
  MAX_MESSAGE_LENGTH,
  sendFamilyMessage,
  type FamilyMessage
} from '../../../lib/chat';
import { useCurrentFamily } from '../../../lib/family-context';
import { requestAttentionRefresh } from '../../../lib/navigation-attention';

const POLL_INTERVAL_MS = 5000;
const MAX_VISIBLE_MESSAGES = 100;

function mergeMessages(current: FamilyMessage[] | null, incoming: FamilyMessage[]) {
  const byId = new Map((current ?? []).map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()]
    .sort((left, right) => {
      const dateDifference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      return dateDifference || left.id.localeCompare(right.id);
    })
    .slice(-MAX_VISIBLE_MESSAGES);
}

function roleLabel(role: FamilyMessage['sender']['role']) {
  if (role === 'owner') return 'Owner';
  if (role === 'guardian') return 'Guardian';
  return 'Member';
}

function messageTime(createdAt: string) {
  const date = new Date(createdAt);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return date.toLocaleString(undefined, sameDay
    ? { hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function FamilyChatScreen() {
  const family = useCurrentFamily();
  const { colors: theme } = useAppTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const [messages, setMessages] = useState<FamilyMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [animatedMessageId, setAnimatedMessageId] = useState<string | null>(null);
  const [appState, setAppState] = useState(AppState.currentState);
  const focusedRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const sendingRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const scrollRef = useRef<ScrollView>(null);
  // Tracks the newest message id we have already told the server we've read, so a mark-read
  // request only ever fires when there is genuinely a newer message — never on every 5s poll.
  const lastMarkedReadIdRef = useRef<string | null>(null);
  const knownMessageIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  const refreshMessages = useCallback(async () => {
    if (!focusedRef.current || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const latest = await getFamilyMessages(family.familyId);
      if (!focusedRef.current) return;
      const knownIds = knownMessageIdsRef.current;
      if (knownIds) {
        const newestIncoming = [...latest].reverse().find((message) => !knownIds.has(message.id));
        if (newestIncoming) setAnimatedMessageId(newestIncoming.id);
      }
      knownMessageIdsRef.current = new Set([...(knownIds ?? []), ...latest.map((message) => message.id)]);
      setMessages((current) => mergeMessages(current, latest));
      setLoadError(null);

      const newestMessage = latest[latest.length - 1];
      if (newestMessage && newestMessage.id !== lastMarkedReadIdRef.current) {
        const messageId = newestMessage.id;
        lastMarkedReadIdRef.current = messageId;
        try {
          // Awaited (not fire-and-forget): the sidebar refresh below must only run after
          // the server has actually advanced this member's read position, otherwise the
          // sidebar could re-fetch the still-stale count and look like nothing happened.
          await markFamilyMessagesRead(family.familyId, messageId);
          requestAttentionRefresh();
        } catch {
          lastMarkedReadIdRef.current = null;
        }
      }
    } catch (error) {
      if (focusedRef.current) {
        setLoadError(error instanceof ChatApiError ? error.message : 'We could not refresh the conversation.');
      }
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [family.familyId]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    if (appState === 'active') void refreshMessages();
    const interval = appState === 'active'
      ? setInterval(() => void refreshMessages(), POLL_INTERVAL_MS)
      : undefined;

    return () => {
      focusedRef.current = false;
      if (interval) clearInterval(interval);
    };
  }, [appState, refreshMessages]));

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || sendingRef.current) return;

    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      const message = await sendFamilyMessage(family.familyId, text);
      shouldAutoScrollRef.current = true;
      setMessages((current) => mergeMessages(current, [message]));
      knownMessageIdsRef.current?.add(message.id);
      setAnimatedMessageId(message.id);
      setDraft('');
    } catch (error) {
      setSendError(error instanceof ChatApiError ? error.message : 'Your message could not be sent.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [draft, family.familyId]);

  const handleKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const nativeEvent = event.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean };
    if (Platform.OS === 'web' && nativeEvent.key === 'Enter' && !nativeEvent.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    shouldAutoScrollRef.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 80;
  };

  const trimmedDraft = draft.trim();

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen maxWidth={1080} contentStyle={styles.content}>
        <View style={[styles.header, !isDesktop && styles.mobileHeader]}>
          <View style={styles.headerCopy}>
            <AppText accessibilityRole="link" onPress={() => router.replace('/(family)/chat' as never)} variant="label" tone="primary">‹ Back to Chat</AppText>
            <View style={styles.recipientHeader}>
              <Avatar name={family.familyName} size={48} />
              <View style={styles.recipientCopy}>
                <AppText variant={isDesktop ? 'title' : 'heading'}>Family Chat</AppText>
                <AppText variant="caption" tone="mutedText">{family.familyName} · shared with everyone in the family</AppText>
              </View>
            </View>
          </View>
        </View>

        <Card padded={false} style={styles.chatCard}>
          {loadError && messages ? (
            <View style={[styles.errorBanner, { backgroundColor: theme.dangerSoft, borderColor: theme.border }]}>
              <AppText variant="caption" tone="danger" style={styles.errorText}>{loadError}</AppText>
              <Button label="Try again" variant="quiet" onPress={() => void refreshMessages()} />
            </View>
          ) : null}

          {!messages && loadError ? (
            <View style={styles.centerState}>
              <AppText variant="heading" align="center">The conversation could not open.</AppText>
              <AppText variant="body" tone="mutedText" align="center" style={styles.stateText}>{loadError}</AppText>
              <Button label="Try again" variant="secondary" onPress={() => void refreshMessages()} style={styles.retryButton} />
            </View>
          ) : !messages ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={theme.primary} />
              <AppText variant="caption" tone="mutedText" style={styles.stateText}>Opening your family conversation…</AppText>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={[styles.messageList, messages.length === 0 && styles.emptyList]}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => {
                if (shouldAutoScrollRef.current) scrollRef.current?.scrollToEnd({ animated: messages.length > 0 });
              }}
              onScroll={handleScroll}
              scrollEventThrottle={100}
            >
              {messages.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={[styles.emptyMark, { backgroundColor: theme.primarySoft }]}>
                    <AppText variant="heading" tone="primary">○</AppText>
                  </View>
                  <AppText variant="heading" align="center">Start the conversation</AppText>
                  <AppText variant="body" tone="mutedText" align="center" style={styles.emptyText}>
                    Share a quick update, a kind thought, or whatever helps your family stay close.
                  </AppText>
                </View>
              ) : messages.map((message) => {
                const isMine = message.senderMemberId === family.id;
                return (
                  <FadeInView key={message.id} enabled={message.id === animatedMessageId} distance={5} style={[styles.messageRow, isMine && styles.myMessageRow]}>
                    {!isMine ? <MemberAvatar member={{ ...message.sender, memberId: message.sender.memberId }} familyId={family.familyId} size={34} /> : null}
                    <View style={[styles.messageCluster, { maxWidth: isDesktop ? 620 : '84%' }, isMine && styles.myMessageCluster]}>
                      {!isMine ? (
                        <View style={styles.senderLine}>
                          <AppText variant="caption">{message.sender.displayName}</AppText>
                          <AppText variant="caption" tone="mutedText">· {roleLabel(message.sender.role)}</AppText>
                        </View>
                      ) : null}
                      <View style={[
                        styles.bubble,
                        { backgroundColor: isMine ? theme.primary : theme.surfaceRaised, borderColor: isMine ? theme.primary : theme.border },
                        isMine ? styles.myBubble : styles.otherBubble
                      ]}>
                        <AppText variant="body" tone={isMine ? 'textOnPrimary' : 'text'}>{message.text}</AppText>
                      </View>
                      <AppText variant="caption" tone="mutedText" style={isMine ? styles.myTimestamp : undefined}>
                        {messageTime(message.createdAt)}{isMine ? ' · You' : ''}
                      </AppText>
                    </View>
                  </FadeInView>
                );
              })}
            </ScrollView>
          )}

          <View style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.inputColumn}>
              <TextInput
                accessibilityLabel="Message"
                maxLength={MAX_MESSAGE_LENGTH}
                multiline
                onChangeText={(value) => { setDraft(value); setSendError(null); }}
                onKeyPress={handleKeyPress}
                placeholder="Write a message…"
                placeholderTextColor={theme.mutedText}
                style={[styles.input, { backgroundColor: theme.input, borderColor: sendError ? theme.danger : theme.borderStrong, color: theme.text }]}
                value={draft}
              />
              {sendError ? <AppText variant="caption" tone="danger" style={styles.sendError}>{sendError}</AppText> : null}
            </View>
            <Button
              label="Send"
              loading={sending}
              disabled={!trimmedDraft || trimmedDraft.length > MAX_MESSAGE_LENGTH}
              onPress={() => void handleSend()}
              style={styles.sendButton}
            />
          </View>
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, paddingBottom: spacing.md, paddingTop: spacing.lg },
  header: { alignItems: 'flex-start', flexDirection: 'row', paddingBottom: spacing.lg },
  mobileHeader: { flexDirection: 'column' },
  headerCopy: { flex: 1, minWidth: 0 },
  recipientHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  recipientCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  chatCard: { flex: 1, minHeight: 300, overflow: 'hidden' },
  centerState: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl },
  stateText: { marginTop: spacing.md },
  retryButton: { marginTop: spacing.lg },
  errorBanner: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md },
  errorText: { flex: 1 },
  messageList: { gap: spacing.md, padding: spacing.lg },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', alignSelf: 'center', maxWidth: 420, padding: spacing.lg },
  emptyMark: { alignItems: 'center', borderRadius: radius.pill, height: 56, justifyContent: 'center', marginBottom: spacing.md, width: 56 },
  emptyText: { marginTop: spacing.sm },
  messageRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  myMessageRow: { justifyContent: 'flex-end' },
  messageCluster: { alignItems: 'flex-start', gap: spacing.xs },
  myMessageCluster: { alignItems: 'flex-end' },
  senderLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.xs },
  bubble: { borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  myBubble: { borderBottomRightRadius: radius.sm, borderRadius: radius.md },
  otherBubble: { borderBottomLeftRadius: radius.sm, borderRadius: radius.md },
  myTimestamp: { textAlign: 'right' },
  composer: { alignItems: 'flex-end', borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  inputColumn: { flex: 1, minWidth: 0 },
  input: { borderRadius: radius.md, borderWidth: 1, fontSize: 16, maxHeight: 120, minHeight: 52, paddingBottom: 14, paddingHorizontal: spacing.md, paddingTop: 14, textAlignVertical: 'top' },
  sendError: { marginTop: spacing.xs, paddingHorizontal: spacing.xs },
  sendButton: { minHeight: 52 }
});
