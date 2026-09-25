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
import { createShoppingList, getShoppingLists, ShoppingApiError, type ShoppingListSummary } from '../../../lib/shopping';

const POLL_INTERVAL_MS = 20_000;

function formatShoppingDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function ShoppingScreen() {
  const family = useCurrentFamily();
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const [lists, setLists] = useState<ShoppingListSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const [creating, setCreating] = useState(false);

  const focusedRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (!focusedRef.current || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const next = await getShoppingLists(family.familyId);
      if (focusedRef.current) { setLists(next); setError(null); }
    } catch (err) {
      if (focusedRef.current) setError(err instanceof ShoppingApiError ? err.message : 'We could not load your shopping lists.');
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

  const activeLists = lists?.filter((list) => !list.isCompleted) ?? [];
  const completedLists = lists?.filter((list) => list.isCompleted) ?? [];
  const visible = tab === 'active' ? activeLists : completedLists;

  return (
    <Screen scroll maxWidth={880} contentStyle={styles.content}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <AppText variant="eyebrow" tone="secondary">Shop together</AppText>
          <AppText variant="display" style={styles.title}>Shopping Lists</AppText>
          <AppText variant="body" tone="mutedText" style={styles.subtitle}>For the whole family, or just for one of your groups.</AppText>
        </View>
        {!creating ? <Button label="New list" onPress={() => setCreating(true)} /> : null}
      </View>

      {creating ? (
        <NewListEditor
          familyId={family.familyId}
          myMemberId={family.id}
          onCancel={() => setCreating(false)}
          onCreated={async (listId) => { setCreating(false); await load(); router.push(`/(family)/shopping/${listId}` as never); }}
        />
      ) : null}

      {error ? (
        <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{error}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      ) : null}

      {!lists && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
          <AppText variant="caption" tone="mutedText" style={styles.loadingText}>Gathering your shopping lists…</AppText>
        </View>
      ) : null}

      {lists ? (
        <>
          <View style={styles.segmentRow}>
            <Segment label={`Active (${activeLists.length})`} active={tab === 'active'} onPress={() => setTab('active')} />
            <Segment label={`Completed (${completedLists.length})`} active={tab === 'completed'} onPress={() => setTab('completed')} />
          </View>

          {visible.length === 0 ? (
            <Card style={[styles.empty, { backgroundColor: theme.secondarySoft }]}>
              <AppText variant="title" tone="secondary">▣</AppText>
              <AppText variant="heading" style={styles.emptyTitle}>{tab === 'active' ? 'No active lists' : 'No completed lists yet'}</AppText>
              <AppText variant="body" tone="mutedText" align="center" style={styles.emptyDetail}>
                {tab === 'active' ? 'Start a list for the family or one of your groups.' : 'Finished lists will show up here.'}
              </AppText>
            </Card>
          ) : (
            <View style={styles.list}>
              {visible.map((list) => <ListCard key={list.id} list={list} />)}
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

function ListCard({ list }: { list: ShoppingListSummary }) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const targetLabel = list.household ? list.household.name : 'Whole family';
  const targetColor = list.household ? theme.secondarySoft : theme.primarySoft;
  const targetTone = list.household ? 'secondary' : 'primary';
  const percentage = list.totalItems > 0 ? Math.round((list.purchasedItems / list.totalItems) * 100) : 0;

  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/(family)/shopping/${list.id}` as never)}>
      <Card style={styles.listCard}>
        <View style={styles.listHeader}>
          <AppText variant="label" style={styles.listName}>{list.name}</AppText>
          <View style={[styles.targetBadge, { backgroundColor: targetColor }]}><AppText variant="caption" tone={targetTone}>{targetLabel}</AppText></View>
        </View>
        <View style={styles.personRow}>
          <Avatar name={list.createdBy.displayName} imageUrl={list.createdBy.avatar} size={20} />
          <AppText variant="caption" tone="mutedText">{list.createdBy.displayName}{list.shoppingDate ? ` · ${formatShoppingDate(list.shoppingDate)}` : ''}</AppText>
        </View>
        {list.totalItems > 0 ? (
          <>
            <AppText variant="caption" tone="mutedText" style={styles.progressLabel}>{list.purchasedItems} of {list.totalItems} items purchased</AppText>
            <View style={[styles.barTrack, { backgroundColor: theme.border }]}>
              <View style={[styles.barFill, { width: `${percentage}%`, backgroundColor: theme.success }]} />
            </View>
          </>
        ) : (
          <AppText variant="caption" tone="mutedText" style={styles.progressLabel}>No items yet</AppText>
        )}
      </Card>
    </Pressable>
  );
}

function NewListEditor({ familyId, myMemberId, onCancel, onCreated }: {
  familyId: string;
  myMemberId: string;
  onCancel: () => void;
  onCreated: (listId: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState<'family' | string>('family');
  const [myHouseholds, setMyHouseholds] = useState<Household[]>([]);
  const [shoppingDateIso, setShoppingDateIso] = useState<string | null>(null);
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

  async function save() {
    if (savingRef.current) return;
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Give your list a name.'); return; }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const list = await createShoppingList(familyId, {
        name: trimmedName,
        description: description.trim() || undefined,
        shoppingDate: shoppingDateIso ?? undefined,
        householdId: target === 'family' ? undefined : target
      });
      await onCreated(list.id);
    } catch (err) {
      setError(err instanceof ShoppingApiError ? err.message : 'That list could not be created.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Card elevated style={styles.editor}>
      <AppText variant="heading">New shopping list</AppText>
      <TextField label="List name" value={name} onChangeText={setName} maxLength={100} placeholder="Weekly Groceries" autoFocus />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} maxLength={1000} multiline />

      <AppText variant="label" style={styles.fieldLabel}>Who is this for?</AppText>
      <View style={styles.targetChips}>
        <Segment label="Entire family" active={target === 'family'} onPress={() => setTarget('family')} />
        {myHouseholds.map((household) => (
          <Segment key={household.id} label={household.name} active={target === household.id} onPress={() => setTarget(household.id)} />
        ))}
      </View>

      <DateTimeField label="Shopping date (optional)" value={shoppingDateIso} onChange={setShoppingDateIso} hint="Leave empty for no date" />

      {error ? <AppText variant="caption" tone="danger" style={styles.formError}>{error}</AppText> : null}
      <View style={styles.formActions}>
        <Button label="Cancel" variant="quiet" onPress={onCancel} disabled={saving} />
        <Button label="Create list" loading={saving} onPress={() => void save()} />
      </View>
    </Card>
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
  listCard: { gap: spacing.sm },
  listHeader: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' },
  listName: { flex: 1, minWidth: 160 },
  targetBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  personRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  progressLabel: { marginTop: spacing.xs },
  barTrack: { borderRadius: radius.pill, height: 6, marginTop: spacing.xs, overflow: 'hidden' },
  barFill: { borderRadius: radius.pill, height: '100%' },
  editor: { marginTop: spacing.xl, padding: spacing.xl },
  fieldLabel: { marginTop: spacing.lg },
  targetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  formError: { marginTop: spacing.md },
  formActions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.lg }
});
