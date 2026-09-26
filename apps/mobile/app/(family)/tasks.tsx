import { useAppTheme } from '../../lib/app-theme';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { radius, spacing } from '@familyapp/config';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { MemberAvatar } from '../../components/MemberAvatar';
import { Screen } from '../../components/Screen';
import { TaskEditor } from '../../components/TaskEditor';
import { useCurrentFamily } from '../../lib/family-context';
import { getFamilyMembers, type FamilyMember } from '../../lib/families';
import { getFamilyHouseholds, type Household } from '../../lib/households';
import { formatTaskAudience, getFamilyTasks, TaskApiError, type TaskSummary } from '../../lib/tasks';

const POLL_INTERVAL_MS = 30_000;
type Tab = 'assignedToMe' | 'assignedByMe' | 'completed';

// A task is "fully completed" only once every one of its assignments is done — used both
// to move a creator's task out of "Assigned by me" and into "Completed", and to decide
// whether the creator sees it as done. Guarded against totalAssignees === 0 so a task that
// (in principle) has no assignment rows is never spuriously treated as complete.
function isFullyCompleted(task: TaskSummary) {
  return task.totalAssignees > 0 && task.completedAssignees === task.totalAssignees;
}

function formatDueAt(value: string) {
  const date = new Date(value);
  const isOverdue = date.getTime() < Date.now();
  const text = date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return isOverdue ? `Overdue · ${text}` : `Due ${text}`;
}

