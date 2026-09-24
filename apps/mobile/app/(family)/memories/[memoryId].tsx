import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../../../components/AppText';
import { AuthorizedImage } from '../../../components/AuthorizedImage';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Screen } from '../../../components/Screen';
import { TextField } from '../../../components/TextField';
import { useCurrentFamily } from '../../../lib/family-context';
import {
  deleteFamilyMemory,
  favoriteFamilyMemory,
  getFamilyMemory,
  memoryMediaPath,
  MemoriesApiError,
  unfavoriteFamilyMemory,
  updateFamilyMemory,
  type FamilyMemory
} from '../../../lib/memories';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function formatMemoryDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function BackLink() {
  return (
    <AppText
      accessibilityRole="link"
      onPress={() => router.replace('/(family)/memories' as never)}
      variant="label"
      tone="primary"
      style={styles.backLink}
    >
      ‹ Back to Memories
    </AppText>
  );
}

export default function MemoryDetailScreen() {
  const family = useCurrentFamily();
  const params = useLocalSearchParams<{ memoryId: string }>();
  const memoryId = Array.isArray(params.memoryId) ? params.memoryId[0] : params.memoryId;
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const [memory, setMemory] = useState<FamilyMemory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const load = useCallback(async () => {
    if (!memoryId) return;
    setError(null);
    try {
      setMemory(await getFamilyMemory(family.familyId, memoryId));
    } catch (err) {
      setError(err instanceof MemoriesApiError ? err.message : 'We could not open this memory.');
    }
  }, [family.familyId, memoryId]);

  useEffect(() => { void load(); }, [load]);

  async function toggleFavorite() {
    if (!memory) return;
    const previous = memory;
    const next = !memory.isFavorited;
    setMemory({ ...memory, isFavorited: next, favoritesCount: memory.favoritesCount + (next ? 1 : -1) });
    try {
      if (next) await favoriteFamilyMemory(family.familyId, memory.id);
      else await unfavoriteFamilyMemory(family.familyId, memory.id);
    } catch {
      setMemory(previous);
    }
  }

  function confirmDelete() {
    if (!memory) return;
    const remove = async () => {
      setBusy(true);
      try {
        await deleteFamilyMemory(family.familyId, memory.id);
        router.replace('/(family)/memories' as never);
      } catch (err) {
        setError(err instanceof MemoriesApiError ? err.message : 'This memory could not be deleted.');
      } finally {
        setBusy(false);
      }
    };

    if (Platform.OS === 'web') {
      const confirmFn = (globalThis as typeof globalThis & { confirm?: (message: string) => boolean }).confirm;
      if (confirmFn?.('Delete this memory? This cannot be undone.')) void remove();
      return;
    }
    Alert.alert('Delete memory?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void remove() }
    ]);
  }

  if (!memory && !error) {
    return (
      <Screen contentStyle={styles.state}>
        <ActivityIndicator color={theme.primary} />
        <AppText variant="caption" tone="mutedText" style={styles.stateText}>Opening this memory…</AppText>
      </Screen>
    );
  }

  if (!memory) {
    return (
      <Screen scroll maxWidth={780} contentStyle={styles.content}>
        <BackLink />
        <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{error}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      </Screen>
    );
  }

  const canManage = family.role !== 'member' || memory.createdByMemberId === family.id;

  return (
    <Screen scroll maxWidth={780} contentStyle={styles.content}>
      <BackLink />

      <Card padded={false} style={styles.photoCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View photo full screen"
          onPress={() => setPreviewOpen(true)}
          style={[styles.photoWrap, { backgroundColor: theme.backgroundTint }]}
        >
          <AuthorizedImage path={memoryMediaPath(memory.familyId, memory.id)} style={styles.photo} resizeMode="contain" />
        </Pressable>
      </Card>

      <Modal
        animationType="fade"
        onRequestClose={() => setPreviewOpen(false)}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={previewOpen}
      >
        <View style={styles.previewBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close full-screen photo"
            hitSlop={8}
            onPress={() => setPreviewOpen(false)}
            style={styles.previewClose}
          >
            <AppText style={styles.previewCloseLabel}>×</AppText>
          </Pressable>
          <View style={styles.previewImageWrap}>
            <AuthorizedImage
              path={memoryMediaPath(memory.familyId, memory.id)}
              resizeMode="contain"
              style={styles.previewImage}
            />
          </View>
        </View>
      </Modal>

      {editing ? (
        <MemoryEditor
          memory={memory}
          familyId={family.familyId}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => { setMemory(updated); setEditing(false); }}
        />
      ) : (
        <Card style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <View style={styles.detailCopy}>
              <AppText variant="heading">{memory.title ?? 'Untitled memory'}</AppText>
              <AppText variant="caption" tone="mutedText" style={styles.detailDate}>{formatMemoryDate(memory.memoryDate)}</AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={memory.isFavorited ? 'Remove favorite' : 'Add favorite'}
              onPress={() => void toggleFavorite()}
              style={[styles.favoritePill, { backgroundColor: memory.isFavorited ? theme.dangerSoft : theme.input, borderColor: theme.border }]}
            >
              <AppText variant="label" style={{ color: memory.isFavorited ? theme.danger : theme.mutedText }}>
                {memory.isFavorited ? '♥' : '♡'} {memory.favoritesCount}
              </AppText>
            </Pressable>
          </View>

          <View style={styles.personRow}>
            <Avatar name={memory.sharedBy.displayName} imageUrl={memory.sharedBy.avatar} size={28} />
            <AppText variant="caption" tone="mutedText">Shared by {memory.sharedBy.displayName}</AppText>
          </View>

          {error ? <AppText variant="caption" tone="danger" style={styles.formError}>{error}</AppText> : null}

          {canManage ? (
            <View style={styles.detailActions}>
              <Button label="Edit" variant="quiet" disabled={busy} onPress={() => setEditing(true)} />
              <Button label="Delete" variant="quiet" disabled={busy} onPress={confirmDelete} />
            </View>
          ) : null}
        </Card>
      )}
    </Screen>
  );
}

