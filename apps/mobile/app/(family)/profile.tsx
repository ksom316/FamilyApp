import { useAppTheme } from '../../lib/app-theme';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { createTheme, radius, spacing, themeNames, themePersonalities, type AppearanceMode, type Theme, type ThemeName } from '@familyapp/config';

import { AccountApiError, deleteMyAccount } from '../../lib/account';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { FamilyAppAvatar } from '../../components/FamilyAppAvatar';
import { MemberAvatar } from '../../components/MemberAvatar';
import { FadeInView, PressableScale } from '../../components/Motion';
import { Screen } from '../../components/Screen';
import { useCurrentFamily } from '../../lib/family-context';
import { FamilyApiError, getFamilyMembers, leaveFamily, transferFamilyOwnership, type FamilyMember } from '../../lib/families';
import { requestAttentionRefresh } from '../../lib/navigation-attention';
import { signOutWithPushCleanup } from '../../lib/push-notifications';
import {
  AVATAR_OPTIONS,
  DEFAULT_AVATAR_CONFIG,
  getMyIdentity,
  ProfileApiError,
  removeMyPhoto,
  setMyIdentity,
  uploadMyPhoto,
  type AvatarConfig,
  type IdentityType,
  type ProfileIdentity
} from '../../lib/profile';
import { useAuth } from '../../lib/use-auth';

const CATEGORY_LABELS: Record<keyof AvatarConfig, string> = {
  skinTone: 'Skin tone',
  hairstyle: 'Hairstyle',
  hairColor: 'Hair color',
  expression: 'Expression',
  accessory: 'Accessory',
  top: 'Top',
  background: 'Background'
};

const OPTION_LABELS: Record<string, string> = {
  light: 'Light', medium: 'Medium', tan: 'Tan', deep: 'Deep',
  bald: 'Bald', short: 'Short', curly: 'Curly', long: 'Long', bun: 'Bun',
  black: 'Black', brown: 'Brown', blonde: 'Blonde', red: 'Red', gray: 'Gray',
  smile: 'Smile', neutral: 'Neutral', grin: 'Grin', wink: 'Wink',
  none: 'None', glasses: 'Glasses', sunglasses: 'Sunglasses',
  tshirt: 'T-shirt', hoodie: 'Hoodie', dress: 'Dress', buttonup: 'Button-up',
  peach: 'Peach', sky: 'Sky', mint: 'Mint', lilac: 'Lilac', sun: 'Sun'
};

