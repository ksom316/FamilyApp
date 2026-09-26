import { useAppTheme } from '../../lib/app-theme';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { radius, spacing } from '@familyapp/config';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { useCurrentFamily } from '../../lib/family-context';
import { createFamilyInvitation, FamilyApiError, type FamilyInvitation } from '../../lib/families';

type InviteRole = FamilyInvitation['role'];

export default function InviteMemberScreen() {
  const family = useCurrentFamily();
  const { colors: theme } = useAppTheme();
  const [role, setRole] = useState<InviteRole>('member');
  const [invitation, setInvitation] = useState<FamilyInvitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  async function createInvite() {
    setError(null);
    setIsCreating(true);
    try {
      setInvitation(await createFamilyInvitation(family.familyId, role));
      setCopied(false);
    } catch (error) {
      setError(error instanceof FamilyApiError ? error.message : 'We could not create an invitation right now.');
    } finally {
      setIsCreating(false);
    }
  }

  async function copyCode() {
    if (!invitation) return;
    await Clipboard.setStringAsync(invitation.token);
    setCopied(true);
  }

  return (
    <Screen scroll maxWidth={760} contentStyle={styles.content}>
      <AppText variant="eyebrow" tone="primary">Grow your circle</AppText>
      <AppText variant="display" style={styles.title}>Invite a family member</AppText>
      <AppText variant="body" tone="mutedText" style={styles.subtitle}>Share a private invitation code with someone you trust. It can be used once and expires in seven days.</AppText>

      {!invitation ? <Card elevated style={styles.formCard}>
        <AppText variant="heading">Choose their role</AppText>
        <AppText variant="caption" tone="mutedText" style={styles.roleHint}>You can invite a guardian or a member.</AppText>
        <View style={styles.roles}>
          <RoleOption label="Family member" description="A place in your family" selected={role === 'member'} onPress={() => setRole('member')} />
          <RoleOption label="Guardian" description="Can help invite others" selected={role === 'guardian'} onPress={() => setRole('guardian')} />
        </View>
        {error ? <AppText variant="caption" tone="danger" style={styles.error}>{error}</AppText> : null}
        <Button fullWidth label="Create invitation code" loading={isCreating} onPress={createInvite} style={styles.createButton} />
      </Card> : <Card elevated style={styles.inviteCard}>
        <View style={[styles.readyMark, { backgroundColor: theme.successSoft }]}><AppText variant="heading" tone="success">✓</AppText></View>
        <AppText variant="eyebrow" tone="success" style={styles.readyEyebrow}>INVITATION READY</AppText>
        <AppText variant="heading" style={styles.readyTitle}>Share this code</AppText>
        <AppText variant="caption" tone="mutedText" style={styles.codeLabel}>Invitation code · {invitation.role}</AppText>
        <View style={[styles.codeBox, { backgroundColor: theme.input, borderColor: theme.border }]}><AppText selectable variant="label" style={styles.code}>{invitation.token}</AppText></View>
        <Button fullWidth label={copied ? 'Copied' : 'Copy invitation code'} onPress={() => void copyCode()} style={styles.copyButton} />
        <AppText variant="caption" tone="mutedText" style={styles.expiry}>Expires {new Date(invitation.expiresAt).toLocaleString()}</AppText>
        <Pressable accessibilityRole="button" onPress={() => setInvitation(null)} style={styles.newCode}><AppText variant="caption" tone="secondary">Create another invitation</AppText></Pressable>
      </Card>}
    </Screen>
  );
}

function RoleOption({ label, description, selected, onPress }: { label: string; description: string; selected: boolean; onPress: () => void }) {
  const { colors: theme } = useAppTheme();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.roleOption, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.surface }]}>
      <View style={[styles.radio, { borderColor: selected ? theme.primary : theme.border }]}>{selected ? <View style={[styles.radioInner, { backgroundColor: theme.primary }]} /> : null}</View>
      <View style={styles.roleCopy}><AppText variant="label">{label}</AppText><AppText variant="caption" tone="mutedText" style={styles.roleDescription}>{description}</AppText></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xl },
  title: { marginTop: spacing.sm },
  subtitle: { marginTop: spacing.md, maxWidth: 600 },
  formCard: { marginTop: spacing.xl, padding: spacing.xl },
  roleHint: { marginTop: spacing.xs },
  roles: { gap: spacing.sm, marginTop: spacing.lg },
  roleOption: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 74, padding: spacing.md },
  radio: { alignItems: 'center', borderRadius: 10, borderWidth: 2, height: 20, justifyContent: 'center', width: 20 },
  radioInner: { borderRadius: 5, height: 10, width: 10 },
  roleCopy: { flex: 1 },
  roleDescription: { marginTop: 2 },
  error: { marginTop: spacing.md },
  createButton: { marginTop: spacing.xl },
  inviteCard: { alignItems: 'center', marginTop: spacing.xl, padding: spacing.xl },
  readyMark: { alignItems: 'center', borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  readyEyebrow: { marginTop: spacing.md },
  readyTitle: { marginTop: spacing.xs },
  codeLabel: { marginTop: spacing.xl },
  codeBox: { alignSelf: 'stretch', borderRadius: radius.md, borderWidth: 1, marginTop: spacing.sm, padding: spacing.md },
  code: { fontFamily: 'monospace', textAlign: 'center' },
  copyButton: { marginTop: spacing.md },
  expiry: { marginTop: spacing.md, textAlign: 'center' },
  newCode: { justifyContent: 'center', marginTop: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md }
});
