import { useAppTheme } from '../../lib/app-theme';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { radius, spacing, typography, type Theme } from '@familyapp/config';

import { AppText } from '../../components/AppText';
import { MemberAvatar } from '../../components/MemberAvatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { useCurrentFamily } from '../../lib/family-context';
import {
  EMERGENCY_TYPE_LABELS,
  EMERGENCY_TYPES,
  EmergencyApiError,
  getFamilyEmergencies,
  reportEmergency,
  type EmergencyIncident,
  type EmergencyList,
  type EmergencyType
} from '../../lib/emergency';

const POLL_INTERVAL_MS = 20_000;

function formatWhen(value: string) {
  const date = new Date(value);
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const isToday = date.toDateString() === new Date().toDateString();
  if (isToday) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function EmergencyHubScreen() {
  const family = useCurrentFamily();
  const { colors: theme } = useAppTheme();

  const [emergencies, setEmergencies] = useState<EmergencyList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [selectedType, setSelectedType] = useState<EmergencyType>('need_help');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const focusedRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (!focusedRef.current || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const next = await getFamilyEmergencies(family.familyId);
      if (!focusedRef.current) return;
      setEmergencies(next);
      setLoadError(null);
    } catch (err) {
      if (focusedRef.current) setLoadError(err instanceof EmergencyApiError ? err.message : 'We could not load family emergencies.');
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

  async function send() {
    if (sending) return;
    setSending(true);
    setSendError(null);
    try {
      const incident = await reportEmergency(family.familyId, { emergencyType: selectedType, message: message.trim() || null });
      setEmergencies((current) => ({ active: [incident, ...(current?.active ?? [])], resolved: current?.resolved ?? [] }));
      setReporting(false);
      setSelectedType('need_help');
      setMessage('');
      router.push(`/(family)/emergency/${incident.id}` as never);
    } catch (err) {
      setSendError(err instanceof EmergencyApiError ? err.message : 'That alert could not be sent.');
    } finally {
      setSending(false);
    }
  }

  const active = emergencies?.active ?? [];
  const resolved = emergencies?.resolved ?? [];

  return (
    <Screen scroll maxWidth={720} contentStyle={styles.content}>
      <View style={styles.headingCopy}>
        <AppText variant="eyebrow" tone="danger">Family coordination, not emergency services</AppText>
        <AppText variant="display" style={styles.title}>Emergency Hub</AppText>
        <AppText variant="body" tone="mutedText" style={styles.subtitle}>
          Alert your family in FamilyApp when something urgent comes up, and see who's seen it.
        </AppText>
        <AppText variant="caption" tone="mutedText" style={styles.disclaimer}>
          For immediate danger, contact local emergency services directly. FamilyApp only notifies people inside this app.
        </AppText>
      </View>

      {reporting ? (
        <Card elevated style={styles.reportCard}>
          <AppText variant="heading">Report emergency</AppText>
          <AppText variant="label" style={styles.fieldLabel}>Emergency type</AppText>
          <View style={styles.typeRow}>
            {EMERGENCY_TYPES.map((type) => (
              <TypeChip key={type} label={EMERGENCY_TYPE_LABELS[type]} active={selectedType === type} onPress={() => setSelectedType(type)} />
            ))}
          </View>
          <AppText variant="label" style={styles.fieldLabel}>Optional message</AppText>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="What's happening?"
            placeholderTextColor={theme.mutedText}
            maxLength={300}
            multiline
            style={[styles.messageInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
          />
          {sendError ? <AppText variant="caption" tone="danger" style={styles.formError}>{sendError}</AppText> : null}
          <View style={styles.formActions}>
            <Button label="Cancel" variant="quiet" onPress={() => { setReporting(false); setSendError(null); }} disabled={sending} />
            <Button label="Send family alert" loading={sending} onPress={() => void send()} style={{ backgroundColor: theme.danger }} />
          </View>
        </Card>
      ) : (
        <Button label="Report emergency" onPress={() => setReporting(true)} style={[styles.reportButton, { backgroundColor: theme.danger }]} />
      )}

      {loadError ? (
        <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{loadError}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      ) : null}

      <View style={styles.sectionHeading}>
        <AppText variant="heading">Active emergencies</AppText>
      </View>

      {emergencies === null && !loadError ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
          <AppText variant="caption" tone="mutedText" style={styles.loadingText}>Checking for active emergencies…</AppText>
        </View>
      ) : active.length === 0 ? (
        <Card style={styles.empty}>
          <AppText variant="label" style={styles.emptyTitle}>No active emergencies</AppText>
          <AppText variant="caption" tone="mutedText" align="center">If something urgent comes up, report it above.</AppText>
        </Card>
      ) : (
        <View style={styles.list}>
          {active.map((incident) => <IncidentCard key={incident.id} incident={incident} theme={theme} familyId={family.familyId} />)}
        </View>
      )}

      <View style={styles.sectionHeading}>
        <AppText variant="heading">Recent resolved</AppText>
      </View>

      {resolved.length === 0 ? (
        <Card style={styles.empty}>
          <AppText variant="caption" tone="mutedText" align="center">Resolved emergencies will appear here.</AppText>
        </Card>
      ) : (
        <View style={styles.list}>
          {resolved.map((incident) => <IncidentCard key={incident.id} incident={incident} theme={theme} familyId={family.familyId} />)}
        </View>
      )}
    </Screen>
  );
}

function TypeChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors: theme } = useAppTheme();
  return (
    <AppText
      accessibilityRole="button"
      onPress={onPress}
      variant="label"
      tone={active ? 'primary' : 'text'}
      style={[styles.chip, { backgroundColor: active ? theme.primarySoft : theme.input, borderColor: active ? theme.primary : theme.border }]}
    >
      {label}
    </AppText>
  );
}

function IncidentCard({ incident, theme, familyId }: { incident: EmergencyIncident; theme: Theme; familyId: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/(family)/emergency/${incident.id}` as never)}>
      <Card style={styles.incidentCard}>
        <View style={styles.personRow}>
          <MemberAvatar member={incident.createdBy} familyId={familyId} size={40} />
          <View style={styles.detailCopy}>
            <AppText variant="label">{incident.createdBy.displayName}</AppText>
            <AppText variant="body" tone="danger">{EMERGENCY_TYPE_LABELS[incident.emergencyType]}</AppText>
            {incident.message ? <AppText variant="caption" tone="mutedText" numberOfLines={2} style={styles.messageText}>{incident.message}</AppText> : null}
            <AppText variant="caption" tone="mutedText" style={styles.timeText}>
              {formatWhen(incident.createdAt)} · {incident.acknowledgements.length} seen
              {incident.status === 'resolved' ? ' · Resolved' : ''}
            </AppText>
          </View>
          {incident.status === 'active' ? (
            <View style={[styles.activeBadge, { backgroundColor: theme.dangerSoft }]}>
              <AppText variant="caption" tone="danger">Active</AppText>
            </View>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xl },
  headingCopy: { maxWidth: 640 },
  title: { marginTop: spacing.xs },
  subtitle: { marginTop: spacing.sm },
  disclaimer: { marginTop: spacing.md },
  reportButton: { alignSelf: 'flex-start', marginTop: spacing.xl },
  reportCard: { marginTop: spacing.xl, padding: spacing.xl },
  fieldLabel: { marginTop: spacing.lg },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: { borderRadius: radius.pill, borderWidth: 1, minHeight: 40, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, textAlignVertical: 'center' },
  messageInput: { borderRadius: radius.md, borderWidth: 1, fontSize: typography.size.md, marginTop: spacing.sm, minHeight: 80, padding: spacing.md },
  formError: { marginTop: spacing.md },
  formActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg },
  messageCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.lg },
  sectionHeading: { marginTop: spacing.xxl },
  loading: { alignItems: 'center', paddingVertical: spacing.xxxl },
  loadingText: { marginTop: spacing.md },
  empty: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, padding: spacing.xl },
  emptyTitle: { marginBottom: spacing.xs },
  list: { gap: spacing.md, marginTop: spacing.md },
  incidentCard: { padding: spacing.lg },
  personRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  detailCopy: { flex: 1, minWidth: 0 },
  messageText: { marginTop: spacing.xs },
  timeText: { marginTop: spacing.xs },
  activeBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }
});
