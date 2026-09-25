import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DateTimeField } from '../../components/DateTimeField';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useCurrentFamily } from '../../lib/family-context';
import { getFamilyHousehold, getFamilyHouseholds, type Household } from '../../lib/households';
import {
  clearMeal,
  copyPreviousWeek,
  createMenu,
  createShoppingListFromMenu,
  deleteMenu,
  getMenuForTarget,
  MenuApiError,
  setMeal,
  updateMenu,
  type Meal,
  type MealType,
  type Menu,
  type MenuForTarget
} from '../../lib/menus';

const POLL_INTERVAL_MS = 20_000;
const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];
const MEAL_LABELS: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function formatLocalDateOnly(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function mondayOfLocalDate(date: Date) {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const result = new Date(date);
  result.setDate(result.getDate() + diff);
  return result;
}

function addLocalDays(dateStr: string, days: number) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatLocalDateOnly(date);
}

function toLocalDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDayHeading(dateStr: string) {
  return toLocalDate(dateStr).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatWeekRange(startStr: string, endStr: string) {
  const format = (value: Date) => value.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${format(toLocalDate(startStr))} – ${format(toLocalDate(endStr))}`;
}

function todayLocalDateString() {
  return formatLocalDateOnly(new Date());
}

function findMeal(menu: Menu | null, date: string, type: MealType) {
  return menu?.meals.find((meal) => meal.mealDate === date && meal.mealType === type) ?? null;
}

export default function MenuScreen() {
  const family = useCurrentFamily();
  const { width } = useWindowDimensions();
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const isWide = width >= 760;

  const defaultWeekStart = formatLocalDateOnly(mondayOfLocalDate(new Date()));
  const [target, setTarget] = useState<'family' | string>('family');
  const [myHouseholds, setMyHouseholds] = useState<Household[]>([]);
  const [weekStartDate, setWeekStartDate] = useState(defaultWeekStart);
  const [result, setResult] = useState<MenuForTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingMenu, setEditingMenu] = useState(false);
  const [editingSlot, setEditingSlot] = useState<{ date: string; type: MealType } | null>(null);
  const [busy, setBusy] = useState(false);

  const focusedRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        const all = await getFamilyHouseholds(family.familyId);
        const details = await Promise.all(all.map((household) => getFamilyHousehold(family.familyId, household.id).catch(() => null)));
        setMyHouseholds(
          details
            .filter((detail): detail is NonNullable<typeof detail> => detail !== null && detail.members.some((member) => member.memberId === family.id))
            .map((detail) => ({ ...detail.household, memberCount: detail.members.length }))
        );
      } catch {
        // Falls back to "Entire family" only.
      }
    })();
  }, [family.familyId, family.id]);

  const load = useCallback(async () => {
    if (!focusedRef.current || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const householdId = target === 'family' ? null : target;
      const next = await getMenuForTarget(family.familyId, householdId, weekStartDate);
      if (focusedRef.current) { setResult(next); setError(null); }
    } catch (err) {
      if (focusedRef.current) setError(err instanceof MenuApiError ? err.message : 'We could not load the family menu.');
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [family.familyId, target, weekStartDate]);

  useEffect(() => { setResult(null); }, [target, weekStartDate]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      focusedRef.current = false;
      clearInterval(interval);
    };
  }, [load]));

  async function handleCreate(title: string, copyPrevious: boolean) {
    setBusy(true);
    setError(null);
    try {
      const menu = await createMenu(family.familyId, { householdId: target === 'family' ? undefined : target, weekStartDate, title: title || undefined });
      if (copyPrevious) await copyPreviousWeek(family.familyId, menu.id);
      setCreating(false);
      await load();
    } catch (err) {
      setError(err instanceof MenuApiError ? err.message : 'This menu could not be created.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveMeal(menu: Menu, date: string, type: MealType, mealName: string, note: string) {
    const updated = await setMeal(family.familyId, menu.id, { mealDate: date, mealType: type, mealName, note: note || undefined });
    setResult((current) => (current ? { ...current, menu: updated } : current));
    setEditingSlot(null);
  }

  async function handleClearMeal(menu: Menu, date: string, type: MealType) {
    const updated = await clearMeal(family.familyId, menu.id, date, type);
    setResult((current) => (current ? { ...current, menu: updated } : current));
    setEditingSlot(null);
  }

  async function handleCopyPrevious(menu: Menu) {
    setBusy(true);
    setError(null);
    try {
      const updated = await copyPreviousWeek(family.familyId, menu.id);
      setResult((current) => (current ? { ...current, menu: updated } : current));
    } catch (err) {
      setError(err instanceof MenuApiError ? err.message : 'The previous week could not be copied.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateShoppingList(menu: Menu) {
    setBusy(true);
    setError(null);
    try {
      const list = await createShoppingListFromMenu(family.familyId, menu.id);
      router.push(`/(family)/shopping/${list.id}` as never);
    } catch (err) {
      setError(err instanceof MenuApiError ? err.message : 'A shopping list could not be created.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDeleteMenu(menu: Menu) {
    const run = async () => {
      setBusy(true);
      try {
        await deleteMenu(family.familyId, menu.id);
        await load();
      } catch (err) {
        setError(err instanceof MenuApiError ? err.message : 'This menu could not be deleted.');
      } finally {
        setBusy(false);
      }
    };
    if (Platform.OS === 'web') {
      const confirmFn = (globalThis as typeof globalThis & { confirm?: (message: string) => boolean }).confirm;
      if (confirmFn?.('Delete this menu? This cannot be undone.')) void run();
      return;
    }
    Alert.alert('Delete menu?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run() }
    ]);
  }

  const isCurrentWeek = weekStartDate === defaultWeekStart;
  const today = todayLocalDateString();
  const menu = result?.menu ?? null;
  const weekStart = result?.weekStartDate ?? weekStartDate;
  const weekEnd = result?.weekEndDate ?? addLocalDays(weekStartDate, 6);
  const days = Array.from({ length: 7 }, (_, index) => addLocalDays(weekStart, index));

  return (
    <Screen scroll maxWidth={960} contentStyle={styles.content}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <AppText variant="eyebrow" tone="secondary">Plan meals together</AppText>
          <AppText variant="display" style={styles.title}>Family Menu</AppText>
          <AppText variant="body" tone="mutedText" style={styles.subtitle}>Breakfast, lunch, and dinner for the week ahead.</AppText>
        </View>
      </View>

      <View style={styles.targetChips}>
        <Segment label="Entire family" active={target === 'family'} onPress={() => setTarget('family')} />
        {myHouseholds.map((household) => (
          <Segment key={household.id} label={household.name} active={target === household.id} onPress={() => setTarget(household.id)} />
        ))}
      </View>

      <Card style={styles.weekNavCard}>
        <View style={styles.weekNavRow}>
          <Button label="‹ Previous" variant="quiet" onPress={() => setWeekStartDate((current) => addLocalDays(current, -7))} />
          <View style={styles.weekLabel}>
            <AppText variant="label">{formatWeekRange(weekStart, weekEnd)}</AppText>
            {isCurrentWeek ? <AppText variant="caption" tone="primary">This week</AppText> : null}
          </View>
          <Button label="Next ›" variant="quiet" onPress={() => setWeekStartDate((current) => addLocalDays(current, 7))} />
        </View>
        {!isCurrentWeek ? <Button label="Back to this week" variant="quiet" onPress={() => setWeekStartDate(defaultWeekStart)} style={styles.thisWeekButton} /> : null}
        <DateTimeField
          label="Choose a week"
          value={`${weekStart}T00:00:00.000Z`}
          onChange={(iso) => { if (iso) setWeekStartDate(formatLocalDateOnly(mondayOfLocalDate(new Date(iso)))); }}
          hint="Pick any date — we’ll jump to that week"
        />
      </Card>

      {error ? (
        <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{error}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      ) : null}

      {!result && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
          <AppText variant="caption" tone="mutedText" style={styles.loadingText}>Gathering the family menu…</AppText>
        </View>
      ) : null}

      {result && !menu ? (
        creating ? (
          <CreateMenuCard hasPrevious={result.hasPreviousMenu} busy={busy} onCancel={() => setCreating(false)} onCreate={handleCreate} />
        ) : (
          <Card style={[styles.empty, { backgroundColor: theme.secondarySoft }]}>
            <AppText variant="title" tone="secondary">▨</AppText>
            <AppText variant="heading" style={styles.emptyTitle}>No menu yet for this week</AppText>
            <AppText variant="body" tone="mutedText" align="center" style={styles.emptyDetail}>
              {target === 'family' ? 'Create one for the whole family.' : 'Create one for this group.'}
            </AppText>
            <Button label="Create menu for this week" onPress={() => setCreating(true)} style={styles.emptyButton} />
          </Card>
        )
      ) : null}

      {menu ? (
        <>
          {isCurrentWeek ? <TodayCard menu={menu} today={today} onEdit={(type) => setEditingSlot({ date: today, type })} /> : null}

          <View style={styles.menuActions}>
            <View style={[styles.targetBadge, { backgroundColor: menu.household ? theme.secondarySoft : theme.primarySoft }]}>
              <AppText variant="caption" tone={menu.household ? 'secondary' : 'primary'}>{menu.household ? menu.household.name : 'Whole family'}</AppText>
            </View>
            {menu.title ? <AppText variant="label">{menu.title}</AppText> : null}
            <View style={styles.personRow}>
              <Avatar name={menu.createdBy.displayName} imageUrl={menu.createdBy.avatar} size={20} />
              <AppText variant="caption" tone="mutedText">Started by {menu.createdBy.displayName}</AppText>
            </View>
          </View>

          {editingMenu ? (
            <MenuMetaEditor
              menu={menu}
              onCancel={() => setEditingMenu(false)}
              onSaved={(next) => { setResult((current) => (current ? { ...current, menu: next } : current)); setEditingMenu(false); }}
              familyId={family.familyId}
            />
          ) : (
            <View style={styles.actionRow}>
              {result?.hasPreviousMenu ? <Button label="Copy previous week" variant="secondary" disabled={busy} onPress={() => void handleCopyPrevious(menu)} /> : null}
              <Button label="Create shopping list" variant="secondary" disabled={busy} onPress={() => void handleCreateShoppingList(menu)} />
              {menu.createdByMemberId === family.id ? (
                <>
                  <Button label="Rename menu" variant="quiet" disabled={busy} onPress={() => setEditingMenu(true)} />
                  <Button label="Delete menu" variant="quiet" disabled={busy} onPress={() => confirmDeleteMenu(menu)} />
                </>
              ) : null}
            </View>
          )}

          <View style={[styles.weekGrid, isWide && styles.weekGridWide]}>
            {days.map((date) => (
              <DayCard
                key={date}
                date={date}
                isToday={date === today}
                menu={menu}
                editingType={editingSlot?.date === date ? editingSlot.type : null}
                onStartEdit={(type) => setEditingSlot({ date, type })}
                onCancelEdit={() => setEditingSlot(null)}
                onSave={(type, name, note) => handleSaveMeal(menu, date, type, name, note)}
                onClear={(type) => handleClearMeal(menu, date, type)}
              />
            ))}
          </View>
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
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.segment, { backgroundColor: active ? theme.primarySoft : theme.input, borderColor: active ? theme.primary : theme.border }]}
    >
      <AppText variant="label" tone={active ? 'primary' : 'text'}>{label}</AppText>
    </Pressable>
  );
}

function TodayCard({ menu, today, onEdit }: { menu: Menu; today: string; onEdit: (type: MealType) => void }) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <Card elevated style={[styles.todayCard, { backgroundColor: theme.primarySoft, borderColor: theme.primary }]}>
      <AppText variant="eyebrow" tone="primary">Today · {formatDayHeading(today)}</AppText>
      <View style={styles.todayMeals}>
        {MEAL_TYPES.map((type) => {
          const meal = findMeal(menu, today, type);
          return (
            <Pressable key={type} accessibilityRole="button" onPress={() => onEdit(type)} style={styles.todayMealRow}>
              <AppText variant="label" tone="primary">{MEAL_LABELS[type]}</AppText>
              <AppText variant="body" tone={meal ? 'text' : 'mutedText'}>{meal ? meal.mealName : `No ${type} planned yet.`}</AppText>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

function DayCard({ date, isToday, menu, editingType, onStartEdit, onCancelEdit, onSave, onClear }: {
  date: string;
  isToday: boolean;
  menu: Menu;
  editingType: MealType | null;
  onStartEdit: (type: MealType) => void;
  onCancelEdit: () => void;
  onSave: (type: MealType, name: string, note: string) => Promise<void>;
  onClear: (type: MealType) => Promise<void>;
}) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <Card style={[styles.dayCard, isToday && { borderColor: theme.primary }]}>
      <AppText variant="label" tone={isToday ? 'primary' : 'text'}>{formatDayHeading(date)}</AppText>
      <View style={styles.mealList}>
        {MEAL_TYPES.map((type) => {
          const meal = findMeal(menu, date, type);
          if (editingType === type) {
            return <MealSlotEditor key={type} type={type} meal={meal} onCancel={onCancelEdit} onSave={(name, note) => onSave(type, name, note)} onClear={() => onClear(type)} />;
          }
          return (
            <Pressable key={type} accessibilityRole="button" onPress={() => onStartEdit(type)} style={[styles.mealRow, { borderColor: theme.border }]}>
              <AppText variant="caption" tone="mutedText">{MEAL_LABELS[type]}</AppText>
              <AppText variant="body" tone={meal ? 'text' : 'mutedText'} numberOfLines={2}>{meal ? meal.mealName : 'Tap to plan'}</AppText>
              {meal?.note ? <AppText variant="caption" tone="mutedText" numberOfLines={2}>{meal.note}</AppText> : null}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

function MealSlotEditor({ type, meal, onCancel, onSave, onClear }: {
  type: MealType;
  meal: Meal | null;
  onCancel: () => void;
  onSave: (name: string, note: string) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [name, setName] = useState(meal?.mealName ?? '');
  const [note, setNote] = useState(meal?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function save() {
    if (savingRef.current) return;
    const trimmed = name.trim();
    if (!trimmed) { setError('Enter a meal name, or use Clear.'); return; }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed, note.trim());
    } catch (err) {
      setError(err instanceof MenuApiError ? err.message : 'That meal could not be saved.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function clear() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await onClear();
    } catch (err) {
      setError(err instanceof MenuApiError ? err.message : 'That meal could not be cleared.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <View style={styles.mealEditor}>
      <AppText variant="caption" tone="mutedText">{MEAL_LABELS[type]}</AppText>
      <TextField label="Meal" value={name} onChangeText={setName} maxLength={140} autoFocus placeholder="Jollof rice and chicken" />
      <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={300} />
      {error ? <AppText variant="caption" tone="danger" style={styles.formError}>{error}</AppText> : null}
      <View style={styles.mealEditorActions}>
        <Button label="Cancel" variant="quiet" onPress={onCancel} disabled={saving} />
        {meal ? <Button label="Clear" variant="quiet" loading={saving} onPress={() => void clear()} /> : null}
        <Button label="Save" loading={saving} onPress={() => void save()} />
      </View>
    </View>
  );
}

function CreateMenuCard({ hasPrevious, busy, onCancel, onCreate }: {
  hasPrevious: boolean;
  busy: boolean;
  onCancel: () => void;
  onCreate: (title: string, copyPrevious: boolean) => Promise<void>;
}) {
  const [title, setTitle] = useState('');

  return (
    <Card elevated style={styles.createCard}>
      <AppText variant="heading">Create menu for this week</AppText>
      <TextField label="Title (optional)" value={title} onChangeText={setTitle} maxLength={100} placeholder="This Week" autoFocus />
      <View style={styles.formActions}>
        <Button label="Cancel" variant="quiet" onPress={onCancel} disabled={busy} />
        {hasPrevious ? <Button label="Create & copy previous week" variant="secondary" loading={busy} onPress={() => void onCreate(title.trim(), true)} /> : null}
        <Button label="Create menu" loading={busy} onPress={() => void onCreate(title.trim(), false)} />
      </View>
    </Card>
  );
}

function MenuMetaEditor({ menu, familyId, onCancel, onSaved }: { menu: Menu; familyId: string; onCancel: () => void; onSaved: (menu: Menu) => void }) {
  const [title, setTitle] = useState(menu.title ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMenu(familyId, menu.id, { title: title.trim() || null });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof MenuApiError ? err.message : 'This menu could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card elevated style={styles.createCard}>
      <AppText variant="heading">Rename menu</AppText>
      <TextField label="Title (optional)" value={title} onChangeText={setTitle} maxLength={100} autoFocus />
      {error ? <AppText variant="caption" tone="danger" style={styles.formError}>{error}</AppText> : null}
      <View style={styles.formActions}>
        <Button label="Cancel" variant="quiet" onPress={onCancel} disabled={saving} />
        <Button label="Save changes" loading={saving} onPress={() => void save()} />
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
  targetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  segment: { borderRadius: radius.pill, borderWidth: 1, minHeight: 40, paddingHorizontal: spacing.md, justifyContent: 'center' },
  weekNavCard: { marginTop: spacing.lg, padding: spacing.lg },
  weekNavRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  weekLabel: { alignItems: 'center' },
  thisWeekButton: { alignSelf: 'center', marginTop: spacing.xs },
  messageCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.lg },
  loading: { alignItems: 'center', paddingVertical: spacing.xxxl },
  loadingText: { marginTop: spacing.md },
  empty: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, padding: spacing.xxl },
  emptyTitle: { marginTop: spacing.md },
  emptyDetail: { marginTop: spacing.sm, maxWidth: 420 },
  emptyButton: { marginTop: spacing.lg },
  createCard: { marginTop: spacing.lg, padding: spacing.xl },
  formActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg },
  formError: { marginTop: spacing.sm },
  todayCard: { borderWidth: 1, marginTop: spacing.lg, padding: spacing.xl },
  todayMeals: { gap: spacing.md, marginTop: spacing.md },
  todayMealRow: { gap: spacing.xs },
  menuActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xl },
  targetBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  personRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  weekGrid: { gap: spacing.md, marginTop: spacing.xl },
  weekGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCard: { flexGrow: 1, minWidth: 220, padding: spacing.lg },
  mealList: { gap: spacing.sm, marginTop: spacing.md },
  mealRow: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  mealEditor: { borderRadius: radius.md, gap: spacing.xs },
  mealEditorActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.sm }
});
