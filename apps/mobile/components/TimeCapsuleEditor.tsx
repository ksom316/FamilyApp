import { useAppTheme } from '../lib/app-theme';
import { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { radius, spacing } from '@familyapp/config';

import { AppText } from './AppText';
import { AuthorizedImage } from './AuthorizedImage';
import { Button } from './Button';
import { Card } from './Card';
import { DateTimeField } from './DateTimeField';
import { TextField } from './TextField';
import { memoryMediaPath, type FamilyMemory } from '../lib/memories';
import {
  createFamilyTimeCapsule,
  TimeCapsulesApiError,
  updateFamilyTimeCapsule,
  type CapsulePhotoInput,
  type TimeCapsuleSummary
} from '../lib/time-capsules';

const MAX_ATTACHED_MEMORIES = 24;
const MAX_PRIVATE_PHOTOS = 8;

export function TimeCapsuleEditor({ familyId, memories, capsule, onCancel, onSaved }: {
  familyId: string;
  memories: FamilyMemory[];
  capsule?: TimeCapsuleSummary;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { colors: theme } = useAppTheme();
  const { width } = useWindowDimensions();
  const [title, setTitle] = useState(capsule?.title ?? '');
  const [message, setMessage] = useState('');
  const [unlockAt, setUnlockAt] = useState<string | null>(capsule ? capsule.unlockAt : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>([]);
  const [replaceMemories, setReplaceMemories] = useState(!capsule);
  const [privatePhotos, setPrivatePhotos] = useState<CapsulePhotoInput[]>([]);
  const [replacePrivatePhotos, setReplacePrivatePhotos] = useState(!capsule);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const choiceWidth = width < 520 ? '47%' : 150;
  const privatePhotoWidth = width < 520 ? '47%' : 180;

  function toggleMemory(memoryId: string) {
    setError(null);
    setSelectedMemoryIds((current) => {
      if (current.includes(memoryId)) return current.filter((id) => id !== memoryId);
      if (current.length >= MAX_ATTACHED_MEMORIES) {
        setError(`Attach up to ${MAX_ATTACHED_MEMORIES} memories.`);
        return current;
      }
      return [...current, memoryId];
    });
  }

  async function pickPrivatePhoto() {
    if (saving || privatePhotos.length >= MAX_PRIVATE_PHOTOS) return;
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library access is needed to add a private photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const extension = asset.uri.split('.').pop()?.split('?')[0]?.toLowerCase();
    const type = asset.mimeType ?? (extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg');
    setPrivatePhotos((current) => [...current, {
      uri: asset.uri,
      name: asset.fileName ?? `capsule-photo-${Date.now()}.${extension || 'jpg'}`,
      type
    }]);
  }

  async function save() {
    if (savingRef.current) return;
    if (!title.trim()) return setError('Give this capsule a title.');
    if (!unlockAt || new Date(unlockAt).getTime() <= Date.now() + 60_000) {
      return setError('Choose an unlock time at least one minute in the future.');
    }
    const unlockAtIso = unlockAt;

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      if (capsule) {
        await updateFamilyTimeCapsule(familyId, capsule.id, {
          title: title.trim(),
          unlockAt: unlockAtIso,
          ...(message.trim() ? { message: message.trim() } : {}),
          ...(replaceMemories ? { memoryIds: selectedMemoryIds } : {}),
          ...(replacePrivatePhotos ? { replacePrivatePhotos: true, privatePhotos } : {})
        });
      } else {
        await createFamilyTimeCapsule(familyId, {
          title: title.trim(),
          message: message.trim() || null,
          unlockAt: unlockAtIso,
          memoryIds: selectedMemoryIds,
          privatePhotos
        });
      }
      await onSaved();
    } catch (caught) {
      setError(caught instanceof TimeCapsulesApiError ? caught.message : 'The time capsule could not be saved.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Card elevated style={styles.editor}>
      <AppText variant="heading">{capsule ? 'Edit sealed capsule' : 'Create a time capsule'}</AppText>
      <AppText variant="caption" tone="mutedText" style={styles.intro}>
        {capsule
          ? 'Previously sealed contents stay hidden. Choose replacement options only for content you want to replace.'
          : 'Write something for the future, attach visible family memories, or add photos that stay private until unlock.'}
      </AppText>
      <TextField label="Title" value={title} onChangeText={setTitle} maxLength={120} autoFocus placeholder="A note for next summer" />
      <TextField
        label={capsule ? 'Replacement message (optional)' : 'Message (optional)'}
        value={message}
        onChangeText={setMessage}
        maxLength={5000}
        multiline
        placeholder={capsule ? 'Leave blank to keep the sealed message unchanged' : 'Something your family will read when it opens'}
      />
      <DateTimeField label="Unlock date and time" value={unlockAt} onChange={setUnlockAt} minimumDate={new Date(Date.now() + 60_000)} />

      {capsule ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: replaceMemories }}
          disabled={saving}
          onPress={() => { setReplaceMemories((current) => !current); setSelectedMemoryIds([]); }}
          style={styles.replaceRow}
        >
          <View style={[styles.checkbox, { borderColor: replaceMemories ? theme.primary : theme.borderStrong, backgroundColor: replaceMemories ? theme.primary : 'transparent' }]}>
            <AppText variant="caption" style={{ color: replaceMemories ? theme.textOnPrimary : theme.mutedText }}>{replaceMemories ? '✓' : ''}</AppText>
          </View>
          <View style={styles.replaceCopy}>
            <AppText variant="label">Replace attached memories</AppText>
            <AppText variant="caption" tone="mutedText">Leave off to keep the sealed memory references unchanged.</AppText>
          </View>
        </Pressable>
      ) : null}

      {replaceMemories ? (
        <View style={styles.section}>
          <AppText variant="label">Choose existing memories (optional)</AppText>
          <AppText variant="caption" tone="mutedText" style={styles.sectionDetail}>
            Existing memories are already visible to your family. {selectedMemoryIds.length}/{MAX_ATTACHED_MEMORIES} selected.
          </AppText>
          {memories.length ? (
            <View style={styles.memoryGrid}>
              {memories.map((memory) => {
                const selected = selectedMemoryIds.includes(memory.id);
                return (
                  <Pressable
                    key={memory.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected, disabled: saving }}
                    accessibilityLabel={memory.title ?? 'Untitled memory'}
                    disabled={saving}
                    onPress={() => toggleMemory(memory.id)}
                    style={[styles.memoryChoice, { borderColor: selected ? theme.primary : theme.border, width: choiceWidth }, saving && styles.disabled]}
                  >
                    <AuthorizedImage path={memoryMediaPath(memory.familyId, memory.id)} style={styles.memoryImage} />
                    <View style={[styles.selectionMark, { backgroundColor: selected ? theme.primary : 'rgba(0,0,0,0.5)' }]}>
                      <AppText variant="caption" style={{ color: '#FFFFFF' }}>{selected ? '✓' : '+'}</AppText>
                    </View>
                    <AppText variant="caption" numberOfLines={2} style={styles.memoryTitle}>{memory.title ?? 'Untitled memory'}</AppText>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={[styles.emptyState, { backgroundColor: theme.backgroundTint }]}>
              <AppText variant="caption" tone="mutedText">No existing family memories are available. You can still add a private photo below.</AppText>
            </View>
          )}
        </View>
      ) : null}

      {capsule ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: replacePrivatePhotos }}
          disabled={saving}
          onPress={() => { setReplacePrivatePhotos((current) => !current); setPrivatePhotos([]); }}
          style={styles.replaceRow}
        >
          <View style={[styles.checkbox, { borderColor: replacePrivatePhotos ? theme.primary : theme.borderStrong, backgroundColor: replacePrivatePhotos ? theme.primary : 'transparent' }]}>
            <AppText variant="caption" style={{ color: replacePrivatePhotos ? theme.textOnPrimary : theme.mutedText }}>{replacePrivatePhotos ? '✓' : ''}</AppText>
          </View>
          <View style={styles.replaceCopy}>
            <AppText variant="label">Replace sealed private photos</AppText>
            <AppText variant="caption" tone="mutedText">Existing sealed photos are never shown here. Leave off to keep them unchanged.</AppText>
          </View>
        </Pressable>
      ) : null}

      {replacePrivatePhotos ? (
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View style={styles.sectionHeadingCopy}>
              <AppText variant="label">Add private photo</AppText>
              <AppText variant="caption" tone="mutedText">
                These photos stay outside Memories and cannot be opened until server time reaches the unlock date.
              </AppText>
            </View>
            <Button
              label={privatePhotos.length ? 'Add another' : 'Choose photo'}
              variant="secondary"
              disabled={saving || privatePhotos.length >= MAX_PRIVATE_PHOTOS}
              onPress={() => void pickPrivatePhoto()}
            />
          </View>
          {privatePhotos.length ? (
            <View style={styles.privateGrid}>
              {privatePhotos.map((photo, index) => (
                <View key={`${photo.uri}-${index}`} style={[styles.privatePreview, { borderColor: theme.border, width: privatePhotoWidth }]}>
                  <Image source={{ uri: photo.uri }} resizeMode="cover" style={styles.privateImage} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove private photo ${index + 1}`}
                    disabled={saving}
                    onPress={() => setPrivatePhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    style={[styles.removePhoto, { backgroundColor: theme.surface }]}
                  >
                    <AppText variant="label">X</AppText>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.emptyState, { backgroundColor: theme.backgroundTint }]}>
              <AppText variant="caption" tone="mutedText">
                {capsule ? 'Saving with replacement enabled and no photos will remove the previous sealed private photos.' : 'No private photos selected.'}
              </AppText>
            </View>
          )}
        </View>
      ) : null}

      {error ? <AppText variant="caption" tone="danger" style={styles.error}>{error}</AppText> : null}
      <View style={styles.actions}>
        <Button label="Cancel" variant="quiet" disabled={saving} onPress={onCancel} />
        <Button label={capsule ? 'Save changes' : 'Seal capsule'} loading={saving} onPress={() => void save()} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  editor: { marginTop: spacing.xl, padding: spacing.xl },
  intro: { marginTop: spacing.sm, maxWidth: 680 },
  replaceRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  checkbox: { alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, height: 28, justifyContent: 'center', width: 28 },
  replaceCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  section: { marginTop: spacing.lg },
  sectionDetail: { marginTop: spacing.xs },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' },
  sectionHeadingCopy: { flex: 1, gap: spacing.xs, minWidth: 240 },
  memoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  memoryChoice: { borderRadius: radius.md, borderWidth: 2, overflow: 'hidden', position: 'relative' },
  disabled: { opacity: 0.55 },
  memoryImage: { aspectRatio: 1.25, width: '100%' },
  memoryTitle: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  selectionMark: { alignItems: 'center', borderRadius: radius.pill, height: 28, justifyContent: 'center', position: 'absolute', right: spacing.xs, top: spacing.xs, width: 28 },
  emptyState: { borderRadius: radius.md, marginTop: spacing.sm, padding: spacing.md },
  privateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  privatePreview: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  privateImage: { aspectRatio: 1.25, width: '100%' },
  removePhoto: { alignItems: 'center', borderRadius: radius.pill, height: 32, justifyContent: 'center', position: 'absolute', right: spacing.xs, top: spacing.xs, width: 32 },
  error: { marginTop: spacing.md },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg }
});
