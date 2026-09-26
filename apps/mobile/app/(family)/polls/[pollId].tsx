import { useAppTheme } from '../../../lib/app-theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { radius, spacing } from '@familyapp/config';

import { AppText } from '../../../components/AppText';
import { MemberAvatar } from '../../../components/MemberAvatar';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { AnimatedProgress, PressableScale } from '../../../components/Motion';
import { Screen } from '../../../components/Screen';
import { useCurrentFamily } from '../../../lib/family-context';
import { closeFamilyPoll, deleteFamilyPoll, getFamilyPoll, PollApiError, voteOnFamilyPoll, type Poll } from '../../../lib/polls';

const POLL_INTERVAL_MS = 15_000;

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function BackLink() {
  return (
    <AppText accessibilityRole="link" onPress={() => router.replace('/(family)/polls' as never)} variant="label" tone="primary" style={styles.backLink}>
      ‹ Back to Polls
    </AppText>
  );
}

export default function PollDetailScreen() {
  const family = useCurrentFamily();
  const params = useLocalSearchParams<{ pollId: string }>();
  const pollId = Array.isArray(params.pollId) ? params.pollId[0] : params.pollId;
  const { colors: theme } = useAppTheme();

  const [poll, setPoll] = useState<Poll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const focusedRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (!pollId || !focusedRef.current || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const next = await getFamilyPoll(family.familyId, pollId);
      if (focusedRef.current) {
        setPoll(next);
        setSelectedOptionId((current) => current ?? next.myOptionId);
        setError(null);
      }
    } catch (err) {
      if (focusedRef.current) setError(err instanceof PollApiError ? err.message : 'We could not open this poll.');
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [family.familyId, pollId]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      focusedRef.current = false;
      clearInterval(interval);
    };
  }, [load]));

  async function submitVote() {
    if (!poll || !selectedOptionId) return;
    setVoting(true);
    setError(null);
    try {
      const updated = await voteOnFamilyPoll(family.familyId, poll.id, selectedOptionId);
      setPoll(updated);
    } catch (err) {
      setError(err instanceof PollApiError ? err.message : 'Your vote could not be saved.');
    } finally {
      setVoting(false);
    }
  }

  async function handleClose() {
    if (!poll) return;
    setClosing(true);
    setError(null);
    try {
      setPoll(await closeFamilyPoll(family.familyId, poll.id));
    } catch (err) {
      setError(err instanceof PollApiError ? err.message : 'This poll could not be closed.');
    } finally {
      setClosing(false);
    }
  }

  function confirmDelete() {
    if (!poll) return;
    const run = async () => {
      setDeleting(true);
      try {
        await deleteFamilyPoll(family.familyId, poll.id);
        router.replace('/(family)/polls' as never);
      } catch (err) {
        setError(err instanceof PollApiError ? err.message : 'This poll could not be deleted.');
        setDeleting(false);
      }
    };
    if (Platform.OS === 'web') {
      const confirmFn = (globalThis as typeof globalThis & { confirm?: (message: string) => boolean }).confirm;
      if (confirmFn?.('Delete this poll? This cannot be undone.')) void run();
      return;
    }
    Alert.alert('Delete poll?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run() }
    ]);
  }

  if (!poll && !error) {
    return (
      <Screen contentStyle={styles.state}>
        <ActivityIndicator color={theme.primary} />
        <AppText variant="caption" tone="mutedText" style={styles.stateText}>Opening this poll…</AppText>
      </Screen>
    );
  }

  if (!poll) {
    return (
      <Screen scroll maxWidth={760} contentStyle={styles.content}>
        <BackLink />
        <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{error}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      </Screen>
    );
  }

  const isCreator = poll.createdByMemberId === family.id;
  const canDelete = isCreator && poll.totalVotes === 0;
  const hasChanges = selectedOptionId !== poll.myOptionId;

  return (
    <Screen scroll maxWidth={760} contentStyle={styles.content}>
      <BackLink />

      <Card style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={[styles.targetBadge, { backgroundColor: poll.household ? theme.secondarySoft : theme.primarySoft }]}>
            <AppText variant="caption" tone={poll.household ? 'secondary' : 'primary'}>{poll.household ? poll.household.name : 'Whole family'}</AppText>
          </View>
          {poll.isClosed ? (
            <View style={[styles.targetBadge, { backgroundColor: theme.dangerSoft }]}><AppText variant="caption" tone="danger">Closed</AppText></View>
          ) : (
            <View style={[styles.targetBadge, { backgroundColor: theme.successSoft }]}><AppText variant="caption" tone="success">Open</AppText></View>
          )}
        </View>

        <AppText variant="display" style={styles.question}>{poll.question}</AppText>
        {poll.description ? <AppText variant="body" tone="mutedText" style={styles.description}>{poll.description}</AppText> : null}

        <View style={styles.personRow}>
          <MemberAvatar member={poll.createdBy} familyId={family.familyId} size={28} />
          <AppText variant="caption" tone="mutedText">
            Started by {poll.createdBy.displayName}
            {poll.closedAt ? ` · Closed ${formatDateTime(poll.closedAt)}` : poll.closesAt ? ` · ${poll.isClosed ? 'Closed' : 'Closes'} ${formatDateTime(poll.closesAt)}` : ''}
          </AppText>
        </View>
      </Card>

      {error ? <AppText variant="caption" tone="danger" style={styles.formError}>{error}</AppText> : null}

      <View style={styles.optionsList}>
        {poll.options.map((option) => {
          const selected = selectedOptionId === option.id;
          const mine = poll.myOptionId === option.id;
          return (
            <PressableScale
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: poll.isClosed }}
              disabled={poll.isClosed}
              onPress={() => setSelectedOptionId(option.id)}
              style={[styles.optionCard, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.surface }]}
            >
              <View style={styles.optionTop}>
                <AppText variant="label">{option.text}{mine ? ' · Your vote' : ''}</AppText>
                <AppText variant="caption" tone="mutedText">{option.votes} · {option.percentage}%</AppText>
              </View>
              <View style={[styles.barTrack, { backgroundColor: theme.border }]}>
                <AnimatedProgress color={selected ? theme.primary : theme.secondary} percentage={option.percentage} />
              </View>
            </PressableScale>
          );
        })}
      </View>

      <AppText variant="caption" tone="mutedText" style={styles.totalVotes}>{poll.totalVotes} total {poll.totalVotes === 1 ? 'vote' : 'votes'}</AppText>

      {!poll.isClosed ? (
        <Button
          label={poll.myOptionId ? 'Change vote' : 'Vote'}
          loading={voting}
          disabled={!selectedOptionId || !hasChanges}
          onPress={() => void submitVote()}
          style={styles.voteButton}
        />
      ) : null}

      {(isCreator && !poll.isClosed) || canDelete ? (
        <View style={styles.creatorActions}>
          {isCreator && !poll.isClosed ? <Button label="Close poll" variant="quiet" loading={closing} onPress={() => void handleClose()} /> : null}
          {canDelete ? <Button label="Delete poll" variant="quiet" loading={deleting} onPress={confirmDelete} /> : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xl },
  state: { alignItems: 'center', justifyContent: 'center' },
  stateText: { marginTop: spacing.md },
  backLink: { marginBottom: spacing.lg },
  messageCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  headerCard: { padding: spacing.xl },
  headerRow: { flexDirection: 'row', gap: spacing.sm },
  targetBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  question: { marginTop: spacing.md },
  description: { marginTop: spacing.sm },
  personRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  formError: { marginTop: spacing.md },
  optionsList: { gap: spacing.sm, marginTop: spacing.xl },
  optionCard: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  optionTop: { flexDirection: 'row', justifyContent: 'space-between' },
  barTrack: { borderRadius: radius.pill, height: 6, marginTop: spacing.sm, overflow: 'hidden' },
  barFill: { borderRadius: radius.pill, height: '100%' },
  totalVotes: { marginTop: spacing.md },
  voteButton: { alignSelf: 'flex-start', marginTop: spacing.lg },
  creatorActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xl }
});