export default function ProfileScreen() {
  const family = useCurrentFamily();
  const { data: session } = useAuth();
  const { appearance, colors: theme, resolvedAppearance, setAppearance, setTheme, theme: themeName } = useAppTheme();

  const [identity, setIdentity] = useState<ProfileIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [draftConfig, setDraftConfig] = useState<AvatarConfig>(DEFAULT_AVATAR_CONFIG);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      setIdentity(await getMyIdentity());
      setError(null);
    } catch (caught) {
      setError(caught instanceof ProfileApiError ? caught.message : 'We could not load your profile.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const displayName = session?.user.name ?? 'You';
  const previewMember = identity ? {
    displayName,
    avatar: identity.avatar,
    identityType: identity.identityType,
    avatarConfig: identity.avatarConfig,
    hasPhoto: identity.hasPhoto,
    memberId: family.id
  } : null;

  function beginAvatarEdit() {
    setDraftConfig(identity?.avatarConfig ?? DEFAULT_AVATAR_CONFIG);
    setEditingAvatar(true);
  }

  async function saveAvatar() {
    setSaving(true);
    setError(null);
    try {
      setIdentity(await setMyIdentity('avatar', draftConfig));
      setEditingAvatar(false);
      requestAttentionRefresh();
    } catch (caught) {
      setError(caught instanceof ProfileApiError ? caught.message : 'Your avatar could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function chooseIdentity(identityType: IdentityType) {
    if (identityType === 'avatar') { beginAvatarEdit(); return; }
    setSaving(true);
    setError(null);
    try {
      setIdentity(await setMyIdentity(identityType));
      requestAttentionRefresh();
    } catch (caught) {
      setError(caught instanceof ProfileApiError ? caught.message : 'That could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function pickAndUploadPhoto() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError('Allow photo access to set a profile photo.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      setIdentity(await uploadMyPhoto({ uri: asset.uri, name: asset.fileName ?? `profile-${Date.now()}.jpg`, type: asset.mimeType ?? 'image/jpeg' }));
      requestAttentionRefresh();
    } catch (caught) {
      setError(caught instanceof ProfileApiError ? caught.message : 'Your photo could not be uploaded.');
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    setSaving(true);
    setError(null);
    try {
      setIdentity(await removeMyPhoto());
      requestAttentionRefresh();
    } catch (caught) {
      setError(caught instanceof ProfileApiError ? caught.message : 'Your photo could not be removed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll maxWidth={720} contentStyle={styles.content}>
      <AppText variant="eyebrow" tone="primary">Your profile</AppText>
      <AppText variant="display" style={styles.title}>Profile picture & avatar</AppText>
      <AppText variant="body" tone="mutedText" style={styles.subtitle}>
        Choose how you appear across FamilyApp — a photo, a FamilyApp Avatar, or your initials.
      </AppText>

      <FadeInView distance={6}>
      <Card elevated style={styles.appearanceCard}>
        <AppText variant="eyebrow" tone="primary">Appearance</AppText>
        <AppText variant="heading" style={styles.sectionTitle}>Make FamilyApp yours</AppText>
        <AppText variant="body" tone="mutedText" style={styles.sectionIntro}>Choose how bright the app feels, then add a color personality. Changes apply everywhere right away.</AppText>
        <View accessibilityRole="radiogroup" style={styles.appearanceChoices}>
          {(['system', 'light', 'dark'] as const).map((mode) => <AppearanceChoice key={mode} mode={mode} selected={appearance === mode} onPress={() => setAppearance(mode)} />)}
        </View>
        <View style={[styles.sectionDivider, { backgroundColor: theme.divider }]} />
        <AppText variant="eyebrow" tone="secondary">Theme</AppText>
        <View accessibilityRole="radiogroup" style={styles.themeGrid}>
          {themeNames.map((name) => <ThemeChoice key={name} name={name} appearance={resolvedAppearance} selected={themeName === name} onPress={() => setTheme(name)} />)}
        </View>
      </Card>
      </FadeInView>

      {error ? (
        <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="caption" tone="danger">{error}</AppText>
        </Card>
      ) : null}

      {!identity ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : editingAvatar ? (
        <AvatarEditor
          config={draftConfig}
          onChange={setDraftConfig}
          saving={saving}
          onCancel={() => setEditingAvatar(false)}
          onSave={() => void saveAvatar()}
        />
      ) : (
        <>
          <Card style={styles.previewCard}>
            <MemberAvatar member={previewMember} familyId={family.familyId} size={96} />
            <AppText variant="label" style={styles.previewName}>{displayName}</AppText>
            <AppText variant="caption" tone="mutedText">
              {identity.identityType === 'photo' ? 'Using your profile photo' : identity.identityType === 'avatar' ? 'Using your FamilyApp Avatar' : 'Using initials / default'}
            </AppText>
          </Card>

          <View style={styles.optionsGrid}>
            <OptionCard
              title="Profile photo"
              detail="Upload a photo of yourself"
              active={identity.identityType === 'photo'}
              busy={uploading}
              onPress={() => void pickAndUploadPhoto()}
              theme={theme}
            />
            <OptionCard
              title="FamilyApp Avatar"
              detail="Create a friendly illustrated avatar"
              active={identity.identityType === 'avatar'}
              busy={false}
              onPress={beginAvatarEdit}
              theme={theme}
            />
            <OptionCard
              title="Initials / default"
              detail="Just your initials"
              active={identity.identityType === 'initials'}
              busy={saving && identity.identityType !== 'initials'}
              onPress={() => void chooseIdentity('initials')}
              theme={theme}
            />
          </View>

          {identity.hasPhoto ? (
            <Button label="Remove profile photo" variant="quiet" loading={saving} onPress={() => void removePhoto()} style={styles.removeButton} />
          ) : null}
        </>
      )}

      <AccountSection family={family} theme={theme} />
    </Screen>
  );
}

function confirm(message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    const windowConfirm = (globalThis as typeof globalThis & { confirm?: (text: string) => boolean }).confirm;
    if (windowConfirm?.(message)) onConfirm();
    return;
  }
  Alert.alert('Are you sure?', message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm }
  ]);
}

// Kept deliberately separate from the avatar/appearance sections above: this is the one
// part of Profile with irreversible, account-lifecycle actions, so it gets its own quiet,
// clearly-labeled card at the bottom rather than blending into the rest of the screen.
function AccountSection({ family, theme }: { family: ReturnType<typeof useCurrentFamily>; theme: Theme }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ownerBlocked, setOwnerBlocked] = useState(false);
  const [members, setMembers] = useState<FamilyMember[] | null>(null);
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null);

  async function doLeave() {
    setBusy(true);
    setError(null);
    try {
      await leaveFamily(family.familyId);
      router.replace('/');
    } catch (caught) {
      if (caught instanceof FamilyApiError && caught.code === 'owner_must_transfer') {
        setOwnerBlocked(true);
        setError(caught.message);
        try { setMembers((await getFamilyMembers(family.familyId)).filter((member) => member.id !== family.id)); } catch { setMembers([]); }
      } else {
        setError(caught instanceof FamilyApiError ? caught.message : 'You could not leave this family right now.');
      }
    } finally {
      setBusy(false);
    }
  }

  function onLeavePress() {
    confirm(
      `Leave ${family.familyName}? You'll lose access to its content unless someone invites you back.`,
      'Leave family',
      () => void doLeave()
    );
  }

  async function doTransfer() {
    if (!transferTargetId) return;
    setBusy(true);
    setError(null);
    try {
      await transferFamilyOwnership(family.familyId, transferTargetId);
      setOwnerBlocked(false);
      setMembers(null);
      setTransferTargetId(null);
      // Ownership has moved — leaving is now safe, so finish the action the member asked for.
      await doLeave();
    } catch (caught) {
      setError(caught instanceof FamilyApiError ? caught.message : 'Ownership could not be transferred right now.');
    } finally {
      setBusy(false);
    }
  }

  async function doDeleteAccount() {
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount();
      await signOutWithPushCleanup();
      router.replace('/');
    } catch (caught) {
      setError(caught instanceof AccountApiError ? caught.message : 'Your account could not be deleted right now.');
      setBusy(false);
    }
  }

  function onDeletePress() {
    confirm(
      'Delete your FamilyApp account? This signs you out everywhere and cannot be undone. Family content you created stays with your family, no longer linked to your name.',
      'Delete account',
      () => confirm(
        'This is permanent. Are you completely sure you want to delete your account?',
        'Yes, delete it',
        () => void doDeleteAccount()
      )
    );
  }

  return (
    <Card style={[styles.accountCard, { borderColor: theme.dangerSoft }]}>
      <AppText variant="eyebrow" tone="danger">Account</AppText>
      <AppText variant="body" tone="mutedText" style={styles.accountIntro}>Leaving or deleting your account cannot be undone.</AppText>

      {error ? <AppText variant="caption" tone="danger" style={styles.accountError}>{error}</AppText> : null}

      {ownerBlocked ? (
        <View style={styles.transferBlock}>
          <AppText variant="label">Choose a new owner for {family.familyName} first</AppText>
          <AppText variant="caption" tone="mutedText" style={styles.transferDetail}>
            You're the owner and other members are still here — pick who takes over, then you can leave.
          </AppText>
          {members === null ? (
            <ActivityIndicator color={theme.primary} style={styles.transferLoading} />
          ) : members.length === 0 ? (
            <AppText variant="caption" tone="mutedText" style={styles.transferDetail}>No other members were found.</AppText>
          ) : (
            <View style={styles.transferChoices}>
              {members.map((member) => (
                <Pressable
                  key={member.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: transferTargetId === member.id }}
                  onPress={() => setTransferTargetId(member.id)}
                  style={[styles.transferChoice, { backgroundColor: transferTargetId === member.id ? theme.primarySoft : theme.input, borderColor: transferTargetId === member.id ? theme.primary : theme.border }]}
                >
                  <MemberAvatar member={member} familyId={family.familyId} size={28} />
                  <AppText variant="label" tone={transferTargetId === member.id ? 'primary' : 'text'}>{member.displayName}</AppText>
                </Pressable>
              ))}
            </View>
          )}
          <View style={styles.transferActions}>
            <Button label="Cancel" variant="quiet" disabled={busy} onPress={() => { setOwnerBlocked(false); setMembers(null); setTransferTargetId(null); setError(null); }} />
            <Button label="Transfer & leave" loading={busy} disabled={!transferTargetId} onPress={() => void doTransfer()} />
          </View>
        </View>
      ) : (
        <Button label={`Leave ${family.familyName}`} variant="quiet" loading={busy} onPress={onLeavePress} style={styles.accountButton} />
      )}

      <View style={[styles.accountDivider, { backgroundColor: theme.divider }]} />
      <Button label="Delete account" variant="quiet" loading={busy} onPress={onDeletePress} style={styles.accountButton} />
    </Card>
  );
}

