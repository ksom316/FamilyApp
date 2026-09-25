import { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';
import { TextField } from './TextField';
import { createFamilyMemory, MemoriesApiError, type FamilyMemory } from '../lib/memories';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayValue() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function MemoryEditor({ familyId, embedded = false, onCancel, onSaved, onSavingChange }: {
  familyId: string;
  embedded?: boolean;
  onCancel: () => void;
  onSaved: (memory: FamilyMemory) => Promise<void> | void;
  onSavingChange?: (saving: boolean) => void;
}) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const [photo, setPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [title, setTitle] = useState('');
  const [memoryDate, setMemoryDate] = useState(todayValue());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function pickPhoto() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Allow photo access to add a memory.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPhoto({ uri: asset.uri, name: asset.fileName ?? `memory-${Date.now()}.jpg`, type: asset.mimeType ?? 'image/jpeg' });
  }

  async function save() {
    if (savingRef.current) return;
    if (!photo) { setError('Choose a photo to share.'); return; }
    if (!DATE_PATTERN.test(memoryDate)) { setError('Use a valid date, like 2026-07-04.'); return; }

    savingRef.current = true;
    setSaving(true);
    onSavingChange?.(true);
    setError(null);
    try {
      const memory = await createFamilyMemory(familyId, { title: title.trim() || undefined, memoryDate, file: photo });
      await onSaved(memory);
    } catch (caught) {
      setError(caught instanceof MemoriesApiError ? caught.message : 'That memory could not be uploaded.');
    } finally {
      savingRef.current = false;
      setSaving(false);
      onSavingChange?.(false);
    }
  }

  return (
    <Card elevated={!embedded} style={[styles.editor, embedded && styles.embedded]}>
      <AppText variant="heading">Add a memory</AppText>
      <Pressable
        accessibilityRole="button"
        onPress={() => void pickPhoto()}
        style={[styles.pickerButton, { borderColor: theme.borderStrong, backgroundColor: theme.input }]}
      >
        {photo
          ? <Image source={{ uri: photo.uri }} style={styles.previewImage} resizeMode="cover" />
          : <AppText variant="label" tone="mutedText">Choose a photo</AppText>}
      </Pressable>
      {photo ? <Button label="Choose a different photo" variant="quiet" onPress={() => void pickPhoto()} /> : null}
      <TextField label="Title (optional)" value={title} onChangeText={setTitle} maxLength={120} placeholder="A caption for this moment" />
      <TextField label="Memory date" value={memoryDate} onChangeText={setMemoryDate} hint="YYYY-MM-DD" autoCapitalize="none" />
      {error ? <AppText variant="caption" tone="danger" style={styles.formError}>{error}</AppText> : null}
      <View style={styles.formActions}>
        <Button label="Cancel" variant="quiet" onPress={onCancel} disabled={saving} />
        <Button label="Save memory" loading={saving} onPress={() => void save()} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  editor: { marginTop: spacing.xl, padding: spacing.xl },
  embedded: { marginTop: spacing.md, padding: spacing.lg },
  pickerButton: { alignItems: 'center', borderRadius: radius.md, borderStyle: 'dashed', borderWidth: 1, height: 180, justifyContent: 'center', marginTop: spacing.md, overflow: 'hidden' },
  previewImage: { height: '100%', width: '100%' },
  formActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg },
  formError: { marginTop: spacing.md }
});
