import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../../../components/AppText';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { DateTimeField } from '../../../components/DateTimeField';
import { Screen } from '../../../components/Screen';
import { TextField } from '../../../components/TextField';
import { useCurrentFamily } from '../../../lib/family-context';
import { getFamilyHousehold, getFamilyHouseholds, type Household } from '../../../lib/households';
import { createFamilyPoll, getFamilyPolls, PollApiError, type Poll } from '../../../lib/polls';

const POLL_INTERVAL_MS = 20_000;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

function formatClosing(poll: Poll) {
  if (poll.closedAt) return `Closed ${new Date(poll.closedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  if (poll.closesAt) {
    const date = new Date(poll.closesAt);
    return poll.isClosed
      ? `Closed ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      : `Closes ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  }
  return poll.isClosed ? 'Closed' : 'No closing date';
}

function leadingOption(poll: Poll) {
  if (poll.totalVotes === 0) return null;
  const sorted = [...poll.options].sort((a, b) => b.votes - a.votes);
  if (sorted.length > 1 && sorted[0].votes === sorted[1].votes) return null;
  return sorted[0];
}

export default function PollsScreen() {
  const family = useCurrentFamily();
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const [polls, setPolls] = useState<Poll[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [creating, setCreating] = useState(false);

  const focusedRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (!focusedRef.current || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const next = await getFamilyPolls(family.familyId);
      if (focusedRef.current) { setPolls(next); setError(null); }
    } catch (err) {
      if (focusedRef.current) setError(err instanceof PollApiError ? err.message : 'We could not load your family polls.');
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [family.familyId]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      focusedRef.current = false;
      clearInterval(interval);
    };
  }, [load]));

  const openPolls = polls?.filter((poll) => !poll.isClosed) ?? [];
  const closedPolls = polls?.filter((poll) => poll.isClosed) ?? [];
  const visible = tab === 'open' ? openPolls : closedPolls;

  return (
    <Screen scroll maxWidth={880} contentStyle={styles.content}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <AppText variant="eyebrow" tone="secondary">Decide things together</AppText>
          <AppText variant="display" style={styles.title}>Polls</AppText>
          <AppText variant="body" tone="mutedText" style={styles.subtitle}>Whole-family votes, or just for one of your groups.</AppText>
        </View>
        {!creating ? <Button label="New poll" onPress={() => setCreating(true)} /> : null}
      </View>

      {creating ? (
        <NewPollEditor
          familyId={family.familyId}
          myMemberId={family.id}
          onCancel={() => setCreating(false)}
          onCreated={async () => { setCreating(false); await load(); }}
        />
      ) : null}

      {error ? (
        <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{error}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      ) : null}

      {!polls && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
          <AppText variant="caption" tone="mutedText" style={styles.loadingText}>Gathering your family polls…</AppText>
        </View>
      ) : null}

      {polls ? (
        <>
          <View style={styles.segmentRow}>
            <Segment label={`Open (${openPolls.length})`} active={tab === 'open'} onPress={() => setTab('open')} />
            <Segment label={`Closed (${closedPolls.length})`} active={tab === 'closed'} onPress={() => setTab('closed')} />
          </View>

          {visible.length === 0 ? (
            <Card style={[styles.empty, { backgroundColor: theme.secondarySoft }]}>
              <AppText variant="title" tone="secondary">☑</AppText>
              <AppText variant="heading" style={styles.emptyTitle}>{tab === 'open' ? 'No open polls' : 'No closed polls yet'}</AppText>
              <AppText variant="body" tone="mutedText" align="center" style={styles.emptyDetail}>
                {tab === 'open' ? 'Ask a question and let your family (or one of your groups) weigh in.' : 'Polls will show up here once they close.'}
              </AppText>
            </Card>
          ) : (
            <View style={styles.list}>
              {visible.map((poll) => <PollCard key={poll.id} poll={poll} />)}
            </View>
          )}
        </>
      ) : null}
    </Screen>
  );
}

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.segment, { backgroundColor: active ? theme.primarySoft : theme.input, borderColor: active ? theme.primary : theme.border }]}
    >
      <AppText variant="label" tone={active ? 'primary' : 'text'}>{label}</AppText>
    </Pressable>
  );
}

function PollCard({ poll }: { poll: Poll }) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const leading = leadingOption(poll);
  const targetLabel = poll.household ? poll.household.name : 'Whole family';
  const targetColor = poll.household ? theme.secondarySoft : theme.primarySoft;
  const targetTone = poll.household ? 'secondary' : 'primary';

  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/(family)/polls/${poll.id}` as never)}>
      <Card style={styles.pollCard}>
        <View style={styles.pollHeader}>
          <View style={[styles.targetBadge, { backgroundColor: targetColor }]}><AppText variant="caption" tone={targetTone}>{targetLabel}</AppText></View>
          {poll.myOptionId ? <AppText variant="caption" tone="success">You voted</AppText> : <AppText variant="caption" tone="mutedText">Not voted yet</AppText>}
        </View>
        <AppText variant="label" style={styles.pollQuestion}>{poll.question}</AppText>
        <View style={styles.personRow}>
          <Avatar name={poll.createdBy.displayName} imageUrl={poll.createdBy.avatar} size={20} />
          <AppText variant="caption" tone="mutedText">{poll.createdBy.displayName} · {formatClosing(poll)}</AppText>
        </View>
        <AppText variant="caption" tone="mutedText" style={styles.pollSummary}>
          {poll.totalVotes} {poll.totalVotes === 1 ? 'vote' : 'votes'}{leading ? ` · Leading: ${leading.text} (${leading.percentage}%)` : poll.totalVotes > 0 ? ' · Tied' : ''}
        </AppText>
      </Card>
    </Pressable>
  );
}

