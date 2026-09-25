import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../../../components/AppText';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { MemberAvatar } from '../../../components/MemberAvatar';
import { Screen } from '../../../components/Screen';
import { TaskEditor } from '../../../components/TaskEditor';
import { useCurrentFamily } from '../../../lib/family-context';
import { getFamilyMembers, type FamilyMember } from '../../../lib/families';
import { getFamilyHouseholds, type Household } from '../../../lib/households';
import {
  deleteFamilyTask,
  formatTaskAudience,
  getFamilyTask,
  setTaskCompletion,
  TaskApiError,
  type TaskDetail
} from '../../../lib/tasks';

const POLL_INTERVAL_MS = 15_000;

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function BackLink() {
  return (
    <AppText accessibilityRole="link" onPress={() => router.replace('/(family)/tasks' as never)} variant="label" tone="primary" style={styles.backLink}>
      ‹ Back to Tasks
    </AppText>
  );
}

export default function TaskDetailScreen() {
  const family = useCurrentFamily();
  const params = useLocalSearchParams<{ taskId: string }>();
  const taskId = Array.isArray(params.taskId) ? params.taskId[0] : params.taskId;
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const focusedRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (!taskId || !focusedRef.current || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const next = await getFamilyTask(family.familyId, taskId);
      if (focusedRef.current) {
        setTask(next);
        setError(null);
      }
    } catch (err) {
      if (focusedRef.current) setError(err instanceof TaskApiError ? err.message : 'We could not open this task.');
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [family.familyId, taskId]);

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

  async function toggleCompletion() {
    if (!taskId || completing || !task) return;
    setCompleting(true);
    setActionError(null);
    try {
      const next = await setTaskCompletion(family.familyId, taskId, !task.myCompletedAt);
      setTask(next);
    } catch (err) {
      setActionError(err instanceof TaskApiError ? err.message : 'That could not be updated.');
    } finally {
      setCompleting(false);
    }
  }

  function confirmDelete() {
    if (!taskId) return;
    const remove = async () => {
      setDeleting(true);
      try {
        await deleteFamilyTask(family.familyId, taskId);
        router.replace('/(family)/tasks' as never);
      } catch (err) {
        setActionError(err instanceof TaskApiError ? err.message : 'This task could not be deleted.');
        setDeleting(false);
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this task? This cannot be undone.')) void remove();
    } else {
      Alert.alert('Delete task?', 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void remove() }]);
    }
  }

  if (error) {
    return (
      <Screen scroll maxWidth={720} contentStyle={styles.content}>
        <BackLink />
        <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{error}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      </Screen>
    );
  }

  if (!task) {
    return (
      <Screen scroll maxWidth={720} contentStyle={styles.content}>
        <BackLink />
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
          <AppText variant="caption" tone="mutedText" style={styles.loadingText}>Loading…</AppText>
        </View>
      </Screen>
    );
  }

  if (editing) {
    return (
      <Screen scroll maxWidth={720} contentStyle={styles.content}>
        <BackLink />
        <TaskEditor
          familyId={family.familyId}
          myMemberId={family.id}
          isPrivileged={family.role === 'owner' || family.role === 'guardian'}
          task={task}
          households={households}
          members={members}
          onCancel={() => setEditing(false)}
          onSaved={async (saved) => { setTask(saved); setEditing(false); }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll maxWidth={720} contentStyle={styles.content}>
      <BackLink />

      <Card elevated style={styles.headerCard}>
        <View style={styles.headerRow}>
          <MemberAvatar member={task.createdBy} familyId={family.familyId} size={48} />
          <View style={styles.headerCopy}>
            <AppText variant="heading">{task.title}</AppText>
            <AppText variant="caption" tone="mutedText">
              {formatTaskAudience(task.audience, task.totalAssignees)} · created by {task.createdBy.displayName}
            </AppText>
          </View>
        </View>

        {task.description ? <AppText variant="body" style={styles.description}>{task.description}</AppText> : null}
        {task.dueAt ? <AppText variant="caption" tone="mutedText" style={styles.dueText}>Due {formatDateTime(task.dueAt)}</AppText> : null}

        <AppText variant="caption" tone="mutedText" style={styles.progressText}>
          {task.completedAssignees} of {task.totalAssignees} completed
        </AppText>

        {actionError ? <AppText variant="caption" tone="danger" style={styles.formError}>{actionError}</AppText> : null}

        {task.isAssignedToMe ? (
          <Button
            label={task.myCompletedAt ? 'Mark as not done' : 'Mark as done'}
            variant={task.myCompletedAt ? 'secondary' : 'primary'}
            loading={completing}
            onPress={() => void toggleCompletion()}
            style={styles.completeButton}
          />
        ) : null}

        {task.isCreator ? (
          <View style={styles.creatorActions}>
            <Button label="Edit task" variant="secondary" onPress={() => setEditing(true)} />
            <Button label="Delete task" variant="quiet" loading={deleting} onPress={confirmDelete} />
          </View>
        ) : null}
      </Card>

      <View style={styles.sectionHeading}>
        <AppText variant="heading">Assignees</AppText>
      </View>

      <View style={styles.assigneeList}>
        {task.assignees.map((assignee) => (
          <Card key={assignee.memberId} style={styles.assigneeCard}>
            <View style={styles.personRow}>
              <MemberAvatar member={assignee} familyId={family.familyId} size={36} />
              <View style={styles.detailCopy}>
                <AppText variant="label">{assignee.displayName}</AppText>
                <AppText variant="caption" tone={assignee.completedAt ? 'success' : 'mutedText'}>
                  {assignee.completedAt ? `Completed ${formatDateTime(assignee.completedAt)}` : 'Pending'}
                </AppText>
              </View>
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xl },
  backLink: { marginBottom: spacing.md },
  messageCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  loading: { alignItems: 'center', paddingVertical: spacing.xxxl },
  loadingText: { marginTop: spacing.md },
  headerCard: { padding: spacing.xl },
  headerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  headerCopy: { flex: 1, minWidth: 0 },
  description: { marginTop: spacing.lg },
  dueText: { marginTop: spacing.sm },
  progressText: { marginTop: spacing.md },
  formError: { marginTop: spacing.md },
  completeButton: { alignSelf: 'flex-start', marginTop: spacing.lg },
  creatorActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  sectionHeading: { marginTop: spacing.xxl },
  assigneeList: { gap: spacing.sm, marginTop: spacing.md },
  assigneeCard: { padding: spacing.md },
  personRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  detailCopy: { flex: 1, minWidth: 0 }
});
