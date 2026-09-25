import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../../../components/AppText';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Screen } from '../../../components/Screen';
import { useCurrentFamily } from '../../../lib/family-context';
import {
  getPrivateMessages,
  markPrivateConversationRead,
  MAX_PRIVATE_MESSAGE_LENGTH,
  PrivateChatApiError,
  sendPrivateMessage,
  type PrivateConversation,
  type PrivateMessage
} from '../../../lib/private-chat';

const POLL_INTERVAL_MS = 5000;
const MAX_VISIBLE_MESSAGES = 100;

function mergeMessages(current: PrivateMessage[] | null, incoming: PrivateMessage[]) {
  const byId = new Map((current ?? []).map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => {
    const dateDifference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return dateDifference || left.id.localeCompare(right.id);
  }).slice(-MAX_VISIBLE_MESSAGES);
}

function messageTime(createdAt: string) {
  const date = new Date(createdAt);
  const today = new Date();
  return date.toLocaleString(undefined, date.toDateString() === today.toDateString()
    ? { hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function PrivateConversationScreen() {
  const family = useCurrentFamily();
  const params = useLocalSearchParams<{ conversationId: string }>();
  const conversationId = Array.isArray(params.conversationId) ? params.conversationId[0] : params.conversationId;
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const [conversation, setConversation] = useState<PrivateConversation | null>(null);
  const [messages, setMessages] = useState<PrivateMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const focusedRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const sendingRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  const refreshMessages = useCallback(async () => {
    if (!conversationId || !focusedRef.current || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const result = await getPrivateMessages(family.familyId, conversationId);
      if (!focusedRef.current) return;
      setConversation(result.conversation);
      setMessages((current) => mergeMessages(current, result.messages));
      setLoadError(null);
      const latestMessage = result.messages[result.messages.length - 1];
      if (latestMessage) {
        void markPrivateConversationRead(family.familyId, conversationId, latestMessage.id).catch(() => undefined);
      }
    } catch (caught) {
      if (focusedRef.current) {
        setLoadError(caught instanceof PrivateChatApiError ? caught.message : 'We could not refresh this private conversation.');
      }
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [conversationId, family.familyId]);

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
    if (!conversationId || !text || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      const message = await sendPrivateMessage(family.familyId, conversationId, text);
      shouldAutoScrollRef.current = true;
      setMessages((current) => mergeMessages(current, [message]));
      setDraft('');
    } catch (caught) {
      setSendError(caught instanceof PrivateChatApiError ? caught.message : 'Your private message could not be sent.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [conversationId, draft, family.familyId]);

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
            <AppText accessibilityRole="link" onPress={() => router.replace('/(family)/chat?mode=private' as never)} variant="label" tone="primary">‹ Back to private inbox</AppText>
            <View style={styles.recipientHeader}>
              {conversation ? <Avatar name={conversation.recipient.displayName} imageUrl={conversation.recipient.avatar} size={48} /> : null}
              <View style={styles.recipientCopy}>
                <AppText variant={isDesktop ? 'title' : 'heading'}>{conversation?.recipient.displayName ?? 'Private conversation'}</AppText>
                <AppText variant="caption" tone="mutedText">Private · only visible to the two participants</AppText>
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
              <AppText variant="heading" align="center">This private conversation could not open.</AppText>
              <AppText variant="body" tone="mutedText" align="center" style={styles.stateText}>{loadError}</AppText>
              <Button label="Try again" variant="secondary" onPress={() => void refreshMessages()} style={styles.retryButton} />
            </View>
          ) : !messages ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={theme.primary} />
              <AppText variant="caption" tone="mutedText" style={styles.stateText}>Opening private conversation…</AppText>
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
                  <AppText variant="heading" align="center">Start your private conversation</AppText>
                  <AppText variant="body" tone="mutedText" align="center" style={styles.emptyText}>Messages here are visible only to you and {conversation?.recipient.displayName ?? 'this family member'}.</AppText>
                </View>
              ) : messages.map((message) => {
                const isMine = message.senderMemberId === family.id;
                return (
                  <View key={message.id} style={[styles.messageRow, isMine && styles.myMessageRow]}>
                    {!isMine ? <Avatar name={message.sender.displayName} imageUrl={message.sender.avatar} size={34} /> : null}
                    <View style={[styles.messageCluster, { maxWidth: isDesktop ? 620 : '84%' }, isMine && styles.myMessageCluster]}>
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
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.inputColumn}>
              <TextInput
                accessibilityLabel="Private message"
                editable={Boolean(conversation)}
                maxLength={MAX_PRIVATE_MESSAGE_LENGTH}
                multiline
                onChangeText={(value) => { setDraft(value); setSendError(null); }}
                onKeyPress={handleKeyPress}
                placeholder={conversation ? `Message ${conversation.recipient.displayName}…` : 'Write a message…'}
                placeholderTextColor={theme.mutedText}
                style={[styles.input, { backgroundColor: theme.input, borderColor: sendError ? theme.danger : theme.borderStrong, color: theme.text }]}
                value={draft}
              />
              {sendError ? <AppText variant="caption" tone="danger" style={styles.sendError}>{sendError}</AppText> : null}
            </View>
            <Button label="Send" loading={sending} disabled={!conversation || !trimmedDraft || trimmedDraft.length > MAX_PRIVATE_MESSAGE_LENGTH} onPress={() => void handleSend()} style={styles.sendButton} />
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
  emptyText: { marginTop: spacing.sm },
  messageRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  myMessageRow: { justifyContent: 'flex-end' },
  messageCluster: { alignItems: 'flex-start', gap: spacing.xs },
  myMessageCluster: { alignItems: 'flex-end' },
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
