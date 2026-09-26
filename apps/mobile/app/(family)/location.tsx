import { useAppTheme } from '../../lib/app-theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { radius, spacing } from '@familyapp/config';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { FamilyMap } from '../../components/FamilyMap';
import { MemberAvatar } from '../../components/MemberAvatar';
import { Screen } from '../../components/Screen';
import { useCurrentFamily } from '../../lib/family-context';
import { getFamilyMembers, type FamilyMember } from '../../lib/families';
import { getFamilyHousehold, getFamilyHouseholds, type Household } from '../../lib/households';
import {
  directionsUrl,
  formatLocationAudience,
  getFamilyLocationShares,
  LocationApiError,
  mapsUrl,
  pingMyLocationShare,
  SHARE_DURATION_MINUTES,
  startComeFindMe,
  startMyLocationShare,
  stopMyLocationShare,
  updateComeFindMeAudience,
  type ComeFindMeAudienceInput,
  type FamilyLocationShare,
  type ShareDurationMinutes
} from '../../lib/location';

const POLL_INTERVAL_MS = 20_000;
const STALE_AFTER_MS = 5 * 60_000;
const DURATION_LABELS: Record<ShareDurationMinutes, string> = { 15: '15 minutes', 60: '1 hour', 240: '4 hours' };
type AudienceType = 'family' | 'household' | 'members';

function mergeShare(current: FamilyLocationShare[] | null, share: FamilyLocationShare) {
  return [share, ...(current ?? []).filter((item) => item.memberId !== share.memberId)];
}

