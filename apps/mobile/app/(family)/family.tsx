import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, useColorScheme, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { useCurrentFamily } from '../../lib/family-context';
import { FamilyApiError, getFamilyMembers, type FamilyMember } from '../../lib/families';

export default function FamilyScreen() {
  const family = useCurrentFamily();
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const [members, setMembers] = useState<FamilyMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setError(null);
    setMembers(null);
    try {
      setMembers(await getFamilyMembers(family.familyId));
    } catch (error) {
      setError(error instanceof FamilyApiError ? error.message : 'We could not load family members.');
    }
  }, [family.familyId]);

  useEffect(() => { void loadMembers(); }, [loadMembers]);

  return (
    <Screen scroll maxWidth={920} contentStyle={styles.content}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}><AppText variant="eyebrow" tone="primary">Your people</AppText><AppText variant="display" style={styles.title}>{family.familyName}</AppText><AppText variant="body" tone="mutedText" style={styles.subtitle}>{members ? `${members.length} ${members.length === 1 ? 'member' : 'members'} in your family` : 'Your family, together in one place.'}</AppText></View>
        {(family.role === 'owner' || family.role === 'guardian') ? <Button label="Invite member" onPress={() => router.push('/(family)/invite' as never)} /> : null}
      </View>

      <View style={[styles.familyNote, { backgroundColor: theme.accentSoft }]}>
        <AppText variant="body" tone="text">A little space for the people who make this family yours.</AppText>
      </View>

      {error ? <Card style={styles.stateCard}><AppText variant="body" tone="danger">{error}</AppText><Button label="Try again" onPress={() => void loadMembers()} style={styles.retry} variant="secondary" /></Card> : null}
      {!members && !error ? <View style={styles.loading}><ActivityIndicator color={theme.primary} /><AppText variant="caption" tone="mutedText" style={styles.loadingText}>Gathering your people…</AppText></View> : null}
      {members ? <View style={styles.list}>{members.map((member) => <MemberCard key={member.id} member={member} />)}</View> : null}
    </Screen>
  );
}

function MemberCard({ member }: { member: FamilyMember }) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const roleLabel = member.role === 'owner' ? 'Family creator' : member.role === 'guardian' ? 'Guardian' : 'Family member';
  const roleColor = member.role === 'owner' ? theme.primarySoft : member.role === 'guardian' ? theme.secondarySoft : theme.successSoft;
  const roleTone = member.role === 'owner' ? 'primary' : member.role === 'guardian' ? 'secondary' : 'success';
  const joined = new Date(member.joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

  return (
    <Card style={styles.memberCard}>
      <Avatar name={member.displayName} imageUrl={member.avatar} size={56} />
      <View style={styles.memberCopy}><AppText variant="label">{member.displayName}</AppText><AppText variant="caption" tone="mutedText" style={styles.joined}>With your family since {joined}</AppText></View>
      <View style={[styles.roleBadge, { backgroundColor: roleColor }]}><AppText variant="caption" tone={roleTone}>{roleLabel}</AppText></View>
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
  memberCopy: { flex: 1, minWidth: 0 },
  joined: { marginTop: spacing.xs },
  roleBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  loading: { alignItems: 'center', paddingVertical: spacing.xxl },
  loadingText: { marginTop: spacing.md },
  stateCard: { marginTop: spacing.lg },
  retry: { alignSelf: 'flex-start', marginTop: spacing.md }
});
