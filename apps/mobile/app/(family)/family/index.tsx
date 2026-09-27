import { useAppTheme } from '../../../lib/app-theme';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { radius, spacing } from '@familyapp/config';

import { AppText } from '../../../components/AppText';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { MemberAvatar } from '../../../components/MemberAvatar';
import { Screen } from '../../../components/Screen';
import { TextField } from '../../../components/TextField';
import { useCurrentFamily } from '../../../lib/family-context';
import { FamilyApiError, getFamilyMembers, removeFamilyMember, type FamilyMember } from '../../../lib/families';
import { createFamilyHousehold, getFamilyHouseholds, HouseholdApiError, type Household } from '../../../lib/households';
import { canShowRemoveMember, isStackedMemberCard } from '../../../lib/responsive-layout';

export default function FamilyScreen() {
  const family = useCurrentFamily();
  const { colors: theme } = useAppTheme();
  const canManage = family.role === 'owner' || family.role === 'guardian';
  const [members, setMembers] = useState<FamilyMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [households, setHouseholds] = useState<Household[] | null>(null);
  const [householdsError, setHouseholdsError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setError(null);
    setMembers(null);
    try {
      setMembers(await getFamilyMembers(family.familyId));
    } catch (error) {
      setError(error instanceof FamilyApiError ? error.message : 'We could not load family members.');
    }
  }, [family.familyId]);

  const loadHouseholds = useCallback(async () => {
    setHouseholdsError(null);
    try {
      setHouseholds(await getFamilyHouseholds(family.familyId));
    } catch (err) {
      setHouseholdsError(err instanceof HouseholdApiError ? err.message : 'We could not load the family network.');
    }
  }, [family.familyId]);

  useEffect(() => { void loadMembers(); }, [loadMembers]);
  useEffect(() => { void loadHouseholds(); }, [loadHouseholds]);

  async function removeMember(member: FamilyMember) {
    setRemovingMemberId(member.id);
    setError(null);
    try {
      await removeFamilyMember(family.familyId, member.id);
      setMembers((current) => current?.filter((entry) => entry.id !== member.id) ?? null);
      await loadHouseholds();
    } catch (caught) {
      setError(caught instanceof FamilyApiError ? caught.message : 'That member could not be removed right now.');
    } finally {
      setRemovingMemberId(null);
    }
  }

  function confirmRemoval(member: FamilyMember) {
    const message = `Remove ${member.displayName} from the family? They will immediately lose access to the family's private content.`;
    const run = () => void removeMember(member);
    if (Platform.OS === 'web') {
      const confirmFn = (globalThis as typeof globalThis & { confirm?: (text: string) => boolean }).confirm;
      if (confirmFn?.(message)) run();
      return;
    }
    Alert.alert(`Remove ${member.displayName} from the family?`, "They will immediately lose access to the family's private content.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: run }
    ]);
  }

  return (
    <Screen scroll maxWidth={920} contentStyle={styles.content}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}><AppText variant="eyebrow" tone="primary">Your people</AppText><AppText variant="display" style={styles.title}>{family.familyName}</AppText><AppText variant="body" tone="mutedText" style={styles.subtitle}>{members ? `${members.length} ${members.length === 1 ? 'member' : 'members'} in your family` : 'Your family, together in one place.'}</AppText></View>
        {canManage ? <Button label="Invite member" onPress={() => router.push('/(family)/invite' as never)} /> : null}
      </View>

      <View style={[styles.familyNote, { backgroundColor: theme.accentSoft }]}>
        <AppText variant="body" tone="text">A little space for the people who make this family yours.</AppText>
      </View>

      {error ? <Card style={styles.stateCard}><AppText variant="body" tone="danger">{error}</AppText><Button label="Try again" onPress={() => void loadMembers()} style={styles.retry} variant="secondary" /></Card> : null}
      {!members && !error ? <View style={styles.loading}><ActivityIndicator color={theme.primary} /><AppText variant="caption" tone="mutedText" style={styles.loadingText}>Gathering your people…</AppText></View> : null}
      {members ? <View style={styles.list}>{members.map((member) => (
        <MemberCard
          key={member.id}
          member={member}
          familyId={family.familyId}
          canRemove={canShowRemoveMember(family.id, family.role, member.id, member.role)}
          removing={removingMemberId === member.id}
          onRemove={() => confirmRemoval(member)}
        />
      ))}</View> : null}

      <View style={styles.sectionHeading}>
        <View style={styles.headingCopy}>
          <AppText variant="heading">Family Network</AppText>
          <AppText variant="caption" tone="mutedText" style={styles.sectionSubtitle}>Organize your family into groups like Parents, Kids, or a household.</AppText>
        </View>
        {canManage && !creating ? <Button label="New group" variant="secondary" onPress={() => setCreating(true)} /> : null}
      </View>

      {creating ? (
        <NewHouseholdEditor
          familyId={family.familyId}
          onCancel={() => setCreating(false)}
          onCreated={async () => { setCreating(false); await loadHouseholds(); }}
        />
      ) : null}

      {householdsError ? (
        <Card style={styles.stateCard}>
          <AppText variant="body" tone="danger">{householdsError}</AppText>
          <Button label="Try again" onPress={() => void loadHouseholds()} style={styles.retry} variant="secondary" />
        </Card>
      ) : null}

      {!households && !householdsError ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
          <AppText variant="caption" tone="mutedText" style={styles.loadingText}>Loading your family network…</AppText>
        </View>
      ) : null}

      {households && households.length === 0 && !creating ? (
        <Card style={[styles.empty, { backgroundColor: theme.secondarySoft }]}>
          <AppText variant="title" tone="secondary">♥</AppText>
          <AppText variant="label" style={styles.emptyTitle}>No groups yet</AppText>
          <AppText variant="caption" tone="mutedText" align="center">
            {canManage ? 'Create a group like "Parents" or "Kids" to organize your family.' : 'Ask an owner or guardian to set up your family groups.'}
          </AppText>
        </Card>
      ) : null}

      {households && households.length > 0 ? (
        <View style={styles.householdGrid}>
          {households.map((household) => <HouseholdCard key={household.id} household={household} />)}
        </View>
      ) : null}
    </Screen>
  );
}