function formatRemaining(expiresAt: string) {
  const totalMinutes = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000));
  if (totalMinutes === 0) return 'Ending…';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m left` : `${minutes}m left`;
}

function freshness(updatedAt: string) {
  const elapsed = Math.max(0, Date.now() - new Date(updatedAt).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  const age = minutes < 1 ? 'Updated just now' : minutes === 1 ? 'Updated 1 min ago' : minutes < 60 ? `Updated ${minutes} min ago` : `Updated ${Math.floor(minutes / 60)}h ago`;
  return { stale: elapsed > STALE_AFTER_MS, label: elapsed > STALE_AFTER_MS ? `Location stale · ${age}` : age };
}

function audienceInput(audienceType: AudienceType, householdId: string | null, memberIds: string[]): ComeFindMeAudienceInput | null {
  if (audienceType === 'family') return { audienceType };
  if (audienceType === 'household') return householdId ? { audienceType, householdId } : null;
  return memberIds.length ? { audienceType, memberIds } : null;
}

export default function LocationScreen() {
  const family = useCurrentFamily();
  const { width } = useWindowDimensions();
  const { colors: theme } = useAppTheme();
  const [shares, setShares] = useState<FamilyLocationShare[] | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [findMeError, setFindMeError] = useState<string | null>(null);
  const [duration, setDuration] = useState<ShareDurationMinutes>(60);
  const [findMeDuration, setFindMeDuration] = useState<ShareDurationMinutes>(60);
  const [audienceType, setAudienceType] = useState<AudienceType>('family');
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [starting, setStarting] = useState<'location' | 'come_find_me' | null>(null);
  const [stopping, setStopping] = useState(false);
  const [editingAudience, setEditingAudience] = useState(false);
  const [savingAudience, setSavingAudience] = useState(false);
  const [selectedShareId, setSelectedShareId] = useState<string | null>(null);
  const [mapActionError, setMapActionError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const focusedRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const myShare = shares?.find((share) => share.memberId === family.id) ?? null;
  const myShareActive = Boolean(myShare && new Date(myShare.expiresAt).getTime() > Date.now());
  const otherShares = (shares ?? []).filter((share) => share.memberId !== family.id);
  const selectedShare = (shares ?? []).find((share) => share.id === selectedShareId) ?? null;
  const otherMembers = members.filter((member) => member.id !== family.id);
  const isWide = width >= 760;

  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedShareId && shares && !shares.some((share) => share.id === selectedShareId)) setSelectedShareId(null);
  }, [selectedShareId, shares]);

  const load = useCallback(async () => {
    if (!focusedRef.current || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      setShares(await getFamilyLocationShares(family.familyId));
      setLoadError(null);
    } catch (error) {
      if (focusedRef.current) setLoadError(error instanceof LocationApiError ? error.message : 'We could not load location sharing.');
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [family.familyId]);

  useEffect(() => {
    void getFamilyMembers(family.familyId).then(setMembers).catch(() => {});
    void (async () => {
      try {
        const all = await getFamilyHouseholds(family.familyId);
        const details = await Promise.all(all.map((household) => getFamilyHousehold(family.familyId, household.id).catch(() => null)));
        setHouseholds(details.filter((detail): detail is NonNullable<typeof detail> => Boolean(detail?.members.some((member) => member.memberId === family.id))).map((detail) => ({ ...detail.household, memberCount: detail.members.length })));
      } catch { setHouseholds([]); }
    })();
  }, [family.familyId, family.id]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => { focusedRef.current = false; clearInterval(interval); };
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
    } catch (error) {
      if (error instanceof LocationApiError && error.code === 'share_not_active') {
        stopWatching();
        setShares((current) => (current ?? []).filter((share) => share.memberId !== family.id));
        setShareError('Your sharing session ended.');
      }
    }
  }, [family.familyId, family.id]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    if (myShareActive) {
      void Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 30_000, distanceInterval: 30 },
        (position) => { void sendPing(position); }
      ).then((subscription) => { if (cancelled) subscription.remove(); else watchRef.current = subscription; }).catch(() => {
        setShareError('Location updates are unavailable. Your last location may become stale.');
      });
    }
    return () => { cancelled = true; stopWatching(); };
  }, [myShareActive, sendPing]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && myShareActive) void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(sendPing).catch(() => {});
    });
    return () => subscription.remove();
  }, [myShareActive, sendPing]);

  async function getPosition() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) throw new Error('permission_denied');
    return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  }

  async function startLocationSharing() {
    setStarting('location');
    setShareError(null);
    try {
      const position = await getPosition();
      const share = await startMyLocationShare(family.familyId, {
        latitude: position.coords.latitude, longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy ?? undefined, durationMinutes: duration
      });
      setShares((current) => mergeShare(current, share));
    } catch (error) {
      setShareError(error instanceof LocationApiError ? error.message : error instanceof Error && error.message === 'permission_denied' ? 'Location permission was denied. Nothing was shared.' : 'We could not get your location. Check your device settings and try again.');
    } finally { setStarting(null); }
  }

  async function startFindMe() {
    const audience = audienceInput(audienceType, householdId, memberIds);
    if (!audience) { setFindMeError(audienceType === 'members' ? 'Choose at least one person.' : 'Choose a family group.'); return; }
    setStarting('come_find_me');
    setFindMeError(null);
    try {
      const position = await getPosition();
      const share = await startComeFindMe(family.familyId, {
        ...audience,
        latitude: position.coords.latitude, longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy ?? undefined, durationMinutes: findMeDuration
      });
      setShares((current) => mergeShare(current, share));
    } catch (error) {
      setFindMeError(error instanceof LocationApiError ? error.message : error instanceof Error && error.message === 'permission_denied' ? 'Location permission was denied. Come Find Me was not started.' : 'We could not get your location. Check your device settings and try again.');
    } finally { setStarting(null); }
  }

  async function stopSharing() {
    setStopping(true);
    stopWatching();
    try {
      await stopMyLocationShare(family.familyId);
      setShares((current) => (current ?? []).filter((share) => share.memberId !== family.id));
    } catch (error) {
      setShareError(error instanceof LocationApiError ? error.message : 'We could not stop sharing. Try again.');
      await load();
    } finally { setStopping(false); }
  }

  function beginAudienceEdit() {
    if (!myShare) return;
    setAudienceType(myShare.audience.type);
    setHouseholdId(myShare.audience.type === 'household' ? myShare.audience.household.id : null);
    setMemberIds(myShare.audience.type === 'members' ? myShare.audience.members.map((member) => member.memberId) : []);
    setEditingAudience(true);
  }

  async function saveAudience() {
    const audience = audienceInput(audienceType, householdId, memberIds);
    if (!audience) { setFindMeError(audienceType === 'members' ? 'Choose at least one person.' : 'Choose a family group.'); return; }
    setSavingAudience(true);
    setFindMeError(null);
    try {
      const share = await updateComeFindMeAudience(family.familyId, audience);
      setShares((current) => mergeShare(current, share));
      setEditingAudience(false);
    } catch (error) {
      setFindMeError(error instanceof LocationApiError ? error.message : 'The audience could not be updated.');
    } finally { setSavingAudience(false); }
  }

  async function openMapUrl(url: string) {
    setMapActionError(null);
    try {
      await Linking.openURL(url);
    } catch {
      setMapActionError('The external map could not be opened on this device.');
    }
  }

  return (
    <Screen scroll maxWidth={1080} contentStyle={styles.content}>
      <AppText variant="eyebrow" tone="secondary">Only when you choose</AppText>
      <AppText variant="display" style={styles.title}>Location</AppText>
      <AppText variant="body" tone="mutedText" style={styles.subtitle}>You control when your location is shared, who can see it, and when it stops.</AppText>

      {loadError ? <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}><AppText variant="body" tone="danger">{loadError}</AppText><Button label="Try again" variant="quiet" onPress={() => void load()} /></Card> : null}

      <SectionHeading title="My location sharing" detail="Family-wide sharing that you start and stop" />
      {myShareActive && myShare?.purpose === 'location' ? (
        <Card elevated style={[styles.sectionCard, { backgroundColor: theme.successSoft, borderColor: theme.success }]}>
          <AppText variant="heading" tone="success">Actively sharing</AppText>
          <AppText variant="body" tone="mutedText" style={styles.meta}>{formatRemaining(myShare.expiresAt)} · {freshness(myShare.updatedAt).label}</AppText>
          <Button label="Stop sharing" variant="secondary" loading={stopping} onPress={() => void stopSharing()} style={styles.action} />
        </Card>
      ) : myShareActive && myShare?.purpose === 'come_find_me' ? (
        <Card style={styles.sectionCard}><AppText variant="body">Come Find Me is active with a selected audience.</AppText><AppText variant="caption" tone="mutedText" style={styles.meta}>Manage or stop it below.</AppText></Card>
      ) : (
        <Card style={styles.sectionCard}>
          <AppText variant="body" tone="mutedText">Share your current location with your entire family for a limited time.</AppText>
          <DurationPicker value={duration} onChange={setDuration} />
          {shareError ? <AppText variant="caption" tone="danger" style={styles.error}>{shareError}</AppText> : null}
          <Button label="Share my location" loading={starting === 'location'} onPress={() => void startLocationSharing()} style={styles.action} />
        </Card>
      )}

      <SectionHeading title="Come Find Me" detail="Share with only the people you choose" />
      {myShareActive && myShare?.purpose === 'come_find_me' ? (
        <Card elevated style={[styles.sectionCard, { backgroundColor: theme.primarySoft, borderColor: theme.primary }]}>
          <AppText variant="heading" tone="primary">Come Find Me is active</AppText>
          <AppText variant="body" tone="mutedText" style={styles.meta}>{formatLocationAudience(myShare.audience)} · {formatRemaining(myShare.expiresAt)}</AppText>
          <AppText variant="caption" tone={freshness(myShare.updatedAt).stale ? 'danger' : 'mutedText'} style={styles.meta}>{freshness(myShare.updatedAt).label}</AppText>
          {editingAudience ? <AudiencePicker audienceType={audienceType} setAudienceType={setAudienceType} householdId={householdId} setHouseholdId={setHouseholdId} memberIds={memberIds} setMemberIds={setMemberIds} households={households} members={otherMembers} /> : null}
          {findMeError ? <AppText variant="caption" tone="danger" style={styles.error}>{findMeError}</AppText> : null}
          <View style={styles.actions}>
            {editingAudience ? <><Button label="Cancel" variant="quiet" disabled={savingAudience} onPress={() => setEditingAudience(false)} /><Button label="Save audience" loading={savingAudience} onPress={() => void saveAudience()} /></> : <Button label="Change audience" variant="quiet" onPress={beginAudienceEdit} />}
            <Button label="Stop sharing" variant="secondary" loading={stopping} onPress={() => void stopSharing()} />
          </View>
        </Card>
      ) : (
        <Card style={styles.sectionCard}>
          <AppText variant="body" tone="mutedText">Your device asks for location permission first. No session is created unless a current location is obtained.</AppText>
          {myShareActive ? <AppText variant="caption" tone="mutedText" style={styles.meta}>Starting Come Find Me will replace your current family-wide share with this audience.</AppText> : null}
          <AudiencePicker audienceType={audienceType} setAudienceType={setAudienceType} householdId={householdId} setHouseholdId={setHouseholdId} memberIds={memberIds} setMemberIds={setMemberIds} households={households} members={otherMembers} />
          <AppText variant="label" style={styles.durationLabel}>Share for</AppText>
          <DurationPicker value={findMeDuration} onChange={setFindMeDuration} />
          {findMeError ? <AppText variant="caption" tone="danger" style={styles.error}>{findMeError}</AppText> : null}
          <Button label="Start Come Find Me" loading={starting === 'come_find_me'} onPress={() => void startFindMe()} style={styles.action} />
        </Card>
      )}

      <SectionHeading title="Family Map" detail={`${shares?.length ?? 0} authorized location${shares?.length === 1 ? '' : 's'}`} />
      {shares === null && !loadError ? <View style={styles.loading}><ActivityIndicator color={theme.primary} /><AppText variant="caption" tone="mutedText">Loading family map…</AppText></View> : <FamilyMap shares={shares ?? []} selectedShareId={selectedShareId} onSelect={setSelectedShareId} />}
      {selectedShare ? <SelectedShareCard share={selectedShare} currentMemberId={family.id} familyId={family.familyId} onClose={() => setSelectedShareId(null)} onDirections={() => void openMapUrl(directionsUrl(selectedShare.latitude, selectedShare.longitude))} /> : null}
      {mapActionError ? <AppText variant="caption" tone="danger" style={styles.error}>{mapActionError}</AppText> : null}

      <SectionHeading title="Family members sharing with me" detail={`${otherShares.length} active share${otherShares.length === 1 ? '' : 's'} available to you`} />
      {shares !== null && otherShares.length === 0 ? (
        <Card style={styles.empty}><AppText variant="label">No active shares</AppText><AppText variant="caption" tone="mutedText" align="center">Eligible family and Come Find Me shares will appear here.</AppText></Card>
      ) : (
        <View style={[styles.shareGrid, isWide && styles.shareGridWide]}>{otherShares.map((share) => <ShareCard key={share.id} share={share} selected={share.id === selectedShareId} familyId={family.familyId} onSelect={() => setSelectedShareId(share.id)} onExternal={() => void openMapUrl(mapsUrl(share.latitude, share.longitude))} onDirections={() => void openMapUrl(directionsUrl(share.latitude, share.longitude))} />)}</View>
      )}
    </Screen>
  );
}

function SectionHeading({ title, detail }: { title: string; detail: string }) {
  return <View style={styles.sectionHeading}><AppText variant="heading">{title}</AppText><AppText variant="caption" tone="mutedText">{detail}</AppText></View>;
}

function DurationPicker({ value, onChange }: { value: ShareDurationMinutes; onChange: (value: ShareDurationMinutes) => void }) {
  return <View style={styles.choices}>{SHARE_DURATION_MINUTES.map((minutes) => <Choice key={minutes} label={DURATION_LABELS[minutes]} selected={value === minutes} onPress={() => onChange(minutes)} />)}</View>;
}

function AudiencePicker({ audienceType, setAudienceType, householdId, setHouseholdId, memberIds, setMemberIds, households, members }: {
  audienceType: AudienceType;
  setAudienceType: (value: AudienceType) => void;
  householdId: string | null;
  setHouseholdId: (value: string | null) => void;
  memberIds: string[];
  setMemberIds: (value: string[]) => void;
  households: Household[];
  members: FamilyMember[];
}) {
  const toggleMember = (id: string) => setMemberIds(memberIds.includes(id) ? memberIds.filter((value) => value !== id) : [...memberIds, id]);
  return <View style={styles.audience}>
    <AppText variant="label">Who can see this?</AppText>
    <View style={styles.choices}>
      <Choice label="Entire family" selected={audienceType === 'family'} onPress={() => setAudienceType('family')} />
      <Choice label="Family group" selected={audienceType === 'household'} onPress={() => setAudienceType('household')} />
      <Choice label="Specific people" selected={audienceType === 'members'} onPress={() => setAudienceType('members')} />
    </View>
    {audienceType === 'household' ? <View style={styles.choices}>{households.length ? households.map((household) => <Choice key={household.id} label={household.name} selected={householdId === household.id} onPress={() => setHouseholdId(household.id)} />) : <AppText variant="caption" tone="mutedText">You do not belong to a family group.</AppText>}</View> : null}
    {audienceType === 'members' ? <View style={styles.choices}>{members.length ? members.map((member) => <Choice key={member.id} label={member.displayName} selected={memberIds.includes(member.id)} onPress={() => toggleMember(member.id)} />) : <AppText variant="caption" tone="mutedText">There are no other family members to choose.</AppText>}</View> : null}
  </View>;
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors: theme } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.choice, { backgroundColor: selected ? theme.primarySoft : theme.input, borderColor: selected ? theme.primary : theme.border }]}><AppText variant="label" tone={selected ? 'primary' : 'text'}>{label}</AppText></Pressable>;
}

function SelectedShareCard({ share, currentMemberId, familyId, onClose, onDirections }: { share: FamilyLocationShare; currentMemberId: string; familyId: string; onClose: () => void; onDirections: () => void }) {
  const { colors: theme } = useAppTheme();
  const freshnessState = freshness(share.updatedAt);
  const audienceLabel = share.audience.type === 'members' && share.memberId !== currentMemberId ? 'Specific people' : formatLocationAudience(share.audience);
  return <Card elevated style={[styles.selectedCard, { borderColor: theme.primary }]}>
    <View style={styles.selectedHeader}>
      <View style={styles.personRow}><MemberAvatar member={share.member} familyId={familyId} size={48} /><View style={styles.personCopy}><AppText variant="heading">{share.member.displayName}</AppText><AppText variant="caption" tone={share.purpose === 'come_find_me' ? 'primary' : 'mutedText'}>{share.purpose === 'come_find_me' ? 'Come Find Me' : 'Sharing location'}</AppText></View></View>
      <Button label="Close" variant="quiet" onPress={onClose} />
    </View>
    <AppText variant="body" tone={freshnessState.stale ? 'danger' : 'mutedText'} style={styles.meta}>{freshnessState.label}</AppText>
    {share.accuracyMeters !== null ? <AppText variant="caption" tone="mutedText" style={styles.meta}>Approx. ±{Math.round(share.accuracyMeters)} m</AppText> : null}
    <AppText variant="caption" tone="mutedText" style={styles.meta}>Shared with: {audienceLabel}</AppText>
    <Button label="Directions" variant="secondary" onPress={onDirections} style={styles.action} />
  </Card>;
}

function ShareCard({ share, selected, familyId, onSelect, onExternal, onDirections }: { share: FamilyLocationShare; selected: boolean; familyId: string; onSelect: () => void; onExternal: () => void; onDirections: () => void }) {
  const { colors: theme } = useAppTheme();
  const freshnessState = freshness(share.updatedAt);
  return <Card style={[styles.memberCard, selected && { borderColor: theme.primary, borderWidth: 1 }]}>
    <View style={styles.personRow}>
      <MemberAvatar member={share.member} familyId={familyId} size={40} />
      <View style={styles.personCopy}>
        <AppText variant="label">{share.member.displayName}</AppText>
        <AppText variant="caption" tone={share.purpose === 'come_find_me' ? 'primary' : 'mutedText'}>{share.purpose === 'come_find_me' ? 'Come Find Me' : 'Sharing location'} · {formatRemaining(share.expiresAt)}</AppText>
        <AppText variant="caption" tone={freshnessState.stale ? 'danger' : 'mutedText'}>{freshnessState.label}</AppText>
        {share.accuracyMeters !== null ? <AppText variant="caption" tone="mutedText">Approx. ±{Math.round(share.accuracyMeters)} m</AppText> : null}
      </View>
    </View>
    <View style={styles.actions}><Button label="Show on map" variant="quiet" onPress={onSelect} /><Button label="Open external" variant="quiet" onPress={onExternal} /><Button label="Directions" variant="quiet" onPress={onDirections} /></View>
  </Card>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xl },
  title: { marginTop: spacing.xs },
  subtitle: { marginTop: spacing.sm, maxWidth: 680 },
  messageCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.lg },
  sectionHeading: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.xxl },
  sectionCard: { marginTop: spacing.md, padding: spacing.xl },
  meta: { marginTop: spacing.sm },
  action: { alignSelf: 'flex-start', marginTop: spacing.lg },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  choice: { borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: spacing.md },
  audience: { marginTop: spacing.lg },
  durationLabel: { marginTop: spacing.lg },
  error: { marginTop: spacing.md },
  loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  empty: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, padding: spacing.xl },
  shareGrid: { gap: spacing.md, marginTop: spacing.md },
  shareGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  memberCard: { flexGrow: 1, minWidth: 280, padding: spacing.lg },
  selectedCard: { borderWidth: 1, marginTop: spacing.md, padding: spacing.lg },
  selectedHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  personRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  personCopy: { flex: 1, gap: spacing.xs, minWidth: 0 }
});
