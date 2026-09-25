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
import { getFamilyMembers, type FamilyMember } from '../../lib/families';
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
import {
  applySavedMenuToWeek,
  clearSavedMenuMeal,
  createSavedMenu,
  createShoppingListFromSavedMenu,
  deleteSavedMenu,
  duplicateSavedMenu,
  formatAudienceLabel,
  getMenuHome,
  getSavedMenu,
  getSavedMenus,
  SavedMenuApiError,
  setSavedMenuActive,
  setSavedMenuMeal,
  updateSavedMenu,
  type ActiveMenuHomeCard,
  type AudienceType,
  type CreateSavedMenuInput,
  type MenuHome,
  type SavedMenuDetail,
  type SavedMenuMeal,
  type SavedMenuSummary,
  type UpdateSavedMenuInput
} from '../../lib/saved-menus';

const POLL_INTERVAL_MS = 20_000;
const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
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
  // Menu Home is the landing view — opening /menu no longer jumps straight into an
  // (often empty) weekly grid. Weekly Plan and Saved Menus are reached via the tabs.
  const [view, setView] = useState<'home' | 'weekly' | 'saved'>('home');
  const [openSavedMenuId, setOpenSavedMenuId] = useState<string | null>(null);
  const [target, setTarget] = useState<'family' | string>('family');
  const [myHouseholds, setMyHouseholds] = useState<Household[]>([]);
  const [familyMembersList, setFamilyMembersList] = useState<FamilyMember[]>([]);
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
    void getFamilyMembers(family.familyId).then(setFamilyMembersList).catch(() => {});
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
    if (view === 'weekly') void load();
    const interval = view === 'weekly' ? setInterval(() => void load(), POLL_INTERVAL_MS) : undefined;
    return () => {
      focusedRef.current = false;
      if (interval) clearInterval(interval);
    };
  }, [load, view]));

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
          <AppText variant="body" tone="mutedText" style={styles.subtitle}>See what applies to you today, or open a menu when you need it.</AppText>
        </View>
      </View>

      <View style={styles.viewTabs}>
        <Segment label="Menu Home" active={view === 'home'} onPress={() => setView('home')} />
        <Segment label="Weekly Plan" active={view === 'weekly'} onPress={() => setView('weekly')} />
        <Segment label="Saved Menus" active={view === 'saved'} onPress={() => setView('saved')} />
      </View>

      {view === 'home' ? (
        <MenuHomePanel
          familyId={family.familyId}
          onOpenSavedMenu={(id) => { setOpenSavedMenuId(id); setView('saved'); }}
          onGoToWeekly={() => setView('weekly')}
          onGoToSaved={() => setView('saved')}
        />
      ) : null}

      {view === 'saved' ? (
        <SavedMenusPanel
          familyId={family.familyId}
          myMemberId={family.id}
          myHouseholds={myHouseholds}
          familyMembersList={familyMembersList}
          currentWeekStartDate={weekStartDate}
          openId={openSavedMenuId}
          onOpenIdChange={setOpenSavedMenuId}
          onAppliedToWeek={() => { setView('weekly'); void load(); }}
        />
      ) : null}

      {view === 'weekly' ? (
        <>
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

function MenuHomePanel({ familyId, onOpenSavedMenu, onGoToWeekly, onGoToSaved }: {
  familyId: string;
  onOpenSavedMenu: (id: string) => void;
  onGoToWeekly: () => void;
  onGoToSaved: () => void;
}) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const [home, setHome] = useState<MenuHome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setHome(await getMenuHome(familyId));
      setError(null);
    } catch (err) {
      setError(err instanceof SavedMenuApiError ? err.message : 'We could not load your menus.');
    }
  }, [familyId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <View>
      {error ? (
        <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{error}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      ) : null}

      {!home && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
          <AppText variant="caption" tone="mutedText" style={styles.loadingText}>Gathering your menus…</AppText>
        </View>
      ) : null}

      {home ? (
        <>
          <View style={styles.sectionHeadingRow}>
            <AppText variant="heading">Your menus</AppText>
          </View>

          {home.activeMenus.length === 0 ? (
            <Card style={[styles.empty, { backgroundColor: theme.secondarySoft }]}>
              <AppText variant="title" tone="secondary">▨</AppText>
              <AppText variant="heading" style={styles.emptyTitle}>No active menus yet</AppText>
              <AppText variant="body" tone="mutedText" align="center" style={styles.emptyDetail}>
                Save a menu and set it active to see it here, with today’s meals at a glance.
              </AppText>
              <Button label="Go to Saved Menus" onPress={onGoToSaved} style={styles.emptyButton} />
            </Card>
          ) : (
            <View style={styles.savedList}>
              {home.activeMenus.map((menu) => <ActiveMenuCard key={menu.id} menu={menu} onOpen={() => onOpenSavedMenu(menu.id)} />)}
            </View>
          )}

          <View style={styles.sectionHeadingRow}>
            <AppText variant="heading">Weekly Plan</AppText>
          </View>
          <Card style={styles.weeklyPromoCard}>
            <AppText variant="body" tone="mutedText">Meals planned for a specific calendar week — separate from your reusable saved menus.</AppText>
            <Button label="Open Weekly Plan" variant="secondary" onPress={onGoToWeekly} style={styles.emptyButton} />
          </Card>

          {home.otherMenus.length > 0 ? (
            <>
              <View style={styles.sectionHeadingRow}>
                <AppText variant="heading">Other saved menus</AppText>
                <Button label="Manage" variant="quiet" onPress={onGoToSaved} />
              </View>
              <View style={styles.savedList}>
                {home.otherMenus.map((menu) => <OtherMenuRow key={menu.id} menu={menu} onOpen={() => onOpenSavedMenu(menu.id)} />)}
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function ActiveMenuCard({ menu, onOpen }: { menu: ActiveMenuHomeCard; onOpen: () => void }) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <Pressable accessibilityRole="button" onPress={onOpen}>
      <Card style={styles.savedCard}>
        <View style={styles.savedCardHeader}>
          <View style={[styles.targetBadge, { backgroundColor: theme.primarySoft }]}><AppText variant="caption" tone="primary">{formatAudienceLabel(menu.audience)}</AppText></View>
          <View style={[styles.targetBadge, { backgroundColor: theme.successSoft }]}><AppText variant="caption" tone="success">Active</AppText></View>
        </View>
        <AppText variant="label" style={styles.savedCardName}>{menu.name}</AppText>
        <AppText variant="caption" tone="mutedText" style={styles.todayLabel}>Today</AppText>
        <View style={styles.todayMeals}>
          {MEAL_TYPES.map((type) => {
            const meal = menu.todayMeals.find((item) => item.mealType === type) ?? null;
            return (
              <View key={type} style={styles.todayMealRow}>
                <AppText variant="caption" tone="mutedText">{MEAL_LABELS[type]}</AppText>
                <AppText variant="body" tone={meal ? 'text' : 'mutedText'} numberOfLines={1}>{meal ? meal.mealName : 'Not planned'}</AppText>
              </View>
            );
          })}
        </View>
      </Card>
    </Pressable>
  );
}

function OtherMenuRow({ menu, onOpen }: { menu: SavedMenuSummary; onOpen: () => void }) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <Pressable accessibilityRole="button" onPress={onOpen}>
      <Card style={styles.otherMenuRow}>
        <AppText variant="label" style={styles.otherMenuName}>{menu.name}</AppText>
        <View style={[styles.targetBadge, { backgroundColor: theme.secondarySoft }]}><AppText variant="caption" tone="secondary">{formatAudienceLabel(menu.audience)}</AppText></View>
      </Card>
    </Pressable>
  );
}

