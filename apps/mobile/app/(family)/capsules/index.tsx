import { useAppTheme } from '../../../lib/app-theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { radius, spacing } from '@familyapp/config';

import { AppText } from '../../../components/AppText';
import { MemberAvatar } from '../../../components/MemberAvatar';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { FadeInView, PressableScale, SuccessPulse } from '../../../components/Motion';
import { Screen } from '../../../components/Screen';
import { TimeCapsuleEditor } from '../../../components/TimeCapsuleEditor';
import { useCurrentFamily } from '../../../lib/family-context';
import { getFamilyMemories, type FamilyMemory } from '../../../lib/memories';
import {
  getFamilyTimeCapsules,
  TimeCapsulesApiError,
  type TimeCapsuleSummary
} from '../../../lib/time-capsules';

function formatUnlock(value: string) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function timeRemaining(unlockAt: string, now: number) {
  const remaining = Math.max(0, new Date(unlockAt).getTime() - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.max(1, Math.ceil((remaining % 3_600_000) / 60_000));
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

export default function TimeCapsulesScreen() {
  const family = useCurrentFamily();
  const { colors: theme } = useAppTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const [capsules, setCapsules] = useState<TimeCapsuleSummary[] | null>(null);
  const [memories, setMemories] = useState<FamilyMemory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showSealedConfirmation, setShowSealedConfirmation] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const unlockRefreshRef = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await getFamilyTimeCapsules(family.familyId);
      setCapsules(result.capsules);
      setClockOffset(new Date(result.serverNow).getTime() - Date.now());
    } catch (caught) {
      setError(caught instanceof TimeCapsulesApiError ? caught.message : 'We could not load your family time capsules.');
    }
  }, [family.familyId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let active = true;
    void getFamilyMemories(family.familyId).then((items) => { if (active) setMemories(items); }).catch(() => {});
    return () => { active = false; };
  }, [family.familyId]);

  useEffect(() => {
    const interval = setInterval(() => {
      const adjustedNow = Date.now() + clockOffset;
      setNow(adjustedNow);
      if (!unlockRefreshRef.current && capsules?.some((capsule) => capsule.isLocked && new Date(capsule.unlockAt).getTime() <= adjustedNow)) {
        unlockRefreshRef.current = true;
        void load().finally(() => { unlockRefreshRef.current = false; });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [capsules, clockOffset, load]);

  const locked = capsules?.filter((capsule) => capsule.isLocked) ?? [];
  const opened = capsules?.filter((capsule) => !capsule.isLocked).sort((a, b) => new Date(b.unlockAt).getTime() - new Date(a.unlockAt).getTime()) ?? [];

  return (
    <Screen scroll maxWidth={1040} contentStyle={styles.content}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <AppText variant="eyebrow" tone="secondary">Messages for the future</AppText>
          <AppText variant="display" style={styles.title}>Time Capsules</AppText>
          <AppText variant="body" tone="mutedText" style={styles.subtitle}>Seal a note and family memories until the moment is right.</AppText>
        </View>
        {!adding ? <Button label="Create capsule" onPress={() => setAdding(true)} /> : null}
      </View>

      {adding ? (
        <TimeCapsuleEditor
          familyId={family.familyId}
          memories={memories}
          onCancel={() => setAdding(false)}
          onSaved={async () => { setAdding(false); await load(); setShowSealedConfirmation(true); }}
        />
      ) : null}

      {showSealedConfirmation ? (
        <FadeInView distance={4} style={styles.confirmationWrap}>
          <Card style={[styles.confirmationCard, { backgroundColor: theme.successSoft }]}>
            <SuccessPulse><AppText variant="heading" tone="success">&#10003;</AppText></SuccessPulse>
            <AppText variant="body" tone="success" style={styles.confirmationCopy}>Your time capsule is sealed for the future.</AppText>
            <Button label="Dismiss" variant="quiet" onPress={() => setShowSealedConfirmation(false)} />
          </Card>
        </FadeInView>
      ) : null}

      {error ? (
        <Card style={[styles.errorCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{error}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      ) : null}

      {!capsules && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
          <AppText variant="caption" tone="mutedText" style={styles.loadingText}>Finding your family’s time capsules…</AppText>
        </View>
      ) : null}

      {capsules ? (
        <>
          <CapsuleSection
            title="Locked"
            detail="Sealed until their unlock moment"
            capsules={locked}
            now={now}
            isWide={isWide}
            empty="No locked capsules yet. Create one for a future family moment."
            familyId={family.familyId}
          />
          <CapsuleSection
            title="Opened / Ready"
            detail="These capsules are ready to revisit"
            capsules={opened}
            now={now}
            isWide={isWide}
            empty="Unlocked capsules will appear here."
            familyId={family.familyId}
          />
        </>
      ) : null}
    </Screen>
  );
}

function CapsuleSection({ title, detail, capsules, now, isWide, empty, familyId }: {
  title: string;
  detail: string;
  capsules: TimeCapsuleSummary[];
  now: number;
  isWide: boolean;
  empty: string;
  familyId: string;
}) {
  return (
    <View style={styles.section}>
      <AppText variant="eyebrow" tone={title === 'Locked' ? 'secondary' : 'success'}>{title}</AppText>
      <AppText variant="caption" tone="mutedText" style={styles.sectionDetail}>{detail}</AppText>
      {capsules.length ? (
        <View style={styles.grid}>
          {capsules.map((capsule) => <CapsuleCard key={capsule.id} capsule={capsule} now={now} isWide={isWide} familyId={familyId} />)}
        </View>
      ) : (
        <Card style={styles.emptyCard}><AppText variant="body" tone="mutedText">{empty}</AppText></Card>
      )}
    </View>
  );
}

function CapsuleCard({ capsule, now, isWide, familyId }: { capsule: TimeCapsuleSummary; now: number; isWide: boolean; familyId: string }) {
  const { colors: theme } = useAppTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${capsule.title}, ${capsule.isLocked ? 'locked' : 'ready to open'}`}
      onPress={() => router.push(`/(family)/capsules/${capsule.id}` as never)}
      style={[styles.cardPressable, isWide && styles.cardWide]}
    >
      <Card style={[styles.capsuleCard, { backgroundColor: capsule.isLocked ? theme.secondarySoft : theme.successSoft }]}>
        <View style={[styles.lockMark, { backgroundColor: capsule.isLocked ? theme.surface : theme.success }]}>
          <AppText variant="heading" style={{ color: capsule.isLocked ? theme.secondary : theme.textOnPrimary }}>{capsule.isLocked ? '⌛' : '✦'}</AppText>
        </View>
        <View style={styles.cardCopy}>
          <AppText variant="heading">{capsule.title}</AppText>
          <AppText variant="caption" tone="mutedText" style={styles.unlockDate}>
            {capsule.isLocked ? 'Unlocks' : 'Unlocked'} {formatUnlock(capsule.unlockAt)}
          </AppText>
          <View style={styles.creatorRow}>
            <MemberAvatar member={capsule.createdBy} familyId={familyId} size={24} />
            <AppText variant="caption" tone="mutedText">Created by {capsule.createdBy.displayName}</AppText>
          </View>
          <View style={[styles.statusPill, { backgroundColor: theme.surface }]}>
            <AppText variant="caption" tone={capsule.isLocked ? 'secondary' : 'success'}>
              {capsule.isLocked ? timeRemaining(capsule.unlockAt, now) : 'Ready to open'}
            </AppText>
          </View>
        </View>
      </Card>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xl },
  headingRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, justifyContent: 'space-between' },
  headingCopy: { flex: 1, minWidth: 240 },
  title: { marginTop: spacing.xs },
  subtitle: { marginTop: spacing.sm },
  errorCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.lg },
  confirmationWrap: { marginTop: spacing.lg },
  confirmationCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  confirmationCopy: { flex: 1 },
  loading: { alignItems: 'center', paddingVertical: spacing.xxxl },
  loadingText: { marginTop: spacing.md },
  section: { marginTop: spacing.xxl },
  sectionDetail: { marginTop: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  cardPressable: { width: '100%' },
  cardWide: { flexBasis: '48%', flexGrow: 1, maxWidth: 520 },
  capsuleCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, height: '100%' },
  lockMark: { alignItems: 'center', borderRadius: radius.md, height: 52, justifyContent: 'center', width: 52 },
  cardCopy: { flex: 1, minWidth: 0 },
  unlockDate: { marginTop: spacing.xs },
  creatorRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  statusPill: { alignSelf: 'flex-start', borderRadius: radius.pill, marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  emptyCard: { marginTop: spacing.md }
});
