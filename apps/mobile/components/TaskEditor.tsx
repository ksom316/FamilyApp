import { useRef, useState } from 'react';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';
import { DateTimeField } from './DateTimeField';
import { TextField } from './TextField';
import type { FamilyMember } from '../lib/families';
import type { Household } from '../lib/households';
import {
  createFamilyTask,
  TaskApiError,
  updateFamilyTask,
  type TaskDetail,
  type TaskInput,
  type UpdateTaskInput
} from '../lib/tasks';

type Selection = 'family' | 'household' | 'members' | 'justMe';

export function TaskEditor({ familyId, myMemberId, isPrivileged, task, households, members, onCancel, onSaved }: {
  familyId: string;
  myMemberId: string;
  isPrivileged: boolean;
  task?: TaskDetail;
  households: Household[];
  members: FamilyMember[];
  onCancel: () => void;
  onSaved: (task: TaskDetail) => Promise<void> | void;
}) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];

  const initialSelection: Selection = (() => {
    if (!task) return 'family';
    if (task.audience.type === 'household') return 'household';
    if (task.audience.type === 'members') {
      return task.assignees.length === 1 && task.assignees[0]?.memberId === myMemberId ? 'justMe' : 'members';
    }
    return 'family';
  })();

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [dueAt, setDueAt] = useState<string | null>(task?.dueAt ?? null);
  const [selection, setSelection] = useState<Selection>(initialSelection);
  const [householdId, setHouseholdId] = useState<string | null>(task?.audience.type === 'household' ? task.audience.household.id : null);
  const [memberIds, setMemberIds] = useState<string[]>(
    task?.audience.type === 'members' && initialSelection === 'members' ? task.assignees.map((a) => a.memberId) : []
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  function toggleMember(memberId: string) {
    setMemberIds((current) => current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId]);
  }

  async function save() {
    if (savingRef.current) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return setError('Give this task a title.');
    if (selection === 'household' && !householdId) return setError('Choose a family group.');
    if (selection === 'members' && memberIds.length === 0) return setError('Choose at least one person.');

    const base = { title: trimmedTitle, description: description.trim() || null, dueAt };
    const input: TaskInput | UpdateTaskInput = selection === 'household'
      ? { ...base, audienceType: 'household', householdId: householdId as string }
      : selection === 'members'
        ? { ...base, audienceType: 'members', memberIds }
        : selection === 'justMe'
          ? { ...base, audienceType: 'members', memberIds: [myMemberId] }
          : { ...base, audienceType: 'family' };

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const saved = task ? await updateFamilyTask(familyId, task.id, input) : await createFamilyTask(familyId, input as TaskInput);
      await onSaved(saved);
    } catch (caught) {
      setError(caught instanceof TaskApiError ? caught.message : 'This task could not be saved.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Card elevated style={styles.editor}>
      <AppText variant="heading">{task ? 'Edit task' : 'New task'}</AppText>
      <TextField label="Title" value={title} onChangeText={setTitle} maxLength={140} autoFocus />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} maxLength={2000} multiline />
      <DateTimeField label="Due date (optional)" value={dueAt} onChange={setDueAt} />

      <AppText variant="label" style={styles.audienceLabel}>Who is this for?</AppText>
      <View style={styles.audienceTabs}>
        <AudienceChoice label="Entire family" selected={selection === 'family'} onPress={() => setSelection('family')} />
        {isPrivileged ? <AudienceChoice label="Family group" selected={selection === 'household'} onPress={() => setSelection('household')} /> : null}
        {isPrivileged ? <AudienceChoice label="Specific people" selected={selection === 'members'} onPress={() => setSelection('members')} /> : null}
        <AudienceChoice label="Just me" selected={selection === 'justMe'} onPress={() => setSelection('justMe')} />
      </View>

      {selection === 'household' ? (
        <View style={styles.choices}>
          {households.length ? households.map((household) => <AudienceChoice key={household.id} label={household.name} selected={householdId === household.id} onPress={() => setHouseholdId(household.id)} />) : <AppText variant="caption" tone="mutedText">You do not currently belong to a family group.</AppText>}
        </View>
      ) : null}

      {selection === 'members' ? (
        <View>
          <AppText variant="caption" tone="mutedText" style={styles.selectionHint}>Choose one or more people.</AppText>
          <View style={styles.choices}>{members.map((member) => <AudienceChoice key={member.id} label={member.displayName} selected={memberIds.includes(member.id)} onPress={() => toggleMember(member.id)} />)}</View>
        </View>
      ) : null}

      {error ? <AppText variant="caption" tone="danger" style={styles.error}>{error}</AppText> : null}
      <View style={styles.actions}>
        <Button label="Cancel" variant="quiet" disabled={saving} onPress={onCancel} />
        <Button label={task ? 'Save changes' : 'Create task'} loading={saving} onPress={() => void save()} />
      </View>
    </Card>
  );
}

function AudienceChoice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.choice, { backgroundColor: selected ? theme.primarySoft : theme.input, borderColor: selected ? theme.primary : theme.border }]}><AppText variant="caption" tone={selected ? 'primary' : 'text'}>{label}</AppText></Pressable>;
}

const styles = StyleSheet.create({
  editor: { marginTop: spacing.lg, padding: spacing.xl },
  audienceLabel: { marginTop: spacing.lg },
  audienceTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  choice: { borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md },
  selectionHint: { marginTop: spacing.sm },
  error: { marginTop: spacing.md },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg }
});