function SavedMenusPanel({ familyId, myMemberId, myHouseholds, familyMembersList, currentWeekStartDate, openId, onOpenIdChange, onAppliedToWeek }: {
  familyId: string;
  myMemberId: string;
  myHouseholds: Household[];
  familyMembersList: FamilyMember[];
  currentWeekStartDate: string;
  openId: string | null;
  onOpenIdChange: (id: string | null) => void;
  onAppliedToWeek: () => void;
}) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const [savedMenus, setSavedMenus] = useState<SavedMenuSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSavedMenus(await getSavedMenus(familyId));
      setError(null);
    } catch (err) {
      setError(err instanceof SavedMenuApiError ? err.message : 'We could not load saved menus.');
    }
  }, [familyId]);

  useEffect(() => { void load(); }, [load]);

  async function handleDuplicate(id: string) {
    setBusyId(id);
    try {
      await duplicateSavedMenu(familyId, id);
      await load();
    } catch (err) {
      setError(err instanceof SavedMenuApiError ? err.message : 'That menu could not be duplicated.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleSetActive(id: string, active: boolean) {
    setBusyId(id);
    try {
      await setSavedMenuActive(familyId, id, active);
      await load();
    } catch (err) {
      setError(err instanceof SavedMenuApiError ? err.message : 'That could not be updated.');
    } finally {
      setBusyId(null);
    }
  }

  function confirmDelete(id: string, name: string) {
    const run = async () => {
      setBusyId(id);
      try {
        await deleteSavedMenu(familyId, id);
        await load();
      } catch (err) {
        setError(err instanceof SavedMenuApiError ? err.message : 'That menu could not be deleted.');
      } finally {
        setBusyId(null);
      }
    };
    if (Platform.OS === 'web') {
      const confirmFn = (globalThis as typeof globalThis & { confirm?: (message: string) => boolean }).confirm;
      if (confirmFn?.(`Delete "${name}"? This cannot be undone.`)) void run();
      return;
    }
    Alert.alert(`Delete "${name}"?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run() }
    ]);
  }

  if (openId) {
    return (
      <SavedMenuDetailPanel
        familyId={familyId}
        myMemberId={myMemberId}
        savedMenuId={openId}
        myHouseholds={myHouseholds}
        familyMembersList={familyMembersList}
        currentWeekStartDate={currentWeekStartDate}
        onBack={() => { onOpenIdChange(null); void load(); }}
        onAppliedToWeek={onAppliedToWeek}
      />
    );
  }

  return (
    <View>
      <View style={styles.sectionHeadingRow}>
        <AppText variant="heading">Saved Menus</AppText>
        {!creating ? <Button label="New saved menu" variant="secondary" onPress={() => setCreating(true)} /> : null}
      </View>
      <AppText variant="caption" tone="mutedText" style={styles.savedIntro}>Reusable menus that stay ready until you change them — no week or date attached.</AppText>

      {creating ? (
        <CreateSavedMenuCard
          familyId={familyId}
          myHouseholds={myHouseholds}
          familyMembersList={familyMembersList}
          onCancel={() => setCreating(false)}
          onCreated={async (id) => { setCreating(false); await load(); onOpenIdChange(id); }}
        />
      ) : null}

      {error ? (
        <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{error}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      ) : null}

      {!savedMenus && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
          <AppText variant="caption" tone="mutedText" style={styles.loadingText}>Loading saved menus…</AppText>
        </View>
      ) : null}

      {savedMenus && savedMenus.length === 0 && !creating ? (
        <Card style={[styles.empty, { backgroundColor: theme.secondarySoft }]}>
          <AppText variant="title" tone="secondary">▨</AppText>
          <AppText variant="heading" style={styles.emptyTitle}>No saved menus yet</AppText>
          <AppText variant="body" tone="mutedText" align="center" style={styles.emptyDetail}>
            Save a menu like “Regular Home Menu” to reuse it whenever you like.
          </AppText>
          <Button label="New saved menu" onPress={() => setCreating(true)} style={styles.emptyButton} />
        </Card>
      ) : null}

      {savedMenus && savedMenus.length > 0 ? (
        <View style={styles.savedList}>
          {savedMenus.map((menu) => (
            <SavedMenuCard
              key={menu.id}
              menu={menu}
              myMemberId={myMemberId}
              busy={busyId === menu.id}
              onOpen={() => onOpenIdChange(menu.id)}
              onDuplicate={() => void handleDuplicate(menu.id)}
              onSetActive={(active) => void handleSetActive(menu.id, active)}
              onDelete={() => confirmDelete(menu.id, menu.name)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SavedMenuCard({ menu, myMemberId, busy, onOpen, onDuplicate, onSetActive, onDelete }: {
  menu: SavedMenuSummary;
  myMemberId: string;
  busy: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onSetActive: (active: boolean) => void;
  onDelete: () => void;
}) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const isCreator = menu.createdByMemberId === myMemberId;
  return (
    <Card style={styles.savedCard}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={styles.savedCardMain}>
        <View style={styles.savedCardHeader}>
          <View style={[styles.targetBadge, { backgroundColor: theme.secondarySoft }]}>
            <AppText variant="caption" tone="secondary">{formatAudienceLabel(menu.audience)}</AppText>
          </View>
          {menu.isActive ? <View style={[styles.targetBadge, { backgroundColor: theme.successSoft }]}><AppText variant="caption" tone="success">Active</AppText></View> : null}
        </View>
        <AppText variant="label" style={styles.savedCardName}>{menu.name}</AppText>
        {menu.description ? <AppText variant="caption" tone="mutedText" numberOfLines={2}>{menu.description}</AppText> : null}
        <View style={styles.personRow}>
          <Avatar name={menu.createdBy.displayName} imageUrl={menu.createdBy.avatar} size={20} />
          <AppText variant="caption" tone="mutedText">{menu.createdBy.displayName}</AppText>
        </View>
      </Pressable>
      <View style={styles.savedCardActions}>
        <Button label={menu.isActive ? 'Unset active' : 'Set as active'} variant="quiet" disabled={busy || !isCreator} onPress={() => onSetActive(!menu.isActive)} />
        <Button label="Duplicate" variant="quiet" disabled={busy} onPress={onDuplicate} />
        {isCreator ? <Button label="Delete" variant="quiet" disabled={busy} onPress={onDelete} /> : null}
      </View>
    </Card>
  );
}

function MemberChip({ member, active, onPress }: { member: { id: string; displayName: string; avatar: string | null }; active: boolean; onPress: () => void }) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={[styles.memberChip, { backgroundColor: active ? theme.primarySoft : theme.input, borderColor: active ? theme.primary : theme.border }]}
    >
      <Avatar name={member.displayName} imageUrl={member.avatar} size={20} />
      <AppText variant="label" tone={active ? 'primary' : 'text'}>{member.displayName}</AppText>
    </Pressable>
  );
}

function AudiencePicker({ audienceType, setAudienceType, householdId, setHouseholdId, memberIds, setMemberIds, myHouseholds, familyMembersList }: {
  audienceType: AudienceType;
  setAudienceType: (type: AudienceType) => void;
  householdId: string | null;
  setHouseholdId: (id: string | null) => void;
  memberIds: string[];
  setMemberIds: (ids: string[]) => void;
  myHouseholds: Household[];
  familyMembersList: FamilyMember[];
}) {
  function toggleMember(id: string) {
    setMemberIds(memberIds.includes(id) ? memberIds.filter((memberId) => memberId !== id) : [...memberIds, id]);
  }

  return (
    <>
      <AppText variant="label" style={styles.fieldLabel}>Who uses this menu?</AppText>
      <View style={styles.targetChips}>
        <Segment label="Entire family" active={audienceType === 'family'} onPress={() => setAudienceType('family')} />
        <Segment label="Family group" active={audienceType === 'household'} onPress={() => setAudienceType('household')} />
        <Segment label="Specific people" active={audienceType === 'members'} onPress={() => setAudienceType('members')} />
      </View>

      {audienceType === 'household' ? (
        myHouseholds.length > 0 ? (
          <View style={styles.targetChips}>
            {myHouseholds.map((household) => (
              <Segment key={household.id} label={household.name} active={householdId === household.id} onPress={() => setHouseholdId(household.id)} />
            ))}
          </View>
        ) : (
          <AppText variant="caption" tone="mutedText" style={styles.savedIntro}>You’re not in any family groups yet.</AppText>
        )
      ) : null}

      {audienceType === 'members' ? (
        <View style={styles.targetChips}>
          {familyMembersList.map((member) => (
            <MemberChip
              key={member.id}
              member={{ id: member.id, displayName: member.displayName, avatar: member.avatar }}
              active={memberIds.includes(member.id)}
              onPress={() => toggleMember(member.id)}
            />
          ))}
        </View>
      ) : null}
    </>
  );
}

function CreateSavedMenuCard({ familyId, myHouseholds, familyMembersList, onCancel, onCreated }: {
  familyId: string;
  myHouseholds: Household[];
  familyMembersList: FamilyMember[];
  onCancel: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [audienceType, setAudienceType] = useState<AudienceType>('family');
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function save() {
    if (savingRef.current) return;
    const trimmed = name.trim();
    if (!trimmed) { setError('Give your menu a name.'); return; }
    if (audienceType === 'household' && !householdId) { setError('Choose a family group.'); return; }
    if (audienceType === 'members' && memberIds.length === 0) { setError('Choose at least one person.'); return; }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const base = { name: trimmed, description: description.trim() || undefined };
      const input: CreateSavedMenuInput = audienceType === 'household'
        ? { ...base, audienceType: 'household', householdId: householdId as string }
        : audienceType === 'members'
          ? { ...base, audienceType: 'members', memberIds }
          : { ...base, audienceType: 'family' };
      const created = await createSavedMenu(familyId, input);
      await onCreated(created.id);
    } catch (err) {
      setError(err instanceof SavedMenuApiError ? err.message : 'That menu could not be created.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Card elevated style={styles.createCard}>
      <AppText variant="heading">New saved menu</AppText>
      <TextField label="Name" value={name} onChangeText={setName} maxLength={100} placeholder="Regular Home Menu" autoFocus />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} maxLength={500} multiline />

      <AudiencePicker
        audienceType={audienceType}
        setAudienceType={setAudienceType}
        householdId={householdId}
        setHouseholdId={setHouseholdId}
        memberIds={memberIds}
        setMemberIds={setMemberIds}
        myHouseholds={myHouseholds}
        familyMembersList={familyMembersList}
      />

      {error ? <AppText variant="caption" tone="danger" style={styles.formError}>{error}</AppText> : null}
      <View style={styles.formActions}>
        <Button label="Cancel" variant="quiet" onPress={onCancel} disabled={saving} />
        <Button label="Create" loading={saving} onPress={() => void save()} />
      </View>
    </Card>
  );
}

function SavedMenuDetailPanel({ familyId, myMemberId, savedMenuId, myHouseholds, familyMembersList, currentWeekStartDate, onBack, onAppliedToWeek }: {
  familyId: string;
  myMemberId: string;
  savedMenuId: string;
  myHouseholds: Household[];
  familyMembersList: FamilyMember[];
  currentWeekStartDate: string;
  onBack: () => void;
  onAppliedToWeek: () => void;
}) {
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const [detail, setDetail] = useState<SavedMenuDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [editingSlot, setEditingSlot] = useState<{ day: number; type: MealType } | null>(null);
  const [applying, setApplying] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await getSavedMenu(familyId, savedMenuId));
      setError(null);
    } catch (err) {
      setError(err instanceof SavedMenuApiError ? err.message : 'We could not open this saved menu.');
    }
  }, [familyId, savedMenuId]);

  useEffect(() => { void load(); }, [load]);

  async function handleSaveMeal(day: number, type: MealType, mealName: string, note: string) {
    const updated = await setSavedMenuMeal(familyId, savedMenuId, { dayOfWeek: day, mealType: type, mealName, note: note || undefined });
    setDetail(updated);
    setEditingSlot(null);
  }

  async function handleClearMeal(day: number, type: MealType) {
    const updated = await clearSavedMenuMeal(familyId, savedMenuId, day, type);
    setDetail(updated);
    setEditingSlot(null);
  }

  async function handleApply(weekStartDate: string) {
    setApplying(true);
    setError(null);
    try {
      await applySavedMenuToWeek(familyId, savedMenuId, weekStartDate);
      onAppliedToWeek();
    } catch (err) {
      setError(err instanceof SavedMenuApiError ? err.message : 'This menu could not be applied.');
    } finally {
      setApplying(false);
    }
  }

  async function handleCreateShoppingList() {
    setBusy(true);
    setError(null);
    try {
      const list = await createShoppingListFromSavedMenu(familyId, savedMenuId);
      router.push(`/(family)/shopping/${list.id}` as never);
    } catch (err) {
      setError(err instanceof SavedMenuApiError ? err.message : 'A shopping list could not be created.');
    } finally {
      setBusy(false);
    }
  }

  if (!detail && !error) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.primary} />
        <AppText variant="caption" tone="mutedText" style={styles.loadingText}>Opening this menu…</AppText>
      </View>
    );
  }

  if (!detail) {
    return (
      <View>
        <AppText accessibilityRole="link" onPress={onBack} variant="label" tone="primary" style={styles.backLink}>‹ Back to Saved Menus</AppText>
        <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{error}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      </View>
    );
  }

  const isCreator = detail.createdByMemberId === myMemberId;

  return (
    <View>
      <AppText accessibilityRole="link" onPress={onBack} variant="label" tone="primary" style={styles.backLink}>‹ Back to Saved Menus</AppText>

      {editingMeta ? (
        <SavedMenuMetaEditor
          familyId={familyId}
          menu={detail}
          myHouseholds={myHouseholds}
          familyMembersList={familyMembersList}
          onCancel={() => setEditingMeta(false)}
          onSaved={(next) => { setDetail(next); setEditingMeta(false); }}
        />
      ) : (
        <Card style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={[styles.targetBadge, { backgroundColor: theme.secondarySoft }]}>
              <AppText variant="caption" tone="secondary">{formatAudienceLabel(detail.audience)}</AppText>
            </View>
            {detail.isActive ? <View style={[styles.targetBadge, { backgroundColor: theme.successSoft }]}><AppText variant="caption" tone="success">Active</AppText></View> : null}
          </View>
          <AppText variant="display" style={styles.listName}>{detail.name}</AppText>
          {detail.description ? <AppText variant="body" tone="mutedText" style={styles.description}>{detail.description}</AppText> : null}
          <View style={styles.personRow}>
            <Avatar name={detail.createdBy.displayName} imageUrl={detail.createdBy.avatar} size={20} />
            <AppText variant="caption" tone="mutedText">Created by {detail.createdBy.displayName}</AppText>
          </View>
          {isCreator ? <View style={styles.headerActions}><Button label="Edit menu" variant="quiet" onPress={() => setEditingMeta(true)} /></View> : null}
        </Card>
      )}

      {error ? <AppText variant="caption" tone="danger" style={styles.formError}>{error}</AppText> : null}

      <View style={styles.actionRow}>
        <Button
          label={`Use for week of ${formatWeekRange(currentWeekStartDate, addLocalDays(currentWeekStartDate, 6))}`}
          loading={applying}
          onPress={() => void handleApply(currentWeekStartDate)}
        />
        <Button label="Create shopping list" variant="secondary" disabled={busy} onPress={() => void handleCreateShoppingList()} />
      </View>

      <View style={[styles.weekGrid, isWide && styles.weekGridWide]}>
        {DAY_LABELS.map((label, day) => (
          <SavedDayCard
            key={day}
            label={label}
            day={day}
            meals={detail.meals}
            editingType={editingSlot?.day === day ? editingSlot.type : null}
            onStartEdit={(type) => setEditingSlot({ day, type })}
            onCancelEdit={() => setEditingSlot(null)}
            onSave={(type, name, note) => handleSaveMeal(day, type, name, note)}
            onClear={(type) => handleClearMeal(day, type)}
          />
        ))}
      </View>
    </View>
  );
}

function SavedDayCard({ label, day, meals, editingType, onStartEdit, onCancelEdit, onSave, onClear }: {
  label: string;
  day: number;
  meals: SavedMenuMeal[];
  editingType: MealType | null;
  onStartEdit: (type: MealType) => void;
  onCancelEdit: () => void;
  onSave: (type: MealType, name: string, note: string) => Promise<void>;
  onClear: (type: MealType) => Promise<void>;
}) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <Card style={styles.dayCard}>
      <AppText variant="label">{label}</AppText>
      <View style={styles.mealList}>
        {MEAL_TYPES.map((type) => {
          const meal = meals.find((item) => item.dayOfWeek === day && item.mealType === type) ?? null;
          if (editingType === type) {
            return <SavedMealSlotEditor key={type} type={type} meal={meal} onCancel={onCancelEdit} onSave={(name, note) => onSave(type, name, note)} onClear={() => onClear(type)} />;
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

function SavedMealSlotEditor({ type, meal, onCancel, onSave, onClear }: {
  type: MealType;
  meal: SavedMenuMeal | null;
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
      setError(err instanceof SavedMenuApiError ? err.message : 'That meal could not be saved.');
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
      setError(err instanceof SavedMenuApiError ? err.message : 'That meal could not be cleared.');
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

// Full audience editor, reusing the exact AudiencePicker used at creation (F16C) rather
// than a second implementation. Prepopulated from the menu's current audience; saving
// only ever PATCHes this existing menu's metadata/audience — it never touches meals,
// isActive, or creator, and never creates a new menu.
function SavedMenuMetaEditor({ familyId, menu, myHouseholds, familyMembersList, onCancel, onSaved }: {
  familyId: string;
  menu: SavedMenuDetail;
  myHouseholds: Household[];
  familyMembersList: FamilyMember[];
  onCancel: () => void;
  onSaved: (menu: SavedMenuDetail) => void;
}) {
  const [name, setName] = useState(menu.name);
  const [description, setDescription] = useState(menu.description ?? '');
  const [audienceType, setAudienceType] = useState<AudienceType>(menu.audience.type);
  const [householdId, setHouseholdId] = useState<string | null>(menu.audience.type === 'household' ? menu.audience.household.id : null);
  const [memberIds, setMemberIds] = useState<string[]>(menu.audience.type === 'members' ? menu.audience.members.map((member) => member.memberId) : []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function save() {
    if (savingRef.current) return;
    const trimmed = name.trim();
    if (!trimmed) { setError('Give your menu a name.'); return; }
    if (audienceType === 'household' && !householdId) { setError('Choose a family group.'); return; }
    if (audienceType === 'members' && memberIds.length === 0) { setError('Choose at least one person.'); return; }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const base = { name: trimmed, description: description.trim() || null };
      const input: UpdateSavedMenuInput = audienceType === 'household'
        ? { ...base, audienceType: 'household', householdId: householdId as string }
        : audienceType === 'members'
          ? { ...base, audienceType: 'members', memberIds }
          : { ...base, audienceType: 'family' };
      const updated = await updateSavedMenu(familyId, menu.id, input);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof SavedMenuApiError ? err.message : 'This menu could not be saved.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Card elevated style={styles.headerCard}>
      <AppText variant="heading">Edit menu</AppText>
      <TextField label="Name" value={name} onChangeText={setName} maxLength={100} autoFocus />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} maxLength={500} multiline />

      <AudiencePicker
        audienceType={audienceType}
        setAudienceType={setAudienceType}
        householdId={householdId}
        setHouseholdId={setHouseholdId}
        memberIds={memberIds}
        setMemberIds={setMemberIds}
        myHouseholds={myHouseholds}
        familyMembersList={familyMembersList}
      />

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
  viewTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xl },
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
  fieldLabel: { marginTop: spacing.lg },
  formActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg },
  formError: { marginTop: spacing.sm },
  todayCard: { borderWidth: 1, marginTop: spacing.lg, padding: spacing.xl },
  todayLabel: { marginTop: spacing.md },
  todayMeals: { gap: spacing.md, marginTop: spacing.sm },
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
  mealEditorActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.sm },
  sectionHeadingRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.xl },
  savedIntro: { marginTop: spacing.xs },
  savedList: { gap: spacing.sm, marginTop: spacing.lg },
  savedCard: { gap: spacing.sm },
  savedCardMain: { gap: spacing.xs },
  savedCardHeader: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  savedCardName: { marginTop: spacing.xs },
  savedCardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  otherMenuRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' },
  otherMenuName: { flex: 1, minWidth: 120 },
  weeklyPromoCard: { gap: spacing.sm, marginTop: spacing.md, padding: spacing.lg },
  memberChip: { alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, minHeight: 40, paddingHorizontal: spacing.md },
  backLink: { marginBottom: spacing.lg, marginTop: spacing.xl },
  headerCard: { padding: spacing.xl },
  headerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  listName: { marginTop: spacing.md },
  description: { marginTop: spacing.sm }
});