function AppearanceChoice({ mode, selected, onPress }: { mode: AppearanceMode; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  const labels: Record<AppearanceMode, { name: string; mark: string }> = {
    system: { name: 'System', mark: '◐' }, light: { name: 'Light', mark: '☀' }, dark: { name: 'Dark', mark: '☾' }
  };
  return (
    <PressableScale accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.appearanceChoice, { backgroundColor: selected ? colors.primarySoft : colors.surfaceSecondary, borderColor: selected ? colors.primary : colors.border }]}>
      <AppText variant="heading" tone={selected ? 'primary' : 'mutedText'}>{labels[mode].mark}</AppText>
      <AppText variant="label" tone={selected ? 'primary' : 'text'}>{labels[mode].name}</AppText>
      {selected ? <AppText variant="caption" tone="primary">Selected</AppText> : null}
    </PressableScale>
  );
}

function ThemeChoice({ name, appearance, selected, onPress }: { name: ThemeName; appearance: 'light' | 'dark'; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  const preview = createTheme(name, appearance);
  return (
    <PressableScale accessibilityRole="radio" accessibilityLabel={`${themePersonalities[name].label} theme`} accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.themeChoice, { backgroundColor: colors.surface, borderColor: selected ? colors.primary : colors.border }]}>
      <View style={styles.themeChoiceHeader}>
        <AppText variant="label" tone={selected ? 'primary' : 'text'}>{themePersonalities[name].label}</AppText>
        {selected ? <View style={[styles.selectedMark, { backgroundColor: colors.primary }]}><AppText variant="caption" style={{ color: colors.onPrimary }}>✓</AppText></View> : null}
      </View>
      <View style={[styles.themePreview, { backgroundColor: preview.background, borderColor: preview.border }]}>
        <View style={[styles.previewNav, { backgroundColor: preview.navigationBackground, borderColor: preview.border }]}>
          <View style={[styles.previewNavDot, { backgroundColor: preview.primary }]} />
          <View style={[styles.previewNavLine, { backgroundColor: preview.navigationInactive }]} />
          <View style={[styles.previewNavLineShort, { backgroundColor: preview.secondary }]} />
        </View>
        <View style={styles.previewContent}>
          <View style={[styles.previewMiniCard, { backgroundColor: preview.surface, borderColor: preview.border }]}>
            <View style={[styles.previewTextLine, { backgroundColor: preview.textMuted }]} />
            <View style={[styles.previewAccentLine, { backgroundColor: preview.primary }]} />
          </View>
          <View style={[styles.previewPill, { backgroundColor: preview.accentSoft }]}><View style={[styles.previewPillDot, { backgroundColor: preview.accent }]} /></View>
        </View>
      </View>
    </PressableScale>
  );
}

