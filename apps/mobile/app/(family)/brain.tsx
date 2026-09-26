import { useAppTheme } from '../../lib/app-theme';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData
} from 'react-native';
import { radius, spacing } from '@familyapp/config';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { MarkdownText } from '../../components/MarkdownText';
import { FadeInView, PressableScale, ThinkingDots } from '../../components/Motion';
import { Screen } from '../../components/Screen';
import { BrainApiError, MAX_BRAIN_MESSAGE_LENGTH, sendFamilyBrainMessage, type BrainMessage } from '../../lib/brain';
import { useCurrentFamily } from '../../lib/family-context';

type Turn = { id: string; role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  'What’s coming up?',
  'Show pending tasks',
  'Help plan a family activity',
  'What memories did we add recently?'
];

export default function BrainScreen() {
  const family = useCurrentFamily();
  const { colors: theme } = useAppTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const scrollRef = useRef<ScrollView>(null);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sendingRef.current) return;

    sendingRef.current = true;
    setSending(true);
    setError(null);
    setLastFailedMessage(null);

    // Bounded recent Family Brain history only — never the whole session, and never
    // Family Chat. This is a separate, session-local transcript, not persisted.
    const history: BrainMessage[] = turns.map((turn) => ({ role: turn.role, content: turn.content }));
    const userTurn: Turn = { id: `u-${Date.now()}`, role: 'user', content: message };
    shouldAutoScrollRef.current = true;
    setTurns((current) => [...current, userTurn]);
    setDraft('');

    try {
      const reply = await sendFamilyBrainMessage(family.familyId, message, history);
      setTurns((current) => [...current, { id: `a-${Date.now()}`, role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err instanceof BrainApiError ? err.message : 'Family Brain could not respond right now.');
      setLastFailedMessage(message);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function handleKeyPress(event: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    const nativeEvent = event.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean };
    if (Platform.OS === 'web' && nativeEvent.key === 'Enter' && !nativeEvent.shiftKey) {
      event.preventDefault();
      void send(draft);
    }
  }

  const trimmedDraft = draft.trim();

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen maxWidth={880} contentStyle={styles.content}>
        <FadeInView style={styles.header}>
          <View style={[styles.headerMark, { backgroundColor: theme.accentSoft }]}>
            <AppText variant="heading" style={{ color: theme.warning }}>✦</AppText>
          </View>
          <View style={styles.headerCopy}>
            <AppText variant={isDesktop ? 'display' : 'title'} style={styles.title}>Family Brain</AppText>
            <AppText variant="body" tone="mutedText" style={styles.subtitle}>
              Ask about your plans, tasks, and recent memories, or get ideas for your family. Family Brain
              doesn’t see Family Chat, your location, or photo contents.
            </AppText>
          </View>
        </FadeInView>

        <Card padded={false} style={[styles.conversationCard, { borderColor: theme.border }]}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[styles.messageList, turns.length === 0 && styles.emptyList]}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              if (shouldAutoScrollRef.current) scrollRef.current?.scrollToEnd({ animated: turns.length > 0 });
            }}
          >
            {turns.length === 0 ? (
              <View style={styles.emptyState}>
                <AppText variant="heading" align="center">What can I help with?</AppText>
                <AppText variant="body" tone="mutedText" align="center" style={styles.emptyText}>
                  Try one of these, or type your own question below.
                </AppText>
                <View style={styles.suggestions}>
                  {SUGGESTIONS.map((suggestion, index) => (
                    <FadeInView key={suggestion} delay={index * 55} distance={5}><PressableScale
                      key={suggestion}
                      accessibilityRole="button"
                      onPress={() => void send(suggestion)}
                      style={[styles.suggestionChip, { backgroundColor: theme.secondarySoft, borderColor: theme.border }]}
                    >
                      <AppText variant="label" tone="secondary">{suggestion}</AppText>
                    </PressableScale></FadeInView>
                  ))}
                </View>
              </View>
            ) : (
              turns.map((turn) => (
                <FadeInView key={turn.id} distance={6} style={[styles.messageRow, turn.role === 'user' && styles.myMessageRow]}>
                  {turn.role === 'assistant' ? (
                    <View style={[styles.assistantMark, { backgroundColor: theme.accentSoft }]}>
                      <AppText variant="caption" style={{ color: theme.warning }}>✦</AppText>
                    </View>
                  ) : null}
                  <View style={[styles.bubble, { maxWidth: isDesktop ? 560 : '84%' },
                    turn.role === 'user'
                      ? { backgroundColor: theme.primary, borderColor: theme.primary }
                      : { backgroundColor: theme.secondarySoft, borderColor: theme.border }]}
                  >
                    {turn.role === 'assistant'
                      ? <MarkdownText content={turn.content} />
                      : <AppText variant="body" tone="textOnPrimary">{turn.content}</AppText>}
                  </View>
                </FadeInView>
              ))
            )}

            {sending ? (
              <FadeInView style={styles.messageRow} distance={4}>
                <View style={[styles.assistantMark, { backgroundColor: theme.accentSoft }]}>
                  <AppText variant="caption" style={{ color: theme.warning }}>✦</AppText>
                </View>
                <View style={[styles.bubble, styles.thinkingBubble, { backgroundColor: theme.secondarySoft, borderColor: theme.border }]}>
                  <ThinkingDots color={theme.secondary} />
                  <AppText variant="caption" tone="mutedText">Family Brain is thinking…</AppText>
                </View>
              </FadeInView>
            ) : null}
          </ScrollView>

          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: theme.dangerSoft, borderColor: theme.border }]}>
              <AppText variant="caption" tone="danger" style={styles.errorText}>{error}</AppText>
              {lastFailedMessage ? <Button label="Try again" variant="quiet" onPress={() => void send(lastFailedMessage)} /> : null}
            </View>
          ) : null}

          <View style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.inputColumn}>
              <TextInput
                accessibilityLabel="Message Family Brain"
                maxLength={MAX_BRAIN_MESSAGE_LENGTH}
                multiline
                onChangeText={setDraft}
                onKeyPress={handleKeyPress}
                placeholder="Ask Family Brain…"
                placeholderTextColor={theme.mutedText}
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.borderStrong, color: theme.text }]}
                value={draft}
              />
            </View>
            <Button
              label="Send"
              loading={sending}
              disabled={!trimmedDraft || trimmedDraft.length > MAX_BRAIN_MESSAGE_LENGTH}
              onPress={() => void send(draft)}
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
  header: { flexDirection: 'row', gap: spacing.md, paddingBottom: spacing.lg },
  headerMark: { alignItems: 'center', borderRadius: radius.md, height: 48, justifyContent: 'center', width: 48 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { marginBottom: spacing.xs },
  subtitle: { marginTop: spacing.xs },
  conversationCard: { borderWidth: 1, flex: 1, minHeight: 320, overflow: 'hidden' },
  messageList: { gap: spacing.md, padding: spacing.lg },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', alignSelf: 'center', maxWidth: 440, padding: spacing.lg },
  emptyText: { marginTop: spacing.sm },
  suggestions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.lg },
  suggestionChip: { borderRadius: radius.pill, borderWidth: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  messageRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  myMessageRow: { justifyContent: 'flex-end' },
  assistantMark: { alignItems: 'center', borderRadius: radius.pill, height: 28, justifyContent: 'center', width: 28 },
  bubble: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  thinkingBubble: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  errorBanner: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md },
  errorText: { flex: 1 },
  composer: { alignItems: 'flex-end', borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  inputColumn: { flex: 1, minWidth: 0 },
  input: { borderRadius: radius.md, borderWidth: 1, fontSize: 16, maxHeight: 120, minHeight: 52, paddingBottom: 14, paddingHorizontal: spacing.md, paddingTop: 14, textAlignVertical: 'top' },
  sendButton: { minHeight: 52 }
});
