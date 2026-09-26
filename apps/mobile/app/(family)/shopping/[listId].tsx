import { useAppTheme } from '../../../lib/app-theme';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { radius, spacing } from '@familyapp/config';

import { AppText } from '../../../components/AppText';
import { MemberAvatar } from '../../../components/MemberAvatar';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { AnimatedProgress, SuccessPulse } from '../../../components/Motion';
import { Screen } from '../../../components/Screen';
import { TextField } from '../../../components/TextField';
import { useCurrentFamily } from '../../../lib/family-context';
import {
  addShoppingItem,
  clearPurchasedItems,
  completeShoppingList,
  deleteShoppingItem,
  deleteShoppingList,
  getShoppingList,
  setShoppingItemPurchased,
  ShoppingApiError,
  updateShoppingItem,
  updateShoppingList,
  type ItemInput,
  type ShoppingItem,
  type ShoppingListDetail
} from '../../../lib/shopping';

const POLL_INTERVAL_MS = 15_000;

function formatShoppingDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatItemMeta(item: ShoppingItem) {
  const parts: string[] = [];
  if (item.quantity !== null) parts.push(item.unit ? `${item.quantity} ${item.unit}` : `${item.quantity}`);
  else if (item.unit) parts.push(item.unit);
  if (item.note) parts.push(item.note);
  return parts.join(' · ');
}

function BackLink() {
  return (
    <AppText accessibilityRole="link" onPress={() => router.replace('/(family)/shopping' as never)} variant="label" tone="primary" style={styles.backLink}>
      ‹ Back to Shopping
    </AppText>
  );
}