export default function TasksScreen() {
  const family = useCurrentFamily();
  const { colors: theme } = useAppTheme();

  const [tasks, setTasks] = useState<TaskSummary[] | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('assignedToMe');
  const [creating, setCreating] = useState(false);

  const focusedRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (!focusedRef.current || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const next = await getFamilyTasks(family.familyId);
      if (focusedRef.current) {
        setTasks(next);
        setError(null);
      }
    } catch (err) {
      if (focusedRef.current) setError(err instanceof TaskApiError ? err.message : 'We could not load family tasks.');
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

  useFocusEffect(useCallback(() => {
    void getFamilyMembers(family.familyId).then(setMembers).catch(() => {});
    void getFamilyHouseholds(family.familyId).then(setHouseholds).catch(() => {});
  }, [family.familyId]));

  const isPrivileged = family.role === 'owner' || family.role === 'guardian';

  // Each list below is built with a single filter pass over `tasks`, so a task that
  // matches more than one condition (e.g. a creator who is also an assignee) can still
  // only ever appear once within a given tab — never a concatenation of separate arrays
  // that could double it up.
  const { assignedToMe, assignedByMe, completed } = useMemo(() => {
    const list = tasks ?? [];
    return {
      // Tasks I'm personally assigned to and haven't completed myself. Being the creator
      // of a task does not put it here unless I'm also an assignee.
      assignedToMe: list.filter((task) => task.isAssignedToMe && !task.myCompletedAt),
      // Tasks I created that are not yet fully completed by everyone assigned — shown here
      // even when I'm not an assignee myself, so I can keep monitoring them.
      assignedByMe: list.filter((task) => task.isCreator && !isFullyCompleted(task)),
      // My own completed assignment, OR (for a task I created) once every assignee has
      // completed it — whichever applies. A task I both created and am assigned to lands
      // here once, the moment either condition becomes true.
      completed: list.filter((task) => (task.isAssignedToMe && task.myCompletedAt) || (task.isCreator && isFullyCompleted(task)))
    };
  }, [tasks]);

  const visible = tab === 'assignedToMe' ? assignedToMe : tab === 'assignedByMe' ? assignedByMe : completed;

  return (
    <Screen scroll maxWidth={840} contentStyle={styles.content}>
      <View style={styles.headingRow}>
        <View>
          <AppText variant="display" style={styles.title}>Tasks</AppText>
          <AppText variant="body" tone="mutedText" style={styles.subtitle}>Chores and to-dos your family can share.</AppText>
        </View>
      </View>

      {creating ? (
        <TaskEditor
          familyId={family.familyId}
          myMemberId={family.id}
          isPrivileged={isPrivileged}
          households={households}
          members={members}
          onCancel={() => setCreating(false)}
          onSaved={async () => { setCreating(false); await load(); }}
        />
      ) : (
        <Button label="Add a task" onPress={() => setCreating(true)} style={styles.addButton} />
      )}

      <View style={styles.tabs}>
        <TabChip label="Assigned to me" active={tab === 'assignedToMe'} onPress={() => setTab('assignedToMe')} />
        <TabChip label="Assigned by me" active={tab === 'assignedByMe'} onPress={() => setTab('assignedByMe')} />
        <TabChip label="Completed" active={tab === 'completed'} onPress={() => setTab('completed')} />
      </View>

      {error ? (
        <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{error}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      ) : tasks === null ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
          <AppText variant="caption" tone="mutedText" style={styles.loadingText}>Loading tasks…</AppText>
        </View>
      ) : visible.length === 0 ? (
        <Card style={styles.empty}>
          <AppText variant="label" style={styles.emptyTitle}>
            {tab === 'assignedToMe' ? 'All caught up' : tab === 'completed' ? 'Nothing completed yet' : 'Nothing assigned by you yet'}
          </AppText>
          <AppText variant="caption" tone="mutedText" align="center">
            {tab === 'assignedToMe' ? 'You have no outstanding tasks.' : tab === 'completed' ? 'Tasks you finish, or fully complete, will show up here.' : 'Tasks you create will show up here so you can track their progress.'}
          </AppText>
        </Card>
      ) : (
        <View style={styles.list}>
          {visible.map((task) => (
            <Pressable key={task.id} accessibilityRole="button" onPress={() => router.push(`/(family)/tasks/${task.id}` as never)}>
              <Card style={styles.taskCard}>
                <View style={styles.taskRow}>
                  <MemberAvatar member={task.createdBy} familyId={family.familyId} size={36} />
                  <View style={styles.detailCopy}>
                    <AppText variant="label" numberOfLines={2}>{task.title}</AppText>
                    <AppText variant="caption" tone="mutedText">
                      {formatTaskAudience(task.audience, task.totalAssignees)} · by {task.createdBy.displayName}
                    </AppText>
                    {task.dueAt ? <AppText variant="caption" tone="mutedText" style={styles.dueText}>{formatDueAt(task.dueAt)}</AppText> : null}
                  </View>
                  {task.isCreator ? (
                    <View style={[styles.progressBadge, { backgroundColor: isFullyCompleted(task) ? theme.successSoft : theme.primarySoft }]}>
                      <AppText variant="caption" tone={isFullyCompleted(task) ? 'success' : 'primary'}>{task.completedAssignees} of {task.totalAssignees}</AppText>
                    </View>
                  ) : task.myCompletedAt ? (
                    <View style={[styles.progressBadge, { backgroundColor: theme.successSoft }]}>
                      <AppText variant="caption" tone="success">Done</AppText>
                    </View>
                  ) : null}
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

function TabChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors: theme } = useAppTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.chip, { backgroundColor: active ? theme.primarySoft : theme.input, borderColor: active ? theme.primary : theme.border }]}>
      <AppText variant="label" tone={active ? 'primary' : 'text'}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xl },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between' },
  title: { marginTop: spacing.xs },
  subtitle: { marginTop: spacing.sm },
  addButton: { alignSelf: 'flex-start', marginTop: spacing.lg },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xl },
  chip: { borderRadius: radius.pill, borderWidth: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md },
  messageCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.lg },
  loading: { alignItems: 'center', paddingVertical: spacing.xxxl },
  loadingText: { marginTop: spacing.md },
  empty: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, padding: spacing.xl },
  emptyTitle: { marginBottom: spacing.xs },
  list: { gap: spacing.md, marginTop: spacing.md },
  taskCard: { padding: spacing.lg },
  taskRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  detailCopy: { flex: 1, minWidth: 0 },
  dueText: { marginTop: spacing.xs },
  progressBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }
});
