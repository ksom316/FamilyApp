import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../../../components/AppText';
import { AuthorizedImage } from '../../../components/AuthorizedImage';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Screen } from '../../../components/Screen';
import { TimeCapsuleEditor } from '../../../components/TimeCapsuleEditor';
import { useCurrentFamily } from '../../../lib/family-context';
import { getFamilyMemories, memoryMediaPath, type FamilyMemory } from '../../../lib/memories';
import {
  deleteFamilyTimeCapsule,
  getFamilyTimeCapsule,
  privateCapsuleAttachmentMediaPath,
  TimeCapsulesApiError,
  type TimeCapsuleDetail
} from '../../../lib/time-capsules';

function formatUnlock(value: string) {
  return new Date(value).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function timeRemaining(unlockAt: string, now: number) {
  const remaining = Math.max(0, new Date(unlockAt).getTime() - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  if (days > 0) return `${days} days, ${hours} hours`;
  if (hours > 0) return `${hours} hours, ${minutes} minutes`;
  if (minutes > 0) return `${minutes} minutes, ${seconds} seconds`;
  return `${seconds} seconds`;
}

function BackLink() {
  return (
    <AppText accessibilityRole="link" onPress={() => router.replace('/(family)/capsules' as never)} variant="label" tone="primary" style={styles.backLink}>
      ‹ Back to Time Capsules
    </AppText>
  );
}

export default function TimeCapsuleDetailScreen() {
  const family = useCurrentFamily();
  const params = useLocalSearchParams<{ capsuleId: string }>();
  const capsuleId = Array.isArray(params.capsuleId) ? params.capsuleId[0] : params.capsuleId;
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const [capsule, setCapsule] = useState<TimeCapsuleDetail | null>(null);
  const [memories, setMemories] = useState<FamilyMemory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const unlockRefreshRef = useRef(false);
  const memoryWidth = width >= 760 ? '31%' : width >= 460 ? '48%' : '100%';

  const load = useCallback(async () => {
    if (!capsuleId) return;
    setError(null);
    try {
      const result = await getFamilyTimeCapsule(family.familyId, capsuleId);
      setCapsule(result.capsule);
      if (!result.capsule.isLocked) setEditing(false);
      setClockOffset(new Date(result.serverNow).getTime() - Date.now());
    } catch (caught) {
      setError(caught instanceof TimeCapsulesApiError ? caught.message : 'We could not open this time capsule.');
    }
  }, [capsuleId, family.familyId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const interval = setInterval(() => {
      const adjustedNow = Date.now() + clockOffset;
      setNow(adjustedNow);
      if (
        capsule?.isLocked &&
        new Date(capsule.unlockAt).getTime() <= adjustedNow &&
        !unlockRefreshRef.current
      ) {
        unlockRefreshRef.current = true;
        void load().finally(() => { unlockRefreshRef.current = false; });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [capsule, clockOffset, load]);

  async function beginEditing() {
    setEditing(true);
    try {
      setMemories(await getFamilyMemories(family.familyId));
    } catch {
      setMemories([]);
    }
  }

  function confirmDelete() {
    if (!capsule || busy) return;
    const remove = async () => {
      setBusy(true);
      setError(null);
      try {
        await deleteFamilyTimeCapsule(family.familyId, capsule.id);
        router.replace('/(family)/capsules' as never);
      } catch (caught) {
        setError(caught instanceof TimeCapsulesApiError ? caught.message : 'The time capsule could not be deleted.');
      } finally {
        setBusy(false);
      }
    };

    if (Platform.OS === 'web') {
      const confirmFn = (globalThis as typeof globalThis & { confirm?: (message: string) => boolean }).confirm;
      if (confirmFn?.('Delete this sealed time capsule? This cannot be undone.')) void remove();
      return;
    }
    Alert.alert('Delete time capsule?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void remove() }
    ]);
  }

  if (!capsule && !error) {
    return <Screen contentStyle={styles.state}><ActivityIndicator color={theme.primary} /><AppText variant="caption" tone="mutedText" style={styles.stateText}>Finding this time capsule…</AppText></Screen>;
  }

  if (!capsule) {
    return (
      <Screen scroll maxWidth={900} contentStyle={styles.content}>
        <BackLink />
        <Card style={[styles.errorCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{error}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      </Screen>
    );
  }

  const canManage = capsule.isLocked && (family.role !== 'member' || capsule.createdByMemberId === family.id);

  return (
    <Screen scroll maxWidth={900} contentStyle={styles.content}>
      <BackLink />

      {editing ? (
        <TimeCapsuleEditor
          capsule={capsule}
          familyId={family.familyId}
          memories={memories}
          onCancel={() => setEditing(false)}
          onSaved={async () => { setEditing(false); await load(); }}
        />
      ) : capsule.isLocked ? (
        <Card style={[styles.lockedCard, { backgroundColor: theme.secondarySoft }]}>
          <View style={[styles.heroMark, { backgroundColor: theme.surface }]}><AppText variant="display" tone="secondary">⌛</AppText></View>
          <AppText variant="eyebrow" tone="secondary">Sealed for the future</AppText>
          <AppText variant="title" align="center" style={styles.capsuleTitle}>{capsule.title}</AppText>
          <View style={styles.creatorRow}>
            <Avatar name={capsule.createdBy.displayName} imageUrl={capsule.createdBy.avatar} size={32} />
            <AppText variant="caption" tone="mutedText">Created by {capsule.createdBy.displayName}</AppText>
          </View>
          <AppText variant="body" align="center" style={styles.unlockDate}>Unlocks {formatUnlock(capsule.unlockAt)}</AppText>
          <View style={[styles.countdown, { backgroundColor: theme.surface }]}>
            <AppText variant="caption" tone="mutedText">TIME REMAINING</AppText>
            <AppText variant="heading" tone="secondary" align="center" style={styles.countdownValue}>{timeRemaining(capsule.unlockAt, now)}</AppText>
          </View>
          <AppText variant="caption" tone="mutedText" align="center" style={styles.sealedNote}>
            The message and attached memories stay private until the server unlocks this capsule.
          </AppText>
          {error ? <AppText variant="caption" tone="danger" style={styles.inlineError}>{error}</AppText> : null}
          <View style={styles.lockedActions}>
            <Button label="Check now" variant="secondary" disabled={busy} onPress={() => void load()} />
            {canManage ? <Button label="Edit" variant="quiet" disabled={busy} onPress={() => void beginEditing()} /> : null}
            {canManage ? <Button label="Delete" variant="quiet" loading={busy} onPress={confirmDelete} /> : null}
          </View>
        </Card>
      ) : (
        <>
          <Card style={[styles.openedHero, { backgroundColor: theme.successSoft }]}>
            <View style={[styles.openedMark, { backgroundColor: theme.success }]}><AppText variant="title" style={{ color: theme.textOnPrimary }}>✦</AppText></View>
            <AppText variant="eyebrow" tone="success">Opened time capsule</AppText>
            <AppText variant="title" align="center" style={styles.capsuleTitle}>{capsule.title}</AppText>
            <View style={styles.creatorRow}>
              <Avatar name={capsule.createdBy.displayName} imageUrl={capsule.createdBy.avatar} size={32} />
              <AppText variant="caption" tone="mutedText">Created by {capsule.createdBy.displayName}</AppText>
            </View>
            <AppText variant="caption" tone="mutedText" align="center" style={styles.openedDate}>Unlocked {formatUnlock(capsule.unlockAt)}</AppText>
          </Card>

          <Card style={styles.messageCard}>
            <AppText variant="eyebrow" tone="primary">A message from the past</AppText>
            {capsule.message
              ? <AppText variant="body" style={styles.message}>{capsule.message}</AppText>
              : <AppText variant="body" tone="mutedText" style={styles.message}>This capsule was sealed without a written message.</AppText>}
          </Card>

          {capsule.privateAttachments.length ? (
            <View style={styles.memoriesSection}>
              <AppText variant="heading">Private photos</AppText>
              <AppText variant="caption" tone="mutedText" style={styles.memoriesDetail}>
                These sealed photos became available when the capsule unlocked. They have not been added to Memories.
              </AppText>
              <View style={styles.memoryGrid}>
                {capsule.privateAttachments.map((attachment, index) => (
                  <Card key={attachment.id} padded={false} style={[styles.privatePhotoCard, { width: memoryWidth }]}>
                    <AuthorizedImage
                      path={privateCapsuleAttachmentMediaPath(attachment.familyId, attachment.capsuleId, attachment.id)}
                      resizeMode="contain"
                      style={styles.privatePhoto}
                    />
                    <View style={styles.memoryCopy}>
                      <AppText variant="label">Private photo {index + 1}</AppText>
                    </View>
                  </Card>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.memoriesSection}>
            <AppText variant="heading">Memories inside</AppText>
            <AppText variant="caption" tone="mutedText" style={styles.memoriesDetail}>Open any photo to revisit the full family memory.</AppText>
            {capsule.memories.length ? (
              <View style={styles.memoryGrid}>
                {capsule.memories.map((memory) => (
                  <Pressable
                    key={memory.id}
                    accessibilityRole="button"
                    onPress={() => router.push(`/(family)/memories/${memory.id}` as never)}
                    style={{ width: memoryWidth }}
                  >
                    <Card padded={false} style={styles.memoryCard}>
                      <AuthorizedImage path={memoryMediaPath(memory.familyId, memory.id)} style={styles.memoryImage} />
                      <View style={styles.memoryCopy}>
                        <AppText variant="label">{memory.title ?? 'Untitled memory'}</AppText>
                        <AppText variant="caption" tone="mutedText" style={styles.memoryMeta}>
                          {new Date(`${memory.memoryDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </AppText>
                      </View>
                    </Card>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Card style={styles.noMemories}><AppText variant="body" tone="mutedText">No memories were attached to this capsule.</AppText></Card>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xl },
  state: { alignItems: 'center', justifyContent: 'center' },
  stateText: { marginTop: spacing.md },
  backLink: { marginBottom: spacing.lg },
  errorCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  lockedCard: { alignItems: 'center', padding: spacing.xxl },
  heroMark: { alignItems: 'center', borderRadius: radius.pill, height: 96, justifyContent: 'center', marginBottom: spacing.lg, width: 96 },
  capsuleTitle: { marginTop: spacing.sm, maxWidth: 700 },
  creatorRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.lg },
  unlockDate: { marginTop: spacing.lg, maxWidth: 660 },
  countdown: { alignItems: 'center', borderRadius: radius.lg, marginTop: spacing.lg, minWidth: 240, padding: spacing.lg },
  countdownValue: { marginTop: spacing.xs },
  sealedNote: { marginTop: spacing.lg, maxWidth: 540 },
  inlineError: { marginTop: spacing.md },
  lockedActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.lg },
  openedHero: { alignItems: 'center', padding: spacing.xl },
  openedMark: { alignItems: 'center', borderRadius: radius.pill, height: 64, justifyContent: 'center', marginBottom: spacing.md, width: 64 },
  openedDate: { marginTop: spacing.md },
  messageCard: { marginTop: spacing.lg, padding: spacing.xl },
  message: { fontSize: 18, lineHeight: 30, marginTop: spacing.md },
  memoriesSection: { marginTop: spacing.xl },
  memoriesDetail: { marginTop: spacing.xs },
  memoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  memoryCard: { overflow: 'hidden' },
  memoryImage: { aspectRatio: 1.25, width: '100%' },
  privatePhotoCard: { overflow: 'hidden' },
  privatePhoto: { aspectRatio: 1.25, backgroundColor: '#111111', width: '100%' },
  memoryCopy: { padding: spacing.md },
  memoryMeta: { marginTop: spacing.xs },
  noMemories: { marginTop: spacing.md }
});
