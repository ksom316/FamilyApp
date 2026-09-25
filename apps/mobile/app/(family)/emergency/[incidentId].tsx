import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, useColorScheme, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../../../components/AppText';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Screen } from '../../../components/Screen';
import {
  acknowledgeEmergency,
  EMERGENCY_TYPE_LABELS,
  EmergencyApiError,
  getEmergency,
  resolveEmergency,
  type EmergencyIncident
} from '../../../lib/emergency';
import { useCurrentFamily } from '../../../lib/family-context';

const POLL_INTERVAL_MS = 15_000;

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function BackLink() {
  return (
    <AppText accessibilityRole="link" onPress={() => router.replace('/(family)/emergency' as never)} variant="label" tone="primary" style={styles.backLink}>
      ‹ Back to Emergency Hub
    </AppText>
  );
}

export default function EmergencyDetailScreen() {
  const family = useCurrentFamily();
  const params = useLocalSearchParams<{ incidentId: string }>();
  const incidentId = Array.isArray(params.incidentId) ? params.incidentId[0] : params.incidentId;
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];

  const [incident, setIncident] = useState<EmergencyIncident | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState<'seen' | 'responding' | null>(null);
  const [resolving, setResolving] = useState(false);

  const focusedRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (!incidentId || !focusedRef.current || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const next = await getEmergency(family.familyId, incidentId);
      if (focusedRef.current) {
        setIncident(next);
        setError(null);
      }
    } catch (err) {
      if (focusedRef.current) setError(err instanceof EmergencyApiError ? err.message : 'We could not open this emergency.');
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [family.familyId, incidentId]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      focusedRef.current = false;
      clearInterval(interval);
    };
  }, [load]));

  async function acknowledge(responseStatus: 'seen' | 'responding') {
    if (!incidentId || acknowledging) return;
    setAcknowledging(responseStatus);
    setActionError(null);
    try {
      const next = await acknowledgeEmergency(family.familyId, incidentId, responseStatus);
      setIncident(next);
    } catch (err) {
      setActionError(err instanceof EmergencyApiError ? err.message : 'That could not be sent.');
    } finally {
      setAcknowledging(null);
    }
  }

  async function resolve() {
    if (!incidentId || resolving) return;
    setResolving(true);
    setActionError(null);
    try {
      const next = await resolveEmergency(family.familyId, incidentId);
      setIncident(next);
    } catch (err) {
      setActionError(err instanceof EmergencyApiError ? err.message : 'This could not be resolved.');
    } finally {
      setResolving(false);
    }
  }

  if (error) {
    return (
      <Screen scroll maxWidth={720} contentStyle={styles.content}>
        <BackLink />
        <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{error}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      </Screen>
    );
  }

  if (!incident) {
    return (
      <Screen scroll maxWidth={720} contentStyle={styles.content}>
        <BackLink />
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
          <AppText variant="caption" tone="mutedText" style={styles.loadingText}>Loading…</AppText>
        </View>
      </Screen>
    );
  }

  const myMemberId = family.id;
  const iAcknowledged = incident.acknowledgements.some((ack) => ack.member.memberId === myMemberId);
  const canResolve = incident.status === 'active' && (incident.createdBy.memberId === myMemberId || family.role === 'owner' || family.role === 'guardian');

  return (
    <Screen scroll maxWidth={720} contentStyle={styles.content}>
      <BackLink />

      <Card elevated style={[styles.headerCard, incident.status === 'active' ? { borderColor: theme.danger } : undefined]}>
        <View style={styles.headerRow}>
          <Avatar name={incident.createdBy.displayName} imageUrl={incident.createdBy.avatar} size={48} />
          <View style={styles.headerCopy}>
            <AppText variant="label">{incident.createdBy.displayName} reported an emergency</AppText>
            <AppText variant="heading" tone="danger">{EMERGENCY_TYPE_LABELS[incident.emergencyType]}</AppText>
            <AppText variant="caption" tone="mutedText">{formatDateTime(incident.createdAt)}</AppText>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: incident.status === 'active' ? theme.dangerSoft : theme.successSoft }]}>
            <AppText variant="caption" tone={incident.status === 'active' ? 'danger' : 'success'}>
              {incident.status === 'active' ? 'Active' : 'Resolved'}
            </AppText>
          </View>
        </View>
        {incident.message ? <AppText variant="body" style={styles.messageBody}>{incident.message}</AppText> : null}

        {incident.status === 'resolved' && incident.resolvedBy ? (
          <AppText variant="caption" tone="mutedText" style={styles.resolvedNote}>
            Resolved by {incident.resolvedBy.displayName}{incident.resolvedAt ? ` · ${formatDateTime(incident.resolvedAt)}` : ''}
          </AppText>
        ) : null}

        <AppText variant="caption" tone="mutedText" style={styles.disclaimer}>
          FamilyApp alerts family members only. For immediate danger, contact local emergency services directly.
        </AppText>

        {actionError ? <AppText variant="caption" tone="danger" style={styles.formError}>{actionError}</AppText> : null}

        {incident.status === 'active' ? (
          <View style={styles.actionRow}>
            {!iAcknowledged ? (
              <>
                <Button label="I've seen this" loading={acknowledging === 'seen'} disabled={acknowledging !== null} onPress={() => void acknowledge('seen')} />
                <Button label="I'm responding" variant="secondary" loading={acknowledging === 'responding'} disabled={acknowledging !== null} onPress={() => void acknowledge('responding')} />
              </>
            ) : (
              <AppText variant="caption" tone="success">You've responded to this emergency.</AppText>
            )}
          </View>
        ) : null}

        {canResolve ? (
          <Button label="Resolve emergency" variant="secondary" loading={resolving} onPress={() => void resolve()} style={styles.resolveButton} />
        ) : null}
      </Card>

      <View style={styles.sectionHeading}>
        <AppText variant="heading">Seen by</AppText>
      </View>

      {incident.acknowledgements.length === 0 ? (
        <Card style={styles.empty}>
          <AppText variant="caption" tone="mutedText" align="center">No one has responded yet.</AppText>
        </Card>
      ) : (
        <View style={styles.ackList}>
          {incident.acknowledgements.map((ack) => (
            <Card key={ack.id} style={styles.ackCard}>
              <View style={styles.personRow}>
                <Avatar name={ack.member.displayName} imageUrl={ack.member.avatar} size={36} />
                <View style={styles.detailCopy}>
                  <AppText variant="label">{ack.member.displayName}</AppText>
                  <AppText variant="caption" tone={ack.responseStatus === 'responding' ? 'primary' : 'mutedText'}>
                    {ack.responseStatus === 'responding' ? "I'm responding" : 'Seen'} · {formatDateTime(ack.createdAt)}
                  </AppText>
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
  backLink: { marginBottom: spacing.md },
  messageCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  loading: { alignItems: 'center', paddingVertical: spacing.xxxl },
  loadingText: { marginTop: spacing.md },
  headerCard: { padding: spacing.xl },
  headerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  headerCopy: { flex: 1, minWidth: 0 },
  statusBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  messageBody: { marginTop: spacing.lg },
  resolvedNote: { marginTop: spacing.md },
  disclaimer: { marginTop: spacing.lg },
  formError: { marginTop: spacing.md },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  resolveButton: { alignSelf: 'flex-start', marginTop: spacing.lg },
  sectionHeading: { marginTop: spacing.xxl },
  empty: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, padding: spacing.xl },
  ackList: { gap: spacing.sm, marginTop: spacing.md },
  ackCard: { padding: spacing.md },
  personRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  detailCopy: { flex: 1, minWidth: 0 }
});
