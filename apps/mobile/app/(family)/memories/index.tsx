import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../../../components/AppText';
import { AuthorizedImage } from '../../../components/AuthorizedImage';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { MemoryEditor } from '../../../components/MemoryEditor';
import { Screen } from '../../../components/Screen';
import { useCurrentFamily } from '../../../lib/family-context';
import {
  favoriteFamilyMemory,
  getFamilyMemories,
  memoryMediaPath,
  MemoriesApiError,
  unfavoriteFamilyMemory,
  type FamilyMemory
} from '../../../lib/memories';

function formatMemoryDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function groupByMonth(memories: FamilyMemory[]) {
  const groups: { key: string; label: string; items: FamilyMemory[] }[] = [];
  for (const memory of memories) {
    const date = new Date(`${memory.memoryDate}T00:00:00`);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    let group = groups.find((candidate) => candidate.key === key);
    if (!group) {
      group = { key, label: date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), items: [] };
      groups.push(group);
    }
    group.items.push(memory);
  }
  return groups;
}

export default function MemoriesScreen() {
  const family = useCurrentFamily();
  const { width } = useWindowDimensions();
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const [memories, setMemories] = useState<FamilyMemory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<'gallery' | 'timeline'>('gallery');

  const load = useCallback(async () => {
    setError(null);
    try {
      setMemories(await getFamilyMemories(family.familyId));
    } catch (err) {
      setError(err instanceof MemoriesApiError ? err.message : 'We could not load your family memories.');
    }
  }, [family.familyId]);

  useEffect(() => { void load(); }, [load]);

  const shellWidth = width >= 900 ? width - 264 : width;
  const horizontalPadding = width >= 900 ? spacing.xxl * 2 : spacing.lg * 2;
  const contentWidth = Math.max(240, Math.min(1080, shellWidth - horizontalPadding));

  function openMemory(memory: FamilyMemory) {
    router.push(`/(family)/memories/${memory.id}` as never);
  }

  async function toggleFavorite(memory: FamilyMemory) {
    const next = !memory.isFavorited;
    setMemories((current) => current?.map((item) => item.id === memory.id
      ? { ...item, isFavorited: next, favoritesCount: item.favoritesCount + (next ? 1 : -1) }
      : item) ?? current);
    try {
      if (next) await favoriteFamilyMemory(family.familyId, memory.id);
      else await unfavoriteFamilyMemory(family.familyId, memory.id);
    } catch {
      setMemories((current) => current?.map((item) => item.id === memory.id ? memory : item) ?? current);
    }
  }

  const groups = memories ? groupByMonth(memories) : [];

  return (
    <Screen scroll maxWidth={1080} contentStyle={styles.content}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <AppText variant="eyebrow" tone="secondary">Shared family album</AppText>
          <AppText variant="display" style={styles.title}>Memories</AppText>
          <AppText variant="body" tone="mutedText" style={styles.subtitle}>The moments your family wants to hold on to.</AppText>
        </View>
        {!adding ? <Button label="Add memory" onPress={() => setAdding(true)} /> : null}
      </View>

      {adding ? (
        <MemoryEditor
          familyId={family.familyId}
          onCancel={() => setAdding(false)}
          onSaved={async () => { setAdding(false); await load(); }}
        />
      ) : null}

      {error ? (
        <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{error}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      ) : null}

      {!memories && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
          <AppText variant="caption" tone="mutedText" style={styles.loadingText}>Gathering your family memories…</AppText>
        </View>
      ) : null}

      {memories && memories.length > 0 ? (
        <>
          <View style={styles.segmentRow}>
            <Segment label="Gallery" active={view === 'gallery'} onPress={() => setView('gallery')} />
            <Segment label="Timeline" active={view === 'timeline'} onPress={() => setView('timeline')} />
          </View>

          {view === 'gallery' ? (
            <MemoryGrid memories={memories} contentWidth={contentWidth} onOpen={openMemory} onToggleFavorite={toggleFavorite} />
          ) : (
            <View style={styles.timeline}>
              {groups.map((group) => (
                <View key={group.key} style={styles.timelineGroup}>
                  <AppText variant="heading" style={styles.timelineHeading}>{group.label}</AppText>
                  <MemoryGrid memories={group.items} contentWidth={contentWidth} onOpen={openMemory} onToggleFavorite={toggleFavorite} />
                </View>
              ))}
            </View>
          )}
        </>
      ) : null}

      {memories && memories.length === 0 && !adding ? (
        <Card style={[styles.empty, { backgroundColor: theme.secondarySoft }]}>
          <AppText variant="title" tone="secondary">✳</AppText>
          <AppText variant="heading" style={styles.emptyTitle}>Save your first memory</AppText>
          <AppText variant="body" tone="mutedText" align="center" style={styles.emptyDetail}>
            A photo from today, or one from years ago — this is where your family’s moments will live.
          </AppText>
          <Button label="Add memory" onPress={() => setAdding(true)} style={styles.emptyButton} />
        </Card>
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

function MemoryGrid({ memories, contentWidth, onOpen, onToggleFavorite }: {
  memories: FamilyMemory[];
  contentWidth: number;
  onOpen: (memory: FamilyMemory) => void;
  onToggleFavorite: (memory: FamilyMemory) => void;
}) {
  const columns = contentWidth >= 900 ? 4 : contentWidth >= 620 ? 3 : contentWidth >= 380 ? 2 : 1;
  const gap = spacing.md;
  const cardWidth = (contentWidth - gap * (columns - 1)) / columns;

  return (
    <View style={styles.grid}>
      {memories.map((memory) => (
        <MemoryCard
          key={memory.id}
          memory={memory}
          width={cardWidth}
          onOpen={() => onOpen(memory)}
          onToggleFavorite={() => onToggleFavorite(memory)}
        />
      ))}
    </View>
  );
}

function MemoryCard({ memory, width, onOpen, onToggleFavorite }: { memory: FamilyMemory; width: number; onOpen: () => void; onToggleFavorite: () => void }) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <Pressable accessibilityRole="button" onPress={onOpen} style={{ width }}>
      <Card padded={false} style={styles.card}>
        <View style={styles.imageWrap}>
          <AuthorizedImage path={memoryMediaPath(memory.familyId, memory.id)} style={styles.image} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={memory.isFavorited ? 'Remove favorite' : 'Add favorite'}
            onPress={(event) => { event.stopPropagation(); onToggleFavorite(); }}
            style={styles.favoriteButton}
            hitSlop={8}
          >
            <AppText variant="label" style={{ color: memory.isFavorited ? theme.danger : '#FFFFFF' }}>{memory.isFavorited ? '♥' : '♡'}</AppText>
          </Pressable>
        </View>
        <View style={styles.cardBody}>
          {memory.title
            ? <AppText variant="label" numberOfLines={1}>{memory.title}</AppText>
            : <AppText variant="label" tone="mutedText" numberOfLines={1}>Untitled memory</AppText>}
          <AppText variant="caption" tone="mutedText" style={styles.cardDate}>{formatMemoryDate(memory.memoryDate)}</AppText>
          <View style={styles.personRow}>
            <Avatar name={memory.sharedBy.displayName} imageUrl={memory.sharedBy.avatar} size={18} />
            <AppText variant="caption" tone="mutedText" numberOfLines={1}>{memory.sharedBy.displayName}</AppText>
          </View>
        </View>
      </Card>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg },
  card: { overflow: 'hidden' },
  imageWrap: { aspectRatio: 1, position: 'relative' },
  image: { height: '100%', width: '100%' },
  favoriteButton: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: radius.pill, height: 32, justifyContent: 'center', position: 'absolute', right: spacing.sm, top: spacing.sm, width: 32 },
  cardBody: { gap: spacing.xs, padding: spacing.md },
  cardDate: { marginTop: 2 },
  personRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  timeline: { marginTop: spacing.lg },
  timelineGroup: { marginTop: spacing.xl },
  timelineHeading: { marginBottom: spacing.xs },
  empty: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl, padding: spacing.xxl },
  emptyTitle: { marginTop: spacing.md },
  emptyDetail: { marginTop: spacing.sm, maxWidth: 420 },
  emptyButton: { marginTop: spacing.lg }
});
