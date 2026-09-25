import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../../../components/AppText';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Screen } from '../../../components/Screen';
import { TextField } from '../../../components/TextField';
import { useCurrentFamily } from '../../../lib/family-context';
import { getFamilyMembers, type FamilyMember } from '../../../lib/families';
import {
  addFamilyHouseholdMember,
  deleteFamilyHousehold,
  getFamilyHousehold,
  HouseholdApiError,
  removeFamilyHouseholdMember,
  updateFamilyHousehold,
  type HouseholdDetail
} from '../../../lib/households';

function BackLink() {
  return (
    <AppText
      accessibilityRole="link"
      onPress={() => router.replace('/(family)/family' as never)}
      variant="label"
      tone="primary"
      style={styles.backLink}
    >
      ‹ Back to Family
    </AppText>
  );
}

export default function HouseholdDetailScreen() {
  const family = useCurrentFamily();
  const params = useLocalSearchParams<{ householdId: string }>();
  const householdId = Array.isArray(params.householdId) ? params.householdId[0] : params.householdId;
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const canManage = family.role === 'owner' || family.role === 'guardian';

  const [detail, setDetail] = useState<HouseholdDetail | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!householdId) return;
    setError(null);
    try {
      setDetail(await getFamilyHousehold(family.familyId, householdId));
    } catch (err) {
      setError(err instanceof HouseholdApiError ? err.message : 'We could not open this group.');
    }
  }, [family.familyId, householdId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void getFamilyMembers(family.familyId).then(setFamilyMembers).catch(() => {}); }, [family.familyId]);

  async function removeMember(memberId: string) {
    if (!householdId) return;
    setBusy(true);
    try {
      setDetail(await removeFamilyHouseholdMember(family.familyId, householdId, memberId));
    } catch (err) {
      setError(err instanceof HouseholdApiError ? err.message : 'That member could not be removed.');
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove(member: { memberId: string; displayName: string }) {
    const run = () => void removeMember(member.memberId);
    if (Platform.OS === 'web') {
      const confirmFn = (globalThis as typeof globalThis & { confirm?: (message: string) => boolean }).confirm;
      if (confirmFn?.(`Remove ${member.displayName} from this group?`)) run();
      return;
    }
    Alert.alert(`Remove ${member.displayName}?`, 'They will stay in the family, just not this group.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: run }
    ]);
  }

  function confirmDelete() {
    if (!householdId || !detail) return;
    const run = async () => {
      setBusy(true);
      try {
        await deleteFamilyHousehold(family.familyId, householdId);
        router.replace('/(family)/family' as never);
      } catch (err) {
        setError(err instanceof HouseholdApiError ? err.message : 'This group could not be deleted.');
        setBusy(false);
      }
    };
    if (Platform.OS === 'web') {
      const confirmFn = (globalThis as typeof globalThis & { confirm?: (message: string) => boolean }).confirm;
      if (confirmFn?.(`Delete "${detail.household.name}"? Members stay in the family — only the group goes away.`)) void run();
      return;
    }
    Alert.alert(`Delete "${detail.household.name}"?`, 'Members stay in the family — only the group goes away.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run() }
    ]);
  }

  if (!detail && !error) {
    return (
      <Screen contentStyle={styles.state}>
        <ActivityIndicator color={theme.primary} />
        <AppText variant="caption" tone="mutedText" style={styles.stateText}>Opening this group…</AppText>
      </Screen>
    );
  }

  if (!detail) {
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

  const memberIds = new Set(detail.members.map((member) => member.memberId));
  const candidates = familyMembers.filter((member) => !memberIds.has(member.id));

  return (
    <Screen scroll maxWidth={760} contentStyle={styles.content}>
      <BackLink />

      {editing ? (
        <HouseholdEditor
          familyId={family.familyId}
          detail={detail}
          onCancel={() => setEditing(false)}
          onSaved={(next) => { setDetail(next); setEditing(false); }}
        />
      ) : (
        <Card style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={[styles.householdMark, { backgroundColor: theme.primarySoft }]}><AppText variant="heading" tone="primary">◈</AppText></View>
            <View style={styles.headerCopy}>
              <AppText variant="display" style={styles.title}>{detail.household.name}</AppText>
              {detail.household.description ? <AppText variant="body" tone="mutedText" style={styles.description}>{detail.household.description}</AppText> : null}
              <AppText variant="caption" tone="mutedText" style={styles.memberCount}>{detail.members.length} {detail.members.length === 1 ? 'member' : 'members'} · part of {family.familyName}</AppText>
            </View>
          </View>
          {canManage ? (
            <View style={styles.headerActions}>
              <Button label="Edit" variant="quiet" disabled={busy} onPress={() => setEditing(true)} />
              <Button label="Delete group" variant="quiet" disabled={busy} onPress={confirmDelete} />
            </View>
          ) : null}
        </Card>
      )}

      {error ? <AppText variant="caption" tone="danger" style={styles.formError}>{error}</AppText> : null}

      <View style={styles.sectionHeading}>
        <AppText variant="heading">Members</AppText>
        {canManage && !adding && candidates.length > 0 ? <Button label="Add member" variant="secondary" onPress={() => setAdding(true)} /> : null}
      </View>

      {adding ? (
        <AddMemberPicker
          familyId={family.familyId}
          householdId={detail.household.id}
          candidates={candidates}
          onCancel={() => setAdding(false)}
          onAdded={(next) => { setDetail(next); setAdding(false); }}
        />
      ) : null}

      {detail.members.length === 0 ? (
        <Card style={styles.empty}>
          <AppText variant="title" tone="mutedText">◈</AppText>
          <AppText variant="label" style={styles.emptyTitle}>No members yet</AppText>
          <AppText variant="caption" tone="mutedText" align="center">
            {canManage ? 'Add family members to this group.' : 'An owner or guardian hasn’t added anyone here yet.'}
          </AppText>
        </Card>
      ) : (
        <View style={styles.memberList}>
          {detail.members.map((member) => (
            <Card key={member.memberId} style={styles.memberCard}>
              <Avatar name={member.displayName} imageUrl={member.avatar} size={44} />
              <View style={styles.memberCopy}>
                <AppText variant="label">{member.displayName}</AppText>
                <AppText variant="caption" tone="mutedText">{member.role === 'owner' ? 'Family creator' : member.role === 'guardian' ? 'Guardian' : 'Family member'}</AppText>
              </View>
              {canManage ? <Button label="Remove" variant="quiet" disabled={busy} onPress={() => confirmRemove(member)} /> : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

function HouseholdEditor({ familyId, detail, onCancel, onSaved }: {
  familyId: string;
  detail: HouseholdDetail;
  onCancel: () => void;
  onSaved: (detail: HouseholdDetail) => void;
}) {
  const [name, setName] = useState(detail.household.name);
  const [description, setDescription] = useState(detail.household.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateFamilyHousehold(familyId, detail.household.id, { name, description: description.trim() || undefined });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof HouseholdApiError ? err.message : 'This group could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card elevated style={styles.headerCard}>
      <AppText variant="heading">Edit group</AppText>
      <TextField label="Name" value={name} onChangeText={setName} maxLength={80} autoFocus />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} maxLength={500} multiline />
      {error ? <AppText variant="caption" tone="danger" style={styles.formError}>{error}</AppText> : null}
      <View style={styles.formActions}>
        <Button label="Cancel" variant="quiet" onPress={onCancel} disabled={saving} />
        <Button label="Save changes" loading={saving} onPress={() => void save()} />
      </View>
    </Card>
  );
}

function AddMemberPicker({ familyId, householdId, candidates, onCancel, onAdded }: {
  familyId: string;
  householdId: string;
  candidates: FamilyMember[];
  onCancel: () => void;
  onAdded: (detail: HouseholdDetail) => void;
}) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!selectedId) { setError('Choose a family member to add.'); return; }
    setSaving(true);
    setError(null);
    try {
      const updated = await addFamilyHouseholdMember(familyId, householdId, selectedId);
      onAdded(updated);
    } catch (err) {
      setError(err instanceof HouseholdApiError ? err.message : 'That member could not be added.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card elevated style={styles.headerCard}>
      <AppText variant="label">Who should join this group?</AppText>
      <View style={styles.candidateChips}>
        {candidates.map((member) => (
          <Pressable
            key={member.id}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedId === member.id }}
            onPress={() => setSelectedId(member.id)}
            style={[styles.chip, { backgroundColor: selectedId === member.id ? theme.primarySoft : theme.input, borderColor: selectedId === member.id ? theme.primary : theme.border }]}
          >
            <AppText variant="caption" tone={selectedId === member.id ? 'primary' : 'text'}>{member.displayName}</AppText>
          </Pressable>
        ))}
      </View>
      {error ? <AppText variant="caption" tone="danger" style={styles.formError}>{error}</AppText> : null}
      <View style={styles.formActions}>
        <Button label="Cancel" variant="quiet" onPress={onCancel} disabled={saving} />
        <Button label="Add to group" loading={saving} onPress={() => void add()} />
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
  headerRow: { flexDirection: 'row', gap: spacing.md },
  householdMark: { alignItems: 'center', borderRadius: radius.md, height: 56, justifyContent: 'center', width: 56 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { marginTop: spacing.xs },
  description: { marginTop: spacing.sm },
  memberCount: { marginTop: spacing.md },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  formError: { marginTop: spacing.md },
  formActions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.lg },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.xxl },
  candidateChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: { borderRadius: radius.pill, borderWidth: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md },
  empty: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, padding: spacing.xl },
  emptyTitle: { marginBottom: spacing.xs, marginTop: spacing.sm },
  memberList: { gap: spacing.sm, marginTop: spacing.md },
  memberCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  memberCopy: { flex: 1, minWidth: 0 }
});
