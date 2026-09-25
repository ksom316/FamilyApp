import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, useColorScheme, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, radius, spacing, typography, type Theme } from '@familyapp/config';

import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { useCurrentFamily } from '../../lib/family-context';
import {
  CheckInApiError,
  getFamilyCheckIns,
  postCheckIn,
  type CheckInStatus,
  type FamilyCheckIn
} from '../../lib/check-ins';

const POLL_INTERVAL_MS = 30_000;
const STATUS_LABELS: Record<CheckInStatus, string> = { safe: 'Safe', arrived: 'Arrived' };
const STATUS_MARKS: Record<CheckInStatus, string> = { safe: '✓', arrived: '🏠' };

function formatWhen(value: string) {
  const date = new Date(value);
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const isToday = date.toDateString() === new Date().toDateString();
  if (isToday) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function CheckInsScreen() {
  const family = useCurrentFamily();
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];

  const [checkIns, setCheckIns] = useState<FamilyCheckIn[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choosingStatus, setChoosingStatus] = useState<CheckInStatus | null>(null);
  const [note, setNote] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const focusedRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (!focusedRef.current || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const next = await getFamilyCheckIns(family.familyId);
      if (!focusedRef.current) return;
      setCheckIns(next);
      setLoadError(null);
    } catch (err) {
      if (focusedRef.current) setLoadError(err instanceof CheckInApiError ? err.message : 'We could not load recent check-ins.');
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

  async function submit() {
    if (!choosingStatus || posting) return;
    setPosting(true);
    setPostError(null);
    try {
      const checkIn = await postCheckIn(family.familyId, { status: choosingStatus, message: note.trim() || null });
      setCheckIns((current) => [checkIn, ...(current ?? [])]);
      setChoosingStatus(null);
      setNote('');
    } catch (err) {
      setPostError(err instanceof CheckInApiError ? err.message : 'That check-in could not be sent.');
    } finally {
      setPosting(false);
    }
  }

  const myLatest = checkIns?.find((item) => item.member.memberId === family.id) ?? null;

  return (
    <Screen scroll maxWidth={720} contentStyle={styles.content}>
      <View style={styles.headingCopy}>
        <AppText variant="eyebrow" tone="primary">Just a quick note</AppText>
        <AppText variant="display" style={styles.title}>How are you?</AppText>
        <AppText variant="body" tone="mutedText" style={styles.subtitle}>
          Let your family know you're okay, or that you've arrived somewhere. This is voluntary — no location is shared.
        </AppText>
        {myLatest ? (
          <AppText variant="caption" tone="mutedText" style={styles.myLatest}>
            Your last check-in: {STATUS_LABELS[myLatest.status]} · {formatWhen(myLatest.createdAt)}
          </AppText>
        ) : null}
      </View>

      {choosingStatus ? (
        <Card elevated style={styles.noteCard}>
          <AppText variant="heading">{STATUS_MARKS[choosingStatus]} {STATUS_LABELS[choosingStatus]}</AppText>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Add an optional note"
            placeholderTextColor={theme.mutedText}
            maxLength={200}
            style={[styles.noteInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
          />
          {postError ? <AppText variant="caption" tone="danger" style={styles.formError}>{postError}</AppText> : null}
          <View style={styles.formActions}>
            <Button label="Cancel" variant="quiet" onPress={() => { setChoosingStatus(null); setNote(''); setPostError(null); }} disabled={posting} />
            <Button label="Send check-in" loading={posting} onPress={() => void submit()} />
          </View>
        </Card>
      ) : (
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setChoosingStatus('safe')}
            style={[styles.actionButton, { backgroundColor: theme.successSoft, borderColor: theme.success }]}
          >
            <AppText variant="display" style={styles.actionMark}>✓</AppText>
            <AppText variant="label" tone="success">I'm safe</AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setChoosingStatus('arrived')}
            style={[styles.actionButton, { backgroundColor: theme.primarySoft, borderColor: theme.primary }]}
          >
            <AppText variant="display" style={styles.actionMark}>🏠</AppText>
            <AppText variant="label" tone="primary">I've arrived</AppText>
          </Pressable>
        </View>
      )}

      <View style={styles.sectionHeading}>
        <AppText variant="heading">Recent family activity</AppText>
      </View>

      {loadError ? (
        <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{loadError}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      ) : checkIns === null ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
          <AppText variant="caption" tone="mutedText" style={styles.loadingText}>Loading recent check-ins…</AppText>
        </View>
      ) : checkIns.length === 0 ? (
        <Card style={styles.empty}>
          <AppText variant="title" tone="mutedText">✓</AppText>
          <AppText variant="label" style={styles.emptyTitle}>No check-ins yet</AppText>
          <AppText variant="caption" tone="mutedText" align="center">When someone checks in, it will show up here.</AppText>
        </Card>
      ) : (
        <View style={styles.list}>
          {checkIns.map((item) => (
            <Card key={item.id} style={styles.checkInCard}>
              <View style={styles.personRow}>
                <Avatar name={item.member.displayName} imageUrl={item.member.avatar} size={40} />
                <View style={styles.detailCopy}>
                  <AppText variant="label">{item.member.displayName}</AppText>
                  <AppText variant="body" tone={item.status === 'safe' ? 'success' : 'primary'}>{STATUS_MARKS[item.status]} {STATUS_LABELS[item.status]}</AppText>
                  {item.message ? <AppText variant="caption" tone="mutedText" style={styles.messageText}>"{item.message}"</AppText> : null}
                  <AppText variant="caption" tone="mutedText" style={styles.timeText}>{formatWhen(item.createdAt)}</AppText>
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xl },
  headingCopy: { maxWidth: 640 },
  title: { marginTop: spacing.xs },
  subtitle: { marginTop: spacing.sm },
  myLatest: { marginTop: spacing.md },
  actionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  actionButton: { alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, flex: 1, gap: spacing.sm, justifyContent: 'center', minHeight: 120, paddingVertical: spacing.lg },
  actionMark: { fontSize: 36 },
  noteCard: { marginTop: spacing.xl, padding: spacing.xl },
  noteInput: { borderRadius: radius.md, borderWidth: 1, fontSize: typography.size.md, marginTop: spacing.md, minHeight: 48, paddingHorizontal: spacing.md },
  formError: { marginTop: spacing.md },
  formActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg },
  sectionHeading: { marginTop: spacing.xxl },
  messageCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.md },
  loading: { alignItems: 'center', paddingVertical: spacing.xxxl },
  loadingText: { marginTop: spacing.md },
  empty: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, padding: spacing.xl },
  emptyTitle: { marginBottom: spacing.xs, marginTop: spacing.sm },
  list: { gap: spacing.md, marginTop: spacing.md },
  checkInCard: { padding: spacing.lg },
  personRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  detailCopy: { flex: 1, minWidth: 0 },
  messageText: { marginTop: spacing.xs },
  timeText: { marginTop: spacing.xs }
});
