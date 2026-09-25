import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { useCurrentFamily } from '../../lib/family-context';
import { getFamilyMembers, type FamilyMember } from '../../lib/families';
import {
  cancelMyFindMeRequest,
  createFindMeRequest,
  formatDistanceKm,
  getFamilyLocationShares,
  getIncomingFindMeRequests,
  getOutgoingFindMeRequest,
  haversineDistanceKm,
  LocationApiError,
  mapsUrl,
  pingMyLocationShare,
  respondToFindMeRequest,
  SHARE_DURATION_MINUTES,
  startMyLocationShare,
  stopMyLocationShare,
  type FamilyLocationShare,
  type IncomingFindMeRequest,
  type OutgoingFindMeRequest,
  type ShareDurationMinutes
} from '../../lib/location';

const POLL_INTERVAL_MS = 20_000;
const DURATION_LABELS: Record<ShareDurationMinutes, string> = { 15: '15 minutes', 60: '1 hour', 240: '4 hours' };

function mergeShare(current: FamilyLocationShare[] | null, share: FamilyLocationShare) {
  const others = (current ?? []).filter((item) => item.memberId !== share.memberId);
  return [share, ...others];
}

function removeShare(current: FamilyLocationShare[] | null, memberId: string) {
  return (current ?? []).filter((item) => item.memberId !== memberId);
}

