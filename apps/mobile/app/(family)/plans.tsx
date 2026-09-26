import { useAppTheme } from '../../lib/app-theme';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { radius, spacing } from '@familyapp/config';

import { AppText } from '../../components/AppText';
import { MemberAvatar } from '../../components/MemberAvatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DateTimeField } from '../../components/DateTimeField';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useCurrentFamily } from '../../lib/family-context';
import { getFamilyMembers, type FamilyMember } from '../../lib/families';
import {
  createFamilyEvent, createFamilyTask, deleteFamilyEvent, deleteFamilyTask, getFamilyPlans,
  PlansApiError, setFamilyTaskCompletion, updateFamilyEvent, updateFamilyTask,
  type FamilyEvent, type FamilyPlans, type FamilyTask
} from '../../lib/plans';

type Editor = { kind: 'event'; item?: FamilyEvent } | { kind: 'task'; item?: FamilyTask } | null;

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function PlansScreen() {
  const family = useCurrentFamily();
  const { width } = useWindowDimensions();
  const { colors: theme } = useAppTheme();
  const [plans, setPlans] = useState<FamilyPlans | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [editor, setEditor] = useState<Editor>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextPlans, nextMembers] = await Promise.all([getFamilyPlans(family.familyId), getFamilyMembers(family.familyId)]);
      setPlans(nextPlans);
      setMembers(nextMembers);
    } catch (error) {
      setError(error instanceof PlansApiError ? error.message : 'We could not load your family plans.');
    }
  }, [family.familyId]);

  useEffect(() => { void load(); }, [load]);

  const upcoming = useMemo(() => {
    if (!plans) return [];
    return [
      ...plans.events.map((event) => ({ id: `event-${event.id}`, kind: 'Event', title: event.title, at: event.startsAt, color: theme.secondarySoft })),
      ...plans.tasks.filter((task) => !task.completedAt).map((task) => ({ id: `task-${task.id}`, kind: 'Task', title: task.title, at: task.dueAt, color: theme.successSoft }))
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()).slice(0, 3);
  }, [plans, theme.secondarySoft, theme.successSoft]);

  async function runAction(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try { await action(); await load(); }
    catch (error) { setError(error instanceof PlansApiError ? error.message : 'That change could not be saved.'); }
    finally { setBusyId(null); }
  }

  function confirmDelete(label: string, action: () => Promise<unknown>) {
    if (Platform.OS === 'web') {
      const confirm = (globalThis as typeof globalThis & { confirm?: (message: string) => boolean }).confirm;
      if (confirm?.(`Delete this ${label}? This cannot be undone.`)) void action();
      return;
    }
    Alert.alert(`Delete ${label}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void action() }
    ]);
  }

  return (
    <Screen scroll maxWidth={1080} contentStyle={styles.content}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}><AppText variant="eyebrow" tone="secondary">Shared family organizer</AppText><AppText variant="display" style={styles.title}>Plans</AppText><AppText variant="body" tone="mutedText" style={styles.subtitle}>Dates to remember and little things to get done, together.</AppText></View>
        <View style={styles.headingActions}><Button label="Add event" onPress={() => setEditor({ kind: 'event' })} /><Button label="Add task" variant="secondary" onPress={() => setEditor({ kind: 'task' })} /></View>
      </View>

      {editor?.kind === 'event' ? <EventEditor familyId={family.familyId} event={editor.item} onCancel={() => setEditor(null)} onSaved={async () => { setEditor(null); await load(); }} /> : null}
      {editor?.kind === 'task' ? <TaskEditor familyId={family.familyId} task={editor.item} members={members} onCancel={() => setEditor(null)} onSaved={async () => { setEditor(null); await load(); }} /> : null}
      {error ? <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}><AppText variant="body" tone="danger">{error}</AppText><Button label="Try again" variant="quiet" onPress={() => void load()} /></Card> : null}
      {!plans && !error ? <View style={styles.loading}><ActivityIndicator color={theme.primary} /><AppText variant="caption" tone="mutedText" style={styles.loadingText}>Gathering your family plans…</AppText></View> : null}

      {plans ? <>
        <View style={styles.sectionHeading}><AppText variant="heading">Coming up</AppText><AppText variant="caption" tone="mutedText">The nearest plans at a glance</AppText></View>
        {upcoming.length ? <View style={styles.upcomingGrid}>{upcoming.map((item) => <Card key={item.id} style={[styles.upcomingCard, { backgroundColor: item.color }]}><AppText variant="caption" tone="mutedText">{item.kind.toUpperCase()}</AppText><AppText variant="label" style={styles.upcomingTitle}>{item.title}</AppText><AppText variant="caption" tone="mutedText">{formatDate(item.at)}</AppText></Card>)}</View> : <EmptyState mark="◷" title="Nothing coming up yet" detail="Add an event or task when your family has something on the horizon." />}

        <View style={[styles.planColumns, width >= 1120 && styles.planColumnsWide]}>
          <View style={styles.planColumn}>
            <View style={styles.sectionHeading}><AppText variant="heading">Events</AppText><AppText variant="caption" tone="mutedText">{plans.events.length} upcoming</AppText></View>
            {plans.events.length ? <View style={styles.list}>{plans.events.map((event) => {
              const canManage = family.role !== 'member' || event.createdByMemberId === family.id;
              return <EventCard key={event.id} event={event} canManage={canManage} busy={busyId === event.id} onEdit={() => setEditor({ kind: 'event', item: event })} onDelete={() => confirmDelete('event', () => runAction(event.id, () => deleteFamilyEvent(family.familyId, event.id)))} familyId={family.familyId} />;
            })}</View> : <EmptyState mark="◇" title="No events yet" detail="Birthdays, appointments and family days can live here." compact />}
          </View>
          <View style={styles.planColumn}>
            <View style={styles.sectionHeading}><AppText variant="heading">Tasks</AppText><AppText variant="caption" tone="mutedText">{plans.tasks.filter((task) => !task.completedAt).length} pending</AppText></View>
            {plans.tasks.length ? <View style={styles.list}>{plans.tasks.map((task) => {
              const canManage = family.role !== 'member' || task.createdByMemberId === family.id;
              const canComplete = canManage || task.assignedMemberId === family.id;
              return <TaskCard key={task.id} task={task} canManage={canManage} canComplete={canComplete} busy={busyId === task.id} onToggle={() => void runAction(task.id, () => setFamilyTaskCompletion(family.familyId, task.id, !task.completedAt))} onEdit={() => setEditor({ kind: 'task', item: task })} onDelete={() => confirmDelete('task', () => runAction(task.id, () => deleteFamilyTask(family.familyId, task.id)))} familyId={family.familyId} />;
            })}</View> : <EmptyState mark="✓" title="No tasks yet" detail="Add a shared to-do when something needs a helping hand." compact />}
          </View>
        </View>
      </> : null}
    </Screen>
  );
}

function EventEditor({ familyId, event, onCancel, onSaved }: { familyId: string; event?: FamilyEvent; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [startsAt, setStartsAt] = useState<string | null>(event ? event.startsAt : new Date(Date.now() + 60 * 60 * 1000).toISOString());
  const [endsAt, setEndsAt] = useState<string | null>(event?.endsAt ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!startsAt) return setError('Choose a start date and time.');
    setSaving(true); setError(null);
    try { const input = { title, description, startsAt, endsAt: endsAt ?? undefined }; if (event) await updateFamilyEvent(familyId, event.id, input); else await createFamilyEvent(familyId, input); await onSaved(); }
    catch (error) { setError(error instanceof PlansApiError ? error.message : 'The event could not be saved.'); }
    finally { setSaving(false); }
  }
  return <Card elevated style={styles.editor}><AppText variant="heading">{event ? 'Edit event' : 'Add an event'}</AppText><TextField label="Title" value={title} onChangeText={setTitle} maxLength={140} autoFocus /><TextField label="Description (optional)" value={description} onChangeText={setDescription} multiline /><View style={styles.formRow}><View style={styles.formField}><DateTimeField label="Starts" value={startsAt} onChange={setStartsAt} /></View><View style={styles.formField}><DateTimeField label="Ends (optional)" value={endsAt} onChange={setEndsAt} minimumDate={startsAt ? new Date(startsAt) : undefined} /></View></View>{error ? <AppText variant="caption" tone="danger" style={styles.formError}>{error}</AppText> : null}<View style={styles.formActions}><Button label="Cancel" variant="quiet" onPress={onCancel} /><Button label={event ? 'Save event' : 'Create event'} loading={saving} onPress={() => void save()} /></View></Card>;
}

function TaskEditor({ familyId, task, members, onCancel, onSaved }: { familyId: string; task?: FamilyTask; members: FamilyMember[]; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(task?.title ?? ''); const [description, setDescription] = useState(task?.description ?? '');
  const [dueAt, setDueAt] = useState<string | null>(task ? task.dueAt : new Date(Date.now() + 60 * 60 * 1000).toISOString());
  const [assignedMemberId, setAssignedMemberId] = useState<string | null>(task?.assignedMemberId ?? null);
  const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  async function save() {
    if (!dueAt) return setError('Choose a due date and time.');
    setSaving(true); setError(null);
    try { const input = { title, description, dueAt, assignedMemberId }; if (task) await updateFamilyTask(familyId, task.id, input); else await createFamilyTask(familyId, input); await onSaved(); }
    catch (error) { setError(error instanceof PlansApiError ? error.message : 'The task could not be saved.'); }
    finally { setSaving(false); }
  }
  return <Card elevated style={styles.editor}><AppText variant="heading">{task ? 'Edit task' : 'Add a task'}</AppText><TextField label="Title" value={title} onChangeText={setTitle} maxLength={140} autoFocus /><TextField label="Description (optional)" value={description} onChangeText={setDescription} multiline /><DateTimeField label="Due" value={dueAt} onChange={setDueAt} /><AppText variant="label" style={styles.assignLabel}>Assign to (optional)</AppText><View style={styles.memberChoices}><MemberChoice label="Anyone" selected={!assignedMemberId} onPress={() => setAssignedMemberId(null)} />{members.map((member) => <MemberChoice key={member.id} label={member.displayName} selected={assignedMemberId === member.id} onPress={() => setAssignedMemberId(member.id)} />)}</View>{error ? <AppText variant="caption" tone="danger" style={styles.formError}>{error}</AppText> : null}<View style={styles.formActions}><Button label="Cancel" variant="quiet" onPress={onCancel} /><Button label={task ? 'Save task' : 'Create task'} loading={saving} onPress={() => void save()} /></View></Card>;
}

function MemberChoice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors: theme } = useAppTheme();
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.memberChoice, { backgroundColor: selected ? theme.primarySoft : theme.input, borderColor: selected ? theme.primary : theme.border }]}><AppText variant="caption" tone={selected ? 'primary' : 'text'}>{label}</AppText></Pressable>;
}

function EventCard({ event, canManage, busy, onEdit, onDelete, familyId }: { event: FamilyEvent; canManage: boolean; busy: boolean; onEdit: () => void; onDelete: () => void; familyId: string }) {
  const { colors: theme } = useAppTheme();
  return <Card style={styles.itemCard}><View style={[styles.dateMark, { backgroundColor: theme.secondarySoft }]}><AppText variant="caption" tone="secondary">{new Date(event.startsAt).toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</AppText><AppText variant="heading" tone="secondary">{new Date(event.startsAt).getDate()}</AppText></View><View style={styles.itemCopy}><AppText variant="label">{event.title}</AppText><AppText variant="caption" tone="mutedText" style={styles.itemMeta}>{formatDate(event.startsAt)}{event.endsAt ? ` – ${formatDate(event.endsAt)}` : ''}</AppText>{event.description ? <AppText variant="body" tone="mutedText" style={styles.itemDescription}>{event.description}</AppText> : null}<View style={styles.personRow}><MemberAvatar member={event.createdBy} familyId={familyId} size={24} /><AppText variant="caption" tone="mutedText">Created by {event.createdBy.displayName}</AppText></View>{canManage ? <View style={styles.itemActions}><Button label="Edit" variant="quiet" disabled={busy} onPress={onEdit} /><Button label="Delete" variant="quiet" disabled={busy} onPress={onDelete} /></View> : null}</View></Card>;
}

function TaskCard({ task, canManage, canComplete, busy, onToggle, onEdit, onDelete, familyId }: { task: FamilyTask; canManage: boolean; canComplete: boolean; busy: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void; familyId: string }) {
  const { colors: theme } = useAppTheme(); const complete = Boolean(task.completedAt);
  return <Card style={[styles.itemCard, complete && styles.completedCard]}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: complete, disabled: !canComplete || busy }} disabled={!canComplete || busy} onPress={onToggle} style={[styles.check, { borderColor: complete ? theme.success : theme.borderStrong, backgroundColor: complete ? theme.success : 'transparent' }]}><AppText variant="label" style={{ color: complete ? theme.textOnPrimary : theme.mutedText }}>{complete ? '✓' : ''}</AppText></Pressable><View style={styles.itemCopy}><AppText variant="label" style={complete ? styles.completedText : undefined}>{task.title}</AppText><AppText variant="caption" tone="mutedText" style={styles.itemMeta}>Due {formatDate(task.dueAt)}</AppText>{task.description ? <AppText variant="body" tone="mutedText" style={[styles.itemDescription, complete && styles.completedText]}>{task.description}</AppText> : null}<View style={styles.personRow}><MemberAvatar member={task.createdBy} familyId={familyId} size={24} /><AppText variant="caption" tone="mutedText">Created by {task.createdBy.displayName}{task.assignedTo ? ` · For ${task.assignedTo.displayName}` : ''}</AppText></View><View style={styles.itemActions}>{canComplete ? <Button label={complete ? 'Reopen' : 'Complete'} variant="quiet" loading={busy} onPress={onToggle} /> : null}{canManage ? <><Button label="Edit" variant="quiet" disabled={busy} onPress={onEdit} /><Button label="Delete" variant="quiet" disabled={busy} onPress={onDelete} /></> : null}</View></View></Card>;
}

function EmptyState({ mark, title, detail, compact = false }: { mark: string; title: string; detail: string; compact?: boolean }) {
  return <Card style={[styles.empty, compact && styles.emptyCompact]}><AppText variant="title" tone="mutedText">{mark}</AppText><AppText variant="label" style={styles.emptyTitle}>{title}</AppText><AppText variant="caption" tone="mutedText" align="center">{detail}</AppText></Card>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xl },
  headingRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, justifyContent: 'space-between' }, headingCopy: { flex: 1, minWidth: 260 }, headingActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  title: { marginTop: spacing.xs }, subtitle: { marginTop: spacing.sm }, editor: { marginTop: spacing.xl, padding: spacing.xl },
  formRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, formField: { flex: 1, minWidth: 220 }, formActions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.lg }, formError: { marginTop: spacing.md },
  assignLabel: { marginTop: spacing.lg }, memberChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }, memberChoice: { borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md },
  messageCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.lg }, loading: { alignItems: 'center', paddingVertical: spacing.xxxl }, loadingText: { marginTop: spacing.md },
  sectionHeading: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.xxl }, upcomingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md }, upcomingCard: { flex: 1, minHeight: 122, minWidth: 210 }, upcomingTitle: { marginBottom: spacing.sm, marginTop: spacing.sm },
  planColumns: { gap: spacing.xl }, planColumnsWide: { flexDirection: 'row' }, planColumn: { flex: 1, minWidth: 0 }, list: { gap: spacing.sm, marginTop: spacing.md }, itemCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md }, completedCard: { opacity: 0.72 },
  dateMark: { alignItems: 'center', borderRadius: radius.md, justifyContent: 'center', minHeight: 62, width: 58 }, check: { alignItems: 'center', borderRadius: 13, borderWidth: 2, height: 26, justifyContent: 'center', width: 26 }, itemCopy: { flex: 1, minWidth: 0 }, itemMeta: { marginTop: spacing.xs }, itemDescription: { marginTop: spacing.sm }, completedText: { textDecorationLine: 'line-through' },
  personRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }, itemActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm }, empty: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, minHeight: 180, padding: spacing.xl }, emptyCompact: { minHeight: 220 }, emptyTitle: { marginBottom: spacing.xs, marginTop: spacing.sm }
});