function MemberCard({ member, familyId, canRemove, removing, onRemove }: {
  member: FamilyMember;
  familyId: string;
  canRemove: boolean;
  removing: boolean;
  onRemove: () => void;
}) {
  const { colors: theme } = useAppTheme();
  const { width } = useWindowDimensions();
  const stacked = isStackedMemberCard(width);
  const roleLabel = member.role === 'owner' ? 'Family creator' : member.role === 'guardian' ? 'Guardian' : 'Family member';
  const roleColor = member.role === 'owner' ? theme.primarySoft : member.role === 'guardian' ? theme.secondarySoft : theme.successSoft;
  const roleTone = member.role === 'owner' ? 'primary' : member.role === 'guardian' ? 'secondary' : 'success';
  const joined = new Date(member.joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

  return (
    <Card style={[styles.memberCard, stacked && styles.memberCardStacked]}>
      <View style={styles.memberIdentity}>
        <MemberAvatar member={{ ...member, memberId: member.id }} familyId={familyId} size={56} />
        <View style={styles.memberCopy}><AppText variant="label">{member.displayName}</AppText><AppText variant="caption" tone="mutedText" style={styles.joined}>With your family since {joined}</AppText></View>
      </View>
      <View style={[styles.memberControls, stacked && styles.memberControlsStacked]}>
        <View style={[styles.roleBadge, { backgroundColor: roleColor }]}><AppText variant="caption" tone={roleTone}>{roleLabel}</AppText></View>
        {canRemove ? <Button label="Remove" variant="quiet" loading={removing} onPress={onRemove} /> : null}
      </View>
    </Card>
  );
}

function HouseholdCard({ household }: { household: Household }) {
  const { colors: theme } = useAppTheme();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/(family)/family/${household.id}` as never)} style={styles.householdCardWrap}>
      <Card style={styles.householdCard}>
        <View style={[styles.householdMark, { backgroundColor: theme.primarySoft }]}><AppText variant="heading" tone="primary">◈</AppText></View>
        <View style={styles.householdCopy}>
          <AppText variant="label" numberOfLines={1}>{household.name}</AppText>
          {household.description ? <AppText variant="caption" tone="mutedText" numberOfLines={2} style={styles.householdDescription}>{household.description}</AppText> : null}
          <AppText variant="caption" tone="mutedText" style={styles.householdCount}>{household.memberCount} {household.memberCount === 1 ? 'member' : 'members'}</AppText>
        </View>
        <AppText variant="body" tone="mutedText">›</AppText>
      </Card>
    </Pressable>
  );
}

function NewHouseholdEditor({ familyId, onCancel, onCreated }: { familyId: string; onCancel: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await createFamilyHousehold(familyId, { name, description: description.trim() || undefined });
      await onCreated();
    } catch (err) {
      setError(err instanceof HouseholdApiError ? err.message : 'That group could not be created.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card elevated style={styles.editor}>
      <AppText variant="heading">New group</AppText>
      <TextField label="Name" value={name} onChangeText={setName} maxLength={80} placeholder="Parents, Kids, Accra Household…" autoFocus />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} maxLength={500} multiline />
      {error ? <AppText variant="caption" tone="danger" style={styles.formError}>{error}</AppText> : null}
      <View style={styles.formActions}>
        <Button label="Cancel" variant="quiet" onPress={onCancel} disabled={saving} />
        <Button label="Create group" loading={saving} onPress={() => void save()} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xl },
  headingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  headingCopy: { flex: 1, minWidth: 0 },
  title: { marginTop: spacing.xs },
  subtitle: { marginTop: spacing.sm },
  familyNote: { borderRadius: radius.lg, marginTop: spacing.xl, padding: spacing.lg },
  list: { gap: spacing.sm, marginTop: spacing.xl },
  memberCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  memberCardStacked: { alignItems: 'stretch', flexDirection: 'column' },
  memberIdentity: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.md, minWidth: 0 },
  memberCopy: { flex: 1, flexShrink: 1, minWidth: 0 },
  joined: { marginTop: spacing.xs },
  memberControls: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: spacing.sm },
  memberControlsStacked: { flexWrap: 'wrap', justifyContent: 'space-between', paddingLeft: 56 + spacing.md },
  roleBadge: { alignSelf: 'flex-start', borderRadius: radius.pill, flexShrink: 0, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  loading: { alignItems: 'center', paddingVertical: spacing.xxl },
  loadingText: { marginTop: spacing.md },
  stateCard: { marginTop: spacing.lg },
  retry: { alignSelf: 'flex-start', marginTop: spacing.md },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between', marginTop: spacing.xxl },
  sectionSubtitle: { marginTop: spacing.xs },
  editor: { marginTop: spacing.lg, padding: spacing.xl },
  formActions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.lg },
  formError: { marginTop: spacing.md },
  empty: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, padding: spacing.xl },
  emptyTitle: { marginBottom: spacing.xs, marginTop: spacing.sm },
  householdGrid: { gap: spacing.sm, marginTop: spacing.md },
  householdCardWrap: { width: '100%' },
  householdCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  householdMark: { alignItems: 'center', borderRadius: radius.md, height: 44, justifyContent: 'center', width: 44 },
  householdCopy: { flex: 1, minWidth: 0 },
  householdDescription: { marginTop: spacing.xs },
  householdCount: { marginTop: spacing.xs }
});