function formatRemaining(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Ending…';
  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

function formatUpdatedAgo(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'Updated just now';
  if (minutes === 1) return 'Updated 1 minute ago';
  if (minutes < 60) return `Updated ${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  return `Updated ${hours} hour${hours === 1 ? '' : 's'} ago`;
}

function formatAskedAgo(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 minute ago';
  return `${minutes} minutes ago`;
}

export default function LocationScreen() {
  const family = useCurrentFamily();
  const { width } = useWindowDimensions();
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];

  const [shares, setShares] = useState<FamilyLocationShare[] | null>(null);
  const [incoming, setIncoming] = useState<IncomingFindMeRequest[] | null>(null);
  const [outgoing, setOutgoing] = useState<OutgoingFindMeRequest | null | undefined>(undefined);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [findMeError, setFindMeError] = useState<string | null>(null);
  const [duration, setDuration] = useState<ShareDurationMinutes>(60);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [askingWho, setAskingWho] = useState(false);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [askDuration, setAskDuration] = useState<ShareDurationMinutes>(60);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const focusedRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const myShare = shares?.find((item) => item.memberId === family.id) ?? null;
  const myShareActive = Boolean(myShare && new Date(myShare.expiresAt).getTime() > Date.now());

  // Re-render periodically so "N minutes left" / "Updated N minutes ago" stay accurate,
  // and so an expired share flips this screen out of the sharing-active state on its own.
  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const load = useCallback(async () => {
    if (!focusedRef.current || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const [nextShares, nextIncoming, nextOutgoing] = await Promise.all([
        getFamilyLocationShares(family.familyId),
        getIncomingFindMeRequests(family.familyId),
        getOutgoingFindMeRequest(family.familyId)
      ]);
      if (!focusedRef.current) return;
      setShares(nextShares);
      setIncoming(nextIncoming);
      setOutgoing(nextOutgoing);
      setLoadError(null);
    } catch (err) {
      if (focusedRef.current) setLoadError(err instanceof LocationApiError ? err.message : 'We could not load location sharing.');
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [family.familyId]);

  useEffect(() => {
    void getFamilyMembers(family.familyId).then(setMembers).catch(() => {});
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

  function stopWatching() {
    watchRef.current?.remove();
    watchRef.current = null;
  }

  const sendPing = useCallback(async (position: Location.LocationObject) => {
    try {
      const share = await pingMyLocationShare(family.familyId, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy ?? undefined
      });
      setShares((current) => mergeShare(current, share));
    } catch (err) {
      if (err instanceof LocationApiError && err.code === 'share_not_active') {
        stopWatching();
        setShares((current) => removeShare(current, family.id));
        setShareError('Your sharing session ended.');
      }
    }
  }, [family.familyId, family.id]);

  // Foreground-only watcher: starts whenever my share is active AND this screen is
  // focused, and is torn down the instant either stops being true — including natural
  // expiry, since myShareActive is recomputed on every tick.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    if (myShareActive) {
      void Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 30_000, distanceInterval: 30 },
        (position) => { void sendPing(position); }
      ).then((subscription) => {
        if (cancelled) subscription.remove();
        else watchRef.current = subscription;
      });
    }
    return () => {
      cancelled = true;
      stopWatching();
    };
  }, [myShareActive, sendPing]));

  // When the app comes back to the foreground while sharing is active, grab one fresh
  // fix right away instead of waiting for the next watcher callback.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && myShareActive) {
        void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(sendPing).catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [myShareActive, sendPing]);

  async function startSharing() {
    setShareError(null);
    setStarting(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setShareError('Location permission was denied. You can try again anytime — nothing is shared unless you allow it.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const share = await startMyLocationShare(family.familyId, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy ?? undefined,
        durationMinutes: duration
      });
      setShares((current) => mergeShare(current, share));
    } catch (err) {
      setShareError(err instanceof LocationApiError ? err.message : 'We could not get your current location. Check your device’s location settings and try again.');
    } finally {
      setStarting(false);
    }
  }

  async function stopSharing() {
    setStopping(true);
    stopWatching();
    try {
      await stopMyLocationShare(family.familyId);
    } catch {
      // fall through — we still clear local state below so the UI never looks stuck "on"
    } finally {
      setShares((current) => removeShare(current, family.id));
      setStopping(false);
    }
  }

  async function sendFindMeRequest() {
    if (!recipientId) { setFindMeError('Choose who should come find you.'); return; }
    setFindMeError(null);
    setSendingRequest(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setFindMeError('Location permission was denied. You can try again anytime.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const request = await createFindMeRequest(family.familyId, {
        recipientMemberId: recipientId,
        durationMinutes: askDuration,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy ?? undefined
      });
      setOutgoing(request);
      setAskingWho(false);
      setRecipientId(null);
      await load();
    } catch (err) {
      setFindMeError(err instanceof LocationApiError ? err.message : 'That request could not be sent.');
    } finally {
      setSendingRequest(false);
    }
  }

  async function cancelRequest() {
    try {
      await cancelMyFindMeRequest(family.familyId);
    } finally {
      setOutgoing(null);
    }
  }

  async function respond(request: IncomingFindMeRequest, response: 'coming' | 'dismissed') {
    setRespondingId(request.id);
    try {
      await respondToFindMeRequest(family.familyId, request.id, response);
      setIncoming((current) => {
        if (!current) return current;
        if (response === 'dismissed') return current.filter((item) => item.id !== request.id);
        return current.map((item) => (item.id === request.id ? { ...item, response, respondedAt: new Date().toISOString() } : item));
      });
    } catch {
      // leave the request as-is; the next poll will reconcile
    } finally {
      setRespondingId(null);
    }
  }

  const shellWidth = width >= 900 ? width - 264 : width;
  const horizontalPadding = width >= 900 ? spacing.xxl * 2 : spacing.lg * 2;
  const contentWidth = Math.max(240, Math.min(1080, shellWidth - horizontalPadding));
  const isWide = contentWidth >= 720;

  const otherShares = (shares ?? []).filter((item) => item.memberId !== family.id);
  const recipients = members.filter((member) => member.id !== family.id);

  return (
    <Screen scroll maxWidth={1080} contentStyle={styles.content}>
      <View style={styles.headingCopy}>
        <AppText variant="eyebrow" tone="secondary">Only when you choose</AppText>
        <AppText variant="display" style={styles.title}>Location</AppText>
        <AppText variant="body" tone="mutedText" style={styles.subtitle}>
          Share where you are with your family for a little while, or ask someone to come find you.
        </AppText>
      </View>

      {loadError ? (
        <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{loadError}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      ) : null}

      {/* My sharing status */}
      {myShareActive && myShare ? (
        <Card elevated style={[styles.shareCard, { backgroundColor: theme.successSoft, borderColor: theme.success }]}>
          <View style={styles.shareActiveHeader}>
            <View style={[styles.liveDot, { backgroundColor: theme.success }]} />
            <AppText variant="heading" tone="success">You’re sharing your location</AppText>
          </View>
          <AppText variant="body" tone="mutedText" style={styles.shareMeta}>{formatRemaining(myShare.expiresAt)} · {formatUpdatedAgo(myShare.updatedAt)}</AppText>
          {myShare.accuracyMeters ? <AppText variant="caption" tone="mutedText">Accuracy ± {Math.round(myShare.accuracyMeters)} m</AppText> : null}
          {shareError ? <AppText variant="caption" tone="danger" style={styles.formError}>{shareError}</AppText> : null}
          <Button label="Stop sharing" variant="secondary" loading={stopping} onPress={() => void stopSharing()} style={styles.stopButton} />
        </Card>
      ) : (
        <Card style={styles.shareCard}>
          <AppText variant="heading">Share my location</AppText>
          <AppText variant="body" tone="mutedText" style={styles.shareMeta}>
            Your family will see your approximate location only while sharing is active. It turns off automatically, and you can stop anytime.
          </AppText>
          <View style={styles.durationRow}>
            {SHARE_DURATION_MINUTES.map((minutes) => (
              <Segment key={minutes} label={DURATION_LABELS[minutes]} active={duration === minutes} onPress={() => setDuration(minutes)} />
            ))}
          </View>
          {shareError ? <AppText variant="caption" tone="danger" style={styles.formError}>{shareError}</AppText> : null}
          <Button label="Share my location" loading={starting} onPress={() => void startSharing()} style={styles.stopButton} />
        </Card>
      )}

      {/* Come Find Me */}
      <View style={styles.sectionHeading}>
        <AppText variant="heading">Come Find Me</AppText>
        <AppText variant="caption" tone="mutedText">Ask one family member to come find you</AppText>
      </View>

      {outgoing ? (
        <Card style={[styles.findMeCard, { backgroundColor: theme.primarySoft }]}>
          <AppText variant="label">You asked {outgoing.recipient.displayName} to come find you</AppText>
          <AppText variant="caption" tone="mutedText" style={styles.shareMeta}>{formatRemaining(outgoing.expiresAt)}{outgoing.response === 'coming' ? ' · They’re on their way' : ''}</AppText>
          <Button label="Cancel request" variant="quiet" onPress={() => void cancelRequest()} style={styles.stopButton} />
        </Card>
      ) : askingWho ? (
        <Card elevated style={styles.findMeCard}>
          <AppText variant="label">Who should come find you?</AppText>
          <View style={styles.memberChoices}>
            {recipients.map((member) => (
              <Segment key={member.id} label={member.displayName} active={recipientId === member.id} onPress={() => setRecipientId(member.id)} />
            ))}
          </View>
          <AppText variant="label" style={styles.durationLabel}>For how long</AppText>
          <View style={styles.durationRow}>
            {SHARE_DURATION_MINUTES.map((minutes) => (
              <Segment key={minutes} label={DURATION_LABELS[minutes]} active={askDuration === minutes} onPress={() => setAskDuration(minutes)} />
            ))}
          </View>
          {findMeError ? <AppText variant="caption" tone="danger" style={styles.formError}>{findMeError}</AppText> : null}
          <View style={styles.formActions}>
            <Button label="Cancel" variant="quiet" onPress={() => { setAskingWho(false); setFindMeError(null); }} disabled={sendingRequest} />
            <Button label="Send request" loading={sendingRequest} onPress={() => void sendFindMeRequest()} />
          </View>
        </Card>
      ) : (
        <Button label="Ask someone to come find me" variant="secondary" onPress={() => setAskingWho(true)} style={styles.askButton} disabled={recipients.length === 0} />
      )}

      {incoming && incoming.length > 0 ? (
        <View style={styles.incomingList}>
          {incoming.map((request) => {
            const requesterShare = shares?.find((item) => item.memberId === request.requester.memberId) ?? null;
            const myOwnShare = myShareActive ? myShare : null;
            const distanceKm = requesterShare && myOwnShare ? haversineDistanceKm(myOwnShare, requesterShare) : null;
            return (
              <Card key={request.id} style={[styles.incomingCard, { borderColor: theme.primary }]}>
                <View style={styles.personRow}>
                  <Avatar name={request.requester.displayName} imageUrl={request.requester.avatar} size={36} />
                  <View style={styles.detailCopy}>
                    <AppText variant="label">{request.requester.displayName} wants you to come find them</AppText>
                    <AppText variant="caption" tone="mutedText">
                      Asked {formatAskedAgo(request.createdAt)}
                      {requesterShare ? ` · ${formatUpdatedAgo(requesterShare.updatedAt)}` : ''}
                      {distanceKm !== null ? ` · ${formatDistanceKm(distanceKm)}` : ''}
                    </AppText>
                    {!requesterShare ? <AppText variant="caption" tone="mutedText">Their location isn’t available right now.</AppText> : null}
                    {requesterShare && !myOwnShare ? <AppText variant="caption" tone="mutedText">Share your location to see the distance.</AppText> : null}
                    {request.response === 'coming' ? <AppText variant="caption" tone="success">You’re on your way</AppText> : null}
                  </View>
                </View>
                <View style={styles.incomingActions}>
                  {requesterShare ? <Button label="Open in Maps" variant="quiet" onPress={() => void Linking.openURL(mapsUrl(requesterShare.latitude, requesterShare.longitude))} /> : null}
                  {request.response !== 'coming' ? <Button label="I’m coming" variant="quiet" loading={respondingId === request.id} onPress={() => void respond(request, 'coming')} /> : null}
                  <Button label="Dismiss" variant="quiet" loading={respondingId === request.id} onPress={() => void respond(request, 'dismissed')} />
                </View>
              </Card>
            );
          })}
        </View>
      ) : null}

      {/* Family locations */}
      <View style={styles.sectionHeading}>
        <AppText variant="heading">Family locations</AppText>
        <AppText variant="caption" tone="mutedText">{otherShares.length} sharing now</AppText>
      </View>

      {shares === null && !loadError ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
          <AppText variant="caption" tone="mutedText" style={styles.loadingText}>Checking who’s sharing…</AppText>
        </View>
      ) : otherShares.length === 0 ? (
        <Card style={styles.empty}>
          <AppText variant="title" tone="mutedText">◎</AppText>
          <AppText variant="label" style={styles.emptyTitle}>No one is sharing right now</AppText>
          <AppText variant="caption" tone="mutedText" align="center">When a family member turns on sharing, they’ll show up here.</AppText>
        </Card>
      ) : (
        <View style={[styles.memberGrid, isWide && styles.memberGridWide]}>
          {otherShares.map((share) => (
            <Card key={share.memberId} style={styles.memberCard}>
              <View style={styles.personRow}>
                <Avatar name={share.member.displayName} imageUrl={share.member.avatar} size={40} />
                <View style={styles.detailCopy}>
                  <AppText variant="label">{share.member.displayName}</AppText>
                  <AppText variant="caption" tone="mutedText">{formatRemaining(share.expiresAt)} · {formatUpdatedAgo(share.updatedAt)}</AppText>
                  {share.accuracyMeters ? <AppText variant="caption" tone="mutedText">± {Math.round(share.accuracyMeters)} m</AppText> : null}
                </View>
              </View>
              <Button label="Open in Maps" variant="quiet" onPress={() => void Linking.openURL(mapsUrl(share.latitude, share.longitude))} style={styles.stopButton} />
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
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
  headingCopy: { maxWidth: 640 },
  title: { marginTop: spacing.xs },
  subtitle: { marginTop: spacing.sm },
  messageCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.lg },
  shareCard: { marginTop: spacing.xl, padding: spacing.xl },
  shareActiveHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  liveDot: { borderRadius: 6, height: 12, width: 12 },
  shareMeta: { marginTop: spacing.sm },
  formError: { marginTop: spacing.md },
  stopButton: { alignSelf: 'flex-start', marginTop: spacing.lg },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  durationLabel: { marginTop: spacing.lg },
  segment: { borderRadius: radius.pill, borderWidth: 1, minHeight: 40, paddingHorizontal: spacing.md, justifyContent: 'center' },
  sectionHeading: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.xxl },
  findMeCard: { marginTop: spacing.md, padding: spacing.xl },
  askButton: { alignSelf: 'flex-start', marginTop: spacing.md },
  memberChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  formActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg },
  incomingList: { gap: spacing.md, marginTop: spacing.md },
  incomingCard: { borderWidth: 1, padding: spacing.lg },
  personRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  detailCopy: { flex: 1, minWidth: 0 },
  incomingActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  loading: { alignItems: 'center', paddingVertical: spacing.xxxl },
  loadingText: { marginTop: spacing.md },
  empty: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, padding: spacing.xl },
  emptyTitle: { marginBottom: spacing.xs, marginTop: spacing.sm },
  memberGrid: { gap: spacing.md, marginTop: spacing.md },
  memberGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  memberCard: { flexGrow: 1, minWidth: 260, padding: spacing.lg }
});