function OptionCard({ title, detail, active, busy, onPress, theme }: { title: string; detail: string; active: boolean; busy: boolean; onPress: () => void; theme: Theme }) {
  return (
    <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={{ flexGrow: 1, minWidth: 200 }}>
      <Card style={[styles.optionCard, active && { borderColor: theme.primary, backgroundColor: theme.primarySoft }]}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" tone="mutedText" style={styles.optionDetail}>{detail}</AppText>
        {active ? <AppText variant="caption" tone="primary" style={styles.optionActive}>Active</AppText> : null}
        {busy ? <ActivityIndicator color={theme.primary} style={styles.optionActive} /> : null}
      </Card>
    </Pressable>
  );
}

function AvatarEditor({ config, onChange, saving, onCancel, onSave }: {
  config: AvatarConfig;
  onChange: (config: AvatarConfig) => void;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  function setOption<K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) {
    onChange({ ...config, [key]: value });
  }

  return (
    <Card elevated style={styles.editorCard}>
      <View style={styles.editorPreview}>
        <FamilyAppAvatar config={config} size={112} />
      </View>
      {(Object.keys(AVATAR_OPTIONS) as (keyof AvatarConfig)[]).map((category) => (
        <View key={category} style={styles.categoryRow}>
          <AppText variant="label" style={styles.categoryLabel}>{CATEGORY_LABELS[category]}</AppText>
          <View style={styles.optionChips}>
            {AVATAR_OPTIONS[category].map((option) => (
              <OptionChip
                key={option}
                label={OPTION_LABELS[option] ?? option}
                selected={config[category] === option}
                onPress={() => setOption(category, option as AvatarConfig[typeof category])}
              />
            ))}
          </View>
        </View>
      ))}
      <View style={styles.formActions}>
        <Button label="Cancel" variant="quiet" onPress={onCancel} disabled={saving} />
        <Button label="Save avatar" loading={saving} onPress={onSave} />
      </View>
    </Card>
  );
}

function OptionChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors: theme } = useAppTheme();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.chip, { backgroundColor: selected ? theme.primarySoft : theme.input, borderColor: selected ? theme.primary : theme.border }]}>
      <AppText variant="caption" tone={selected ? 'primary' : 'text'}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  accountCard: { borderWidth: 1, marginTop: spacing.xxl, padding: spacing.xl },
  accountIntro: { marginTop: spacing.xs },
  accountError: { marginTop: spacing.md },
  accountButton: { alignSelf: 'flex-start', marginTop: spacing.md },
  accountDivider: { height: 1, marginVertical: spacing.lg },
  transferBlock: { marginTop: spacing.md },
  transferDetail: { marginTop: spacing.xs },
  transferLoading: { marginTop: spacing.md },
  transferChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  transferChoice: { alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  transferActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg },
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xl },
  title: { marginTop: spacing.xs },
  subtitle: { marginTop: spacing.sm, maxWidth: 560 },
  appearanceCard: { marginTop: spacing.xl, padding: spacing.xl },
  sectionTitle: { marginTop: spacing.xs },
  sectionIntro: { marginTop: spacing.sm, maxWidth: 580 },
  appearanceChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  appearanceChoice: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexBasis: 140, flexGrow: 1, gap: spacing.xs, minHeight: 112, padding: spacing.md },
  sectionDivider: { height: 1, marginVertical: spacing.xl },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  themeChoice: { borderRadius: radius.md, borderWidth: 1, flexBasis: 190, flexGrow: 1, gap: spacing.sm, minWidth: 154, padding: spacing.md },
  themeChoiceHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  selectedMark: { alignItems: 'center', borderRadius: radius.pill, height: 22, justifyContent: 'center', width: 22 },
  themePreview: { borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', height: 72, overflow: 'hidden' },
  previewNav: { borderRightWidth: 1, gap: 6, padding: 8, width: 42 },
  previewNavDot: { borderRadius: radius.pill, height: 10, width: 10 },
  previewNavLine: { borderRadius: radius.pill, height: 4, marginTop: 2, opacity: 0.65, width: 24 },
  previewNavLineShort: { borderRadius: radius.pill, height: 4, opacity: 0.8, width: 17 },
  previewContent: { flex: 1, gap: 5, padding: 8 },
  previewMiniCard: { borderRadius: 7, borderWidth: 1, flex: 1, justifyContent: 'center', paddingHorizontal: 7 },
  previewTextLine: { borderRadius: radius.pill, height: 4, opacity: 0.55, width: '62%' },
  previewAccentLine: { borderRadius: radius.pill, height: 5, marginTop: 5, width: '82%' },
  previewPill: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radius.pill, height: 10, justifyContent: 'center', width: 32 },
  previewPillDot: { borderRadius: radius.pill, height: 5, width: 18 },
  messageCard: { marginTop: spacing.lg, padding: spacing.md },
  loading: { alignItems: 'center', paddingVertical: spacing.xxl },
  previewCard: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.xl, padding: spacing.xl },
  previewName: { marginTop: spacing.sm },
  optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xl },
  optionCard: { gap: spacing.xs, padding: spacing.lg },
  optionDetail: { marginTop: spacing.xs },
  optionActive: { marginTop: spacing.sm },
  removeButton: { alignSelf: 'flex-start', marginTop: spacing.lg },
  editorCard: { marginTop: spacing.xl, padding: spacing.xl },
  editorPreview: { alignItems: 'center', marginBottom: spacing.lg },
  categoryRow: { marginTop: spacing.md },
  categoryLabel: { marginBottom: spacing.xs },
  optionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderRadius: radius.pill, borderWidth: 1, minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.md },
  formActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.xl }
});