function MemoryEditor({ memory, familyId, onCancel, onSaved }: {
  memory: FamilyMemory;
  familyId: string;
  onCancel: () => void;
  onSaved: (memory: FamilyMemory) => void;
}) {
  const [title, setTitle] = useState(memory.title ?? '');
  const [memoryDate, setMemoryDate] = useState(memory.memoryDate);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!DATE_PATTERN.test(memoryDate)) {
      setError('Use a valid date, like 2026-07-04.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateFamilyMemory(familyId, memory.id, { title: title.trim() || null, memoryDate });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof MemoriesApiError ? err.message : 'This memory could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card elevated style={styles.editorCard}>
      <AppText variant="heading">Edit memory</AppText>
      <TextField label="Title" value={title} onChangeText={setTitle} maxLength={120} placeholder="A caption for this moment" />
      <TextField label="Memory date" value={memoryDate} onChangeText={setMemoryDate} hint="YYYY-MM-DD" autoCapitalize="none" />
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
  photoCard: { overflow: 'hidden' },
  photoWrap: { alignItems: 'center', justifyContent: 'center', maxHeight: 560, minHeight: 260 },
  photo: { height: '100%', maxHeight: 560, minHeight: 260, width: '100%' },
  previewBackdrop: { backgroundColor: 'rgba(0, 0, 0, 0.96)', flex: 1 },
  previewClose: { alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.16)', borderColor: 'rgba(255, 255, 255, 0.45)', borderRadius: radius.pill, borderWidth: 1, height: 48, justifyContent: 'center', position: 'absolute', right: spacing.lg, top: spacing.lg, width: 48, zIndex: 1 },
  previewCloseLabel: { color: '#FFFFFF', fontSize: 32, lineHeight: 34 },
  previewImageWrap: { flex: 1, paddingBottom: spacing.md, paddingHorizontal: spacing.md, paddingTop: 72 },
  previewImage: { height: '100%', width: '100%' },
  detailCard: { marginTop: spacing.lg, padding: spacing.xl },
  detailHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  detailCopy: { flex: 1, minWidth: 0 },
  detailDate: { marginTop: spacing.xs },
  favoritePill: { borderRadius: radius.pill, borderWidth: 1, minHeight: 36, paddingHorizontal: spacing.md, justifyContent: 'center' },
  personRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  formError: { marginTop: spacing.md },
  detailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  editorCard: { marginTop: spacing.lg, padding: spacing.xl },
  formActions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.lg }
});