function NewPollEditor({ familyId, myMemberId, onCancel, onCreated }: {
  familyId: string;
  myMemberId: string;
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [target, setTarget] = useState<'family' | string>('family');
  const [myHouseholds, setMyHouseholds] = useState<Household[]>([]);
  const [closesAtIso, setClosesAtIso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const all = await getFamilyHouseholds(familyId);
        const details = await Promise.all(all.map((household) => getFamilyHousehold(familyId, household.id).catch(() => null)));
        if (!active) return;
        setMyHouseholds(
          details
            .filter((detail): detail is NonNullable<typeof detail> => detail !== null && detail.members.some((member) => member.memberId === myMemberId))
            .map((detail) => ({ ...detail.household, memberCount: detail.members.length }))
        );
      } catch {
        // If this fails, the create form simply offers "Entire family" only.
      }
    })();
    return () => { active = false; };
  }, [familyId, myMemberId]);

  function updateOption(index: number, value: string) {
    setOptions((current) => current.map((option, i) => (i === index ? value : option)));
  }

  function addOption() {
    setOptions((current) => (current.length < MAX_OPTIONS ? [...current, ''] : current));
  }

  function removeOption(index: number) {
    setOptions((current) => (current.length > MIN_OPTIONS ? current.filter((_, i) => i !== index) : current));
  }

  async function save() {
    if (savingRef.current) return;
    const trimmedQuestion = question.trim();
    const trimmedOptions = options.map((option) => option.trim()).filter((option) => option.length > 0);
    if (!trimmedQuestion) { setError('Write a question for your family.'); return; }
    if (trimmedOptions.length < MIN_OPTIONS) { setError(`Add at least ${MIN_OPTIONS} options.`); return; }

    if (closesAtIso && new Date(closesAtIso).getTime() <= Date.now()) {
      setError('Choose a closing date and time in the future.');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await createFamilyPoll(familyId, {
        question: trimmedQuestion,
        description: description.trim() || undefined,
        options: trimmedOptions,
        closesAt: closesAtIso ?? undefined,
        householdId: target === 'family' ? undefined : target
      });
      await onCreated();
    } catch (err) {
      setError(err instanceof PollApiError ? err.message : 'That poll could not be created.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Card elevated style={styles.editor}>
      <AppText variant="heading">New poll</AppText>
      <TextField label="Question" value={question} onChangeText={setQuestion} maxLength={200} placeholder="Where should we have lunch?" autoFocus />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} maxLength={1000} multiline />

      <AppText variant="label" style={styles.fieldLabel}>Who is this for?</AppText>
      <View style={styles.targetChips}>
        <TargetChip label="Entire family" active={target === 'family'} onPress={() => setTarget('family')} />
        {myHouseholds.map((household) => (
          <TargetChip key={household.id} label={household.name} active={target === household.id} onPress={() => setTarget(household.id)} />
        ))}
      </View>

      <AppText variant="label" style={styles.fieldLabel}>Options</AppText>
      {options.map((option, index) => (
        <View key={index} style={styles.optionRow}>
          <View style={styles.optionField}>
            <TextField label={`Option ${index + 1}`} value={option} onChangeText={(value) => updateOption(index, value)} maxLength={140} />
          </View>
          {options.length > MIN_OPTIONS ? <Button label="Remove" variant="quiet" onPress={() => removeOption(index)} style={styles.removeButton} /> : null}
        </View>
      ))}
      {options.length < MAX_OPTIONS ? <Button label="Add option" variant="quiet" onPress={addOption} style={styles.addOptionButton} /> : null}

      <DateTimeField
        label="Closing date (optional)"
        value={closesAtIso}
        onChange={setClosesAtIso}
        minimumDate={new Date()}
        hint="Leave empty for no closing date"
      />

      {error ? <AppText variant="caption" tone="danger" style={styles.formError}>{error}</AppText> : null}
      <View style={styles.formActions}>
        <Button label="Cancel" variant="quiet" onPress={onCancel} disabled={saving} />
        <Button label="Create poll" loading={saving} onPress={() => void save()} />
      </View>
    </Card>
  );
}

function TargetChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.segment, { backgroundColor: active ? theme.primarySoft : theme.input, borderColor: active ? theme.primary : theme.border }]}
    >
      <AppText variant="label" tone={active ? 'primary' : 'text'}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xl },
  headingRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, justifyContent: 'space-between' },
  headingCopy: { flex: 1, minWidth: 260 },
  title: { marginTop: spacing.xs },
  subtitle: { marginTop: spacing.sm },
  messageCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.lg },
  loading: { alignItems: 'center', paddingVertical: spacing.xxxl },
  loadingText: { marginTop: spacing.md },
  segmentRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  segment: { borderRadius: radius.pill, borderWidth: 1, minHeight: 40, paddingHorizontal: spacing.md, justifyContent: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, padding: spacing.xxl },
  emptyTitle: { marginTop: spacing.md },
  emptyDetail: { marginTop: spacing.sm, maxWidth: 420 },
  list: { gap: spacing.sm, marginTop: spacing.lg },
  pollCard: { gap: spacing.sm },
  pollHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  targetBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  pollQuestion: { marginTop: spacing.xs },
  personRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  pollSummary: { marginTop: spacing.xs },
  editor: { marginTop: spacing.xl, padding: spacing.xl },
  fieldLabel: { marginTop: spacing.lg },
  targetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  optionRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  optionField: { flex: 1 },
  removeButton: { marginBottom: spacing.xs },
  addOptionButton: { alignSelf: 'flex-start', marginTop: spacing.sm },
  formError: { marginTop: spacing.md },
  formActions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.lg }
});
