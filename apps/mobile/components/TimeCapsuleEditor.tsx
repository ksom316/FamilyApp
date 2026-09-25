import { useRef, useState } from 'react';
import { Pressable, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from './AppText';
import { AuthorizedImage } from './AuthorizedImage';
import { Button } from './Button';
import { Card } from './Card';
import { TextField } from './TextField';
import { memoryMediaPath, type FamilyMemory } from '../lib/memories';
import {
  createFamilyTimeCapsule,
  TimeCapsulesApiError,
  updateFamilyTimeCapsule,
  type TimeCapsuleSummary
} from '../lib/time-capsules';

const MAX_ATTACHED_MEMORIES = 24;

function dateTimeValue(date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function TimeCapsuleEditor({ familyId, memories, capsule, onCancel, onSaved }: {
  familyId: string;
  memories: FamilyMemory[];
  capsule?: TimeCapsuleSummary;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const [title, setTitle] = useState(capsule?.title ?? '');
  const [message, setMessage] = useState('');
  const [unlockAt, setUnlockAt] = useState(dateTimeValue(capsule ? new Date(capsule.unlockAt) : undefined));
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>([]);
  const [replaceMemories, setReplaceMemories] = useState(!capsule);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const choiceWidth = width < 520 ? '47%' : 150;

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

  async function save() {
    if (savingRef.current) return;
    const unlockAtIso = toIso(unlockAt);
    if (!title.trim()) return setError('Give this capsule a title.');
    if (!unlockAtIso || new Date(unlockAtIso).getTime() <= Date.now() + 60_000) {
      return setError('Choose an unlock time at least one minute in the future.');
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      if (capsule) {
        await updateFamilyTimeCapsule(familyId, capsule.id, {
          title: title.trim(),
          unlockAt: unlockAtIso,
          ...(message.trim() ? { message: message.trim() } : {}),
          ...(replaceMemories ? { memoryIds: selectedMemoryIds } : {})
        });
      } else {
        await createFamilyTimeCapsule(familyId, {
          title: title.trim(),
          message: message.trim() || null,
          unlockAt: unlockAtIso,
          memoryIds: selectedMemoryIds
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
          ? 'Sealed contents stay hidden. Add text or choose memories only when you want to replace them.'
          : 'Write something for the future and optionally tuck in family memories.'}
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
      <TextField label="Unlock date and time" value={unlockAt} onChangeText={setUnlockAt} hint="YYYY-MM-DDTHH:mm" autoCapitalize="none" />

      {capsule ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: replaceMemories }}
          onPress={() => { setReplaceMemories((current) => !current); setSelectedMemoryIds([]); }}
          style={styles.replaceRow}
        >
          <View style={[styles.checkbox, { borderColor: replaceMemories ? theme.primary : theme.borderStrong, backgroundColor: replaceMemories ? theme.primary : 'transparent' }]}>
            <AppText variant="caption" style={{ color: replaceMemories ? theme.textOnPrimary : theme.mutedText }}>{replaceMemories ? '✓' : ''}</AppText>
          </View>
          <View style={styles.replaceCopy}>
            <AppText variant="label">Replace attached memories</AppText>
            <AppText variant="caption" tone="mutedText">Leave off to keep the sealed attachments unchanged.</AppText>
          </View>
        </Pressable>
      ) : null}

      {replaceMemories ? (
        <View style={styles.memorySection}>
          <View style={styles.memoryHeading}>
            <AppText variant="label">Family memories (optional)</AppText>
            <AppText variant="caption" tone="mutedText">{selectedMemoryIds.length}/{MAX_ATTACHED_MEMORIES}</AppText>
          </View>
          {memories.length ? (
            <View style={styles.memoryGrid}>
              {memories.map((memory) => {
                const selected = selectedMemoryIds.includes(memory.id);
                return (
                  <Pressable
                    key={memory.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={memory.title ?? 'Untitled memory'}
                    onPress={() => toggleMemory(memory.id)}
                    style={[styles.memoryChoice, { borderColor: selected ? theme.primary : theme.border, width: choiceWidth }]}
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
            <View style={[styles.noMemories, { backgroundColor: theme.backgroundTint }]}>
              <AppText variant="caption" tone="mutedText">No memories yet. You can create this capsule without attachments.</AppText>
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
  memorySection: { marginTop: spacing.lg },
  memoryHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  memoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  memoryChoice: { borderRadius: radius.md, borderWidth: 2, overflow: 'hidden', position: 'relative' },
  memoryImage: { aspectRatio: 1.25, width: '100%' },
  memoryTitle: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  selectionMark: { alignItems: 'center', borderRadius: radius.pill, height: 28, justifyContent: 'center', position: 'absolute', right: spacing.xs, top: spacing.xs, width: 28 },
  noMemories: { borderRadius: radius.md, marginTop: spacing.sm, padding: spacing.md },
  error: { marginTop: spacing.md },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg }
});