export default function ShoppingListDetailScreen() {
  const family = useCurrentFamily();
  const params = useLocalSearchParams<{ listId: string }>();
  const listId = Array.isArray(params.listId) ? params.listId[0] : params.listId;
  const { colors: theme } = useAppTheme();

  const [list, setList] = useState<ShoppingListDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingList, setEditingList] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const focusedRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (!listId || !focusedRef.current || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const next = await getShoppingList(family.familyId, listId);
      if (focusedRef.current) { setList(next); setError(null); }
    } catch (err) {
      if (focusedRef.current) setError(err instanceof ShoppingApiError ? err.message : 'We could not open this list.');
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [family.familyId, listId]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      focusedRef.current = false;
      clearInterval(interval);
    };
  }, [load]));

  async function togglePurchased(item: ShoppingItem) {
    if (!list) return;
    setBusyItemId(item.id);
    try {
      setList(await setShoppingItemPurchased(family.familyId, list.id, item.id, !item.purchasedAt));
    } catch (err) {
      setError(err instanceof ShoppingApiError ? err.message : 'That item could not be updated.');
    } finally {
      setBusyItemId(null);
    }
  }

  async function removeItem(item: ShoppingItem) {
    if (!list) return;
    setBusyItemId(item.id);
    try {
      setList(await deleteShoppingItem(family.familyId, list.id, item.id));
    } catch (err) {
      setError(err instanceof ShoppingApiError ? err.message : 'That item could not be removed.');
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleClearPurchased() {
    if (!list) return;
    setBusy(true);
    try {
      setList(await clearPurchasedItems(family.familyId, list.id));
    } catch (err) {
      setError(err instanceof ShoppingApiError ? err.message : 'Purchased items could not be cleared.');
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete() {
    if (!list) return;
    setBusy(true);
    try {
      setList(await completeShoppingList(family.familyId, list.id));
    } catch (err) {
      setError(err instanceof ShoppingApiError ? err.message : 'This list could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!list) return;
    const run = async () => {
      setBusy(true);
      try {
        await deleteShoppingList(family.familyId, list.id);
        router.replace('/(family)/shopping' as never);
      } catch (err) {
        setError(err instanceof ShoppingApiError ? err.message : 'This list could not be deleted.');
        setBusy(false);
      }
    };
    if (Platform.OS === 'web') {
      const confirmFn = (globalThis as typeof globalThis & { confirm?: (message: string) => boolean }).confirm;
      if (confirmFn?.('Delete this shopping list? This cannot be undone.')) void run();
      return;
    }
    Alert.alert('Delete list?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run() }
    ]);
  }

  if (!list && !error) {
    return (
      <Screen contentStyle={styles.state}>
        <ActivityIndicator color={theme.primary} />
        <AppText variant="caption" tone="mutedText" style={styles.stateText}>Opening this list…</AppText>
      </Screen>
    );
  }

  if (!list) {
    return (
      <Screen scroll maxWidth={760} contentStyle={styles.content}>
        <BackLink />
        <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{error}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      </Screen>
    );
  }

  const isCreator = list.createdByMemberId === family.id;
  const toBuy = list.items.filter((item) => !item.purchasedAt);
  const purchased = list.items.filter((item) => item.purchasedAt);
  const percentage = list.totalItems > 0 ? Math.round((list.purchasedItems / list.totalItems) * 100) : 0;

  return (
    <Screen scroll maxWidth={760} contentStyle={styles.content}>
      <BackLink />

      {editingList ? (
        <ListEditor familyId={family.familyId} list={list} onCancel={() => setEditingList(false)} onSaved={(next) => { setList(next); setEditingList(false); }} />
      ) : (
        <Card style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={[styles.targetBadge, { backgroundColor: list.household ? theme.secondarySoft : theme.primarySoft }]}>
              <AppText variant="caption" tone={list.household ? 'secondary' : 'primary'}>{list.household ? list.household.name : 'Whole family'}</AppText>
            </View>
            {list.isCompleted ? <View style={[styles.targetBadge, { backgroundColor: theme.successSoft }]}><AppText variant="caption" tone="success">Completed</AppText></View> : null}
          </View>

          <AppText variant="display" style={styles.listName}>{list.name}</AppText>
          {list.description ? <AppText variant="body" tone="mutedText" style={styles.description}>{list.description}</AppText> : null}
          {list.shoppingDate ? <AppText variant="caption" tone="mutedText" style={styles.shoppingDate}>{formatShoppingDate(list.shoppingDate)}</AppText> : null}

          <View style={styles.personRow}>
            <MemberAvatar member={list.createdBy} familyId={family.familyId} size={28} />
            <AppText variant="caption" tone="mutedText">Started by {list.createdBy.displayName}</AppText>
          </View>

          {list.totalItems > 0 ? (
            <>
              <AppText variant="caption" tone="mutedText" style={styles.progressLabel}>{list.purchasedItems} of {list.totalItems} items purchased · {percentage}%</AppText>
              <View style={[styles.barTrack, { backgroundColor: theme.border }]}>
                <AnimatedProgress color={theme.success} percentage={percentage} />
              </View>
            </>
          ) : null}

          {isCreator && !list.isCompleted ? (
            <View style={styles.headerActions}>
              <Button label="Edit list" variant="quiet" disabled={busy} onPress={() => setEditingList(true)} />
              <Button label="Mark completed" variant="quiet" disabled={busy} onPress={() => void handleComplete()} />
              <Button label="Delete list" variant="quiet" disabled={busy} onPress={confirmDelete} />
            </View>
          ) : null}
        </Card>
      )}

      {error ? <AppText variant="caption" tone="danger" style={styles.formError}>{error}</AppText> : null}

      {!list.isCompleted ? (
        addingItem ? (
          <AddItemEditor
            familyId={family.familyId}
            listId={list.id}
            onCancel={() => setAddingItem(false)}
            onAdded={(next) => { setList(next); setAddingItem(false); }}
          />
        ) : (
          <Button label="Add item" variant="secondary" onPress={() => setAddingItem(true)} style={styles.addButton} />
        )
      ) : null}

      <View style={styles.sectionHeading}>
        <AppText variant="heading">To buy ({toBuy.length})</AppText>
      </View>
      {toBuy.length === 0 ? (
        <AppText variant="caption" tone="mutedText" style={styles.emptySection}>Nothing left to buy.</AppText>
      ) : (
        <View style={styles.itemList}>
          {toBuy.map((item) => (
            editingItemId === item.id ? (
              <ItemEditor key={item.id} familyId={family.familyId} listId={list.id} item={item} onCancel={() => setEditingItemId(null)} onSaved={(next) => { setList(next); setEditingItemId(null); }} />
            ) : (
              <ItemRow
                key={item.id}
                item={item}
                readOnly={list.isCompleted}
                busy={busyItemId === item.id}
                onToggle={() => void togglePurchased(item)}
                onEdit={() => setEditingItemId(item.id)}
                onRemove={() => void removeItem(item)}
              />
            )
          ))}
        </View>
      )}

      <View style={styles.sectionHeading}>
        <AppText variant="heading">Purchased ({purchased.length})</AppText>
        {purchased.length > 0 && !list.isCompleted ? <Button label="Clear purchased" variant="quiet" disabled={busy} onPress={() => void handleClearPurchased()} /> : null}
      </View>
      {purchased.length === 0 ? (
        <AppText variant="caption" tone="mutedText" style={styles.emptySection}>Nothing purchased yet.</AppText>
      ) : (
        <View style={styles.itemList}>
          {purchased.map((item) => (
            editingItemId === item.id ? (
              <ItemEditor key={item.id} familyId={family.familyId} listId={list.id} item={item} onCancel={() => setEditingItemId(null)} onSaved={(next) => { setList(next); setEditingItemId(null); }} />
            ) : (
              <ItemRow
                key={item.id}
                item={item}
                readOnly={list.isCompleted}
                busy={busyItemId === item.id}
                onToggle={() => void togglePurchased(item)}
                onEdit={() => setEditingItemId(item.id)}
                onRemove={() => void removeItem(item)}
              />
            )
          ))}
        </View>
      )}
    </Screen>
  );
}

function ItemRow({ item, readOnly, busy, onToggle, onEdit, onRemove }: {
  item: ShoppingItem;
  readOnly: boolean;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { colors: theme } = useAppTheme();
  const purchased = Boolean(item.purchasedAt);
  const meta = formatItemMeta(item);

  return (
    <Card style={[styles.itemCard, purchased && styles.itemCardPurchased]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: purchased, disabled: readOnly || busy }}
        disabled={readOnly || busy}
        onPress={onToggle}
        style={[styles.check, { borderColor: purchased ? theme.success : theme.borderStrong, backgroundColor: purchased ? theme.success : 'transparent' }]}
      >
        {purchased ? <SuccessPulse><AppText variant="label" style={{ color: theme.textOnPrimary }}>✓</AppText></SuccessPulse> : <AppText variant="label" style={{ color: theme.mutedText }} />}
      </Pressable>
      <View style={styles.itemCopy}>
        <AppText variant="label" style={purchased ? styles.itemNamePurchased : undefined}>{item.name}</AppText>
        {meta ? <AppText variant="caption" tone="mutedText" style={purchased ? styles.itemNamePurchased : undefined}>{meta}</AppText> : null}
        <AppText variant="caption" tone="mutedText" style={styles.addedBy}>Added by {item.addedBy.displayName}</AppText>
      </View>
      {!readOnly ? (
        <View style={styles.itemActions}>
          <Button label="Edit" variant="quiet" disabled={busy} onPress={onEdit} />
          <Button label="Remove" variant="quiet" disabled={busy} onPress={onRemove} />
        </View>
      ) : null}
    </Card>
  );
}

function AddItemEditor({ familyId, listId, onCancel, onAdded }: {
  familyId: string;
  listId: string;
  onCancel: () => void;
  onAdded: (list: ShoppingListDetail) => void;
}) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function save(addAnother: boolean) {
    if (savingRef.current) return;
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Enter an item name.'); return; }
    let parsedQuantity: number | undefined;
    if (quantity.trim()) {
      const num = Number(quantity.trim());
      if (!Number.isFinite(num) || num <= 0) { setError('Quantity must be a positive number.'); return; }
      parsedQuantity = num;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const input: ItemInput = { name: trimmedName, quantity: parsedQuantity, unit: unit.trim() || undefined, note: note.trim() || undefined };
      const next = await addShoppingItem(familyId, listId, input);
      if (addAnother) {
        setName(''); setQuantity(''); setUnit(''); setNote('');
        onAdded(next);
        setSaving(false);
        savingRef.current = false;
        return;
      }
      onAdded(next);
    } catch (err) {
      setError(err instanceof ShoppingApiError ? err.message : 'That item could not be added.');
      setSaving(false);
      savingRef.current = false;
    }
  }

  return (
    <Card elevated style={styles.itemEditor}>
      <AppText variant="heading">Add item</AppText>
      <TextField label="Item name" value={name} onChangeText={setName} maxLength={140} placeholder="Milk" autoFocus />
      <View style={styles.itemFormRow}>
        <View style={styles.itemFormField}><TextField label="Quantity (optional)" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="2" /></View>
        <View style={styles.itemFormField}><TextField label="Unit (optional)" value={unit} onChangeText={setUnit} maxLength={30} placeholder="bottles" /></View>
      </View>
      <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={300} />
      {error ? <AppText variant="caption" tone="danger" style={styles.formError}>{error}</AppText> : null}
      <View style={styles.formActions}>
        <Button label="Cancel" variant="quiet" onPress={onCancel} disabled={saving} />
        <Button label="Add another" variant="secondary" loading={saving} onPress={() => void save(true)} />
        <Button label="Add item" loading={saving} onPress={() => void save(false)} />
      </View>
    </Card>
  );
}

function ItemEditor({ familyId, listId, item, onCancel, onSaved }: {
  familyId: string;
  listId: string;
  item: ShoppingItem;
  onCancel: () => void;
  onSaved: (list: ShoppingListDetail) => void;
}) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity !== null ? String(item.quantity) : '');
  const [unit, setUnit] = useState(item.unit ?? '');
  const [note, setNote] = useState(item.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Enter an item name.'); return; }
    let parsedQuantity: number | null = null;
    if (quantity.trim()) {
      const num = Number(quantity.trim());
      if (!Number.isFinite(num) || num <= 0) { setError('Quantity must be a positive number.'); return; }
      parsedQuantity = num;
    }

    setSaving(true);
    setError(null);
    try {
      const next = await updateShoppingItem(familyId, listId, item.id, {
        name: trimmedName,
        quantity: parsedQuantity,
        unit: unit.trim() || null,
        note: note.trim() || null
      });
      onSaved(next);
    } catch (err) {
      setError(err instanceof ShoppingApiError ? err.message : 'That item could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card elevated style={styles.itemEditor}>
      <AppText variant="heading">Edit item</AppText>
      <TextField label="Item name" value={name} onChangeText={setName} maxLength={140} autoFocus />
      <View style={styles.itemFormRow}>
        <View style={styles.itemFormField}><TextField label="Quantity (optional)" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" /></View>
        <View style={styles.itemFormField}><TextField label="Unit (optional)" value={unit} onChangeText={setUnit} maxLength={30} /></View>
      </View>
      <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={300} />
      {error ? <AppText variant="caption" tone="danger" style={styles.formError}>{error}</AppText> : null}
      <View style={styles.formActions}>
        <Button label="Cancel" variant="quiet" onPress={onCancel} disabled={saving} />
        <Button label="Save changes" loading={saving} onPress={() => void save()} />
      </View>
    </Card>
  );
}

function ListEditor({ familyId, list, onCancel, onSaved }: {
  familyId: string;
  list: ShoppingListDetail;
  onCancel: () => void;
  onSaved: (list: ShoppingListDetail) => void;
}) {
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Give your list a name.'); return; }
    setSaving(true);
    setError(null);
    try {
      const next = await updateShoppingList(familyId, list.id, { name: trimmedName, description: description.trim() || null });
      onSaved(next);
    } catch (err) {
      setError(err instanceof ShoppingApiError ? err.message : 'This list could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card elevated style={styles.headerCard}>
      <AppText variant="heading">Edit list</AppText>
      <TextField label="List name" value={name} onChangeText={setName} maxLength={100} autoFocus />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} maxLength={1000} multiline />
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
  state: { alignItems: 'center', justifyContent: 'center' },
  stateText: { marginTop: spacing.md },
  backLink: { marginBottom: spacing.lg },
  messageCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  headerCard: { padding: spacing.xl },
  headerRow: { flexDirection: 'row', gap: spacing.sm },
  targetBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  listName: { marginTop: spacing.md },
  description: { marginTop: spacing.sm },
  shoppingDate: { marginTop: spacing.sm },
  personRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  progressLabel: { marginTop: spacing.lg },
  barTrack: { borderRadius: radius.pill, height: 8, marginTop: spacing.xs, overflow: 'hidden' },
  barFill: { borderRadius: radius.pill, height: '100%' },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  formError: { marginTop: spacing.md },
  addButton: { alignSelf: 'flex-start', marginTop: spacing.xl },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.xxl },
  emptySection: { marginTop: spacing.md },
  itemList: { gap: spacing.sm, marginTop: spacing.md },
  itemCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  itemCardPurchased: { opacity: 0.6 },
  check: { alignItems: 'center', borderRadius: 13, borderWidth: 2, height: 26, justifyContent: 'center', width: 26 },
  itemCopy: { flex: 1, minWidth: 0 },
  itemNamePurchased: { textDecorationLine: 'line-through' },
  addedBy: { marginTop: spacing.xs },
  itemActions: { flexDirection: 'row', flexWrap: 'wrap' },
  itemEditor: { marginTop: spacing.md, padding: spacing.xl },
  itemFormRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  itemFormField: { flex: 1, minWidth: 140 },
  formActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg }
});
