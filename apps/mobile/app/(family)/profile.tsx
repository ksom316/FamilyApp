import { useAppTheme } from '../../lib/app-theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { createTheme, radius, shadows, spacing, themeNames, themePersonalities, typography, type AppearanceMode, type Theme, type ThemeName } from '@familyapp/config';

import { AccountApiError, deleteMyAccount } from '../../lib/account';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { BACKGROUND_COLORS, FamilyAppAvatar, HAIR_COLORS, SKIN_COLORS } from '../../components/FamilyAppAvatar';
import { MemberAvatar } from '../../components/MemberAvatar';
import { FadeInView, PressableScale, SuccessPulse } from '../../components/Motion';
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

// Categories whose options are fundamentally a color choice get a plain color swatch;
// everything else (hairstyle, expression, accessory, top) gets a real mini avatar preview
// so the shape/style is actually visible rather than implied by a text label alone.
const COLOR_CATEGORIES = new Set<keyof AvatarConfig>(['skinTone', 'hairColor', 'background']);
const CATEGORY_ORDER = Object.keys(AVATAR_OPTIONS) as (keyof AvatarConfig)[];
const HERO_AVATAR_SIZE = 176;
const OPTION_PREVIEW_SIZE = 56;

function randomAvatarConfig(): AvatarConfig {
  const pick = <K extends keyof AvatarConfig>(key: K): AvatarConfig[K] => {
    const options = AVATAR_OPTIONS[key];
    return options[Math.floor(Math.random() * options.length)];
  };
  return {
    skinTone: pick('skinTone'),
    hairstyle: pick('hairstyle'),
    hairColor: pick('hairColor'),
    expression: pick('expression'),
    accessory: pick('accessory'),
    top: pick('top'),
    background: pick('background')
  };
}

function swatchColorFor(category: keyof AvatarConfig, option: string) {
  if (category === 'skinTone') return SKIN_COLORS[option as AvatarConfig['skinTone']];
  if (category === 'hairColor') return HAIR_COLORS[option as AvatarConfig['hairColor']];
  if (category === 'background') return BACKGROUND_COLORS[option as AvatarConfig['background']];
  return undefined;
}

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
  const [justSavedAvatar, setJustSavedAvatar] = useState(false);
  const savedBannerTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (savedBannerTimeout.current) clearTimeout(savedBannerTimeout.current); }, []);

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
    setJustSavedAvatar(false);
    setDraftConfig(identity?.avatarConfig ?? DEFAULT_AVATAR_CONFIG);
    setEditingAvatar(true);
  }

  async function saveAvatar() {
    setSaving(true);
    setError(null);
    try {
      setIdentity(await setMyIdentity('avatar', draftConfig));
      setEditingAvatar(false);
      setJustSavedAvatar(true);
      if (savedBannerTimeout.current) clearTimeout(savedBannerTimeout.current);
      savedBannerTimeout.current = setTimeout(() => setJustSavedAvatar(false), 2400);
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
        Choose how you appear across Kinzae — a photo, a Kinzae Avatar, or your initials.
      </AppText>

      <FadeInView distance={6}>
      <Card elevated style={styles.appearanceCard}>
        <AppText variant="eyebrow" tone="primary">Appearance</AppText>
        <AppText variant="heading" style={styles.sectionTitle}>Make Kinzae yours</AppText>
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
              {identity.identityType === 'photo' ? 'Using your profile photo' : identity.identityType === 'avatar' ? 'Using your Kinzae Avatar' : 'Using initials / default'}
            </AppText>
            {justSavedAvatar && identity.identityType === 'avatar' ? (
              <SuccessPulse style={styles.savedConfirmation}>
                <AppText variant="caption" tone="success">&#10003; Avatar saved</AppText>
              </SuccessPulse>
            ) : null}
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
              title="Kinzae Avatar"
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
      'Delete your Kinzae account? This signs you out everywhere and cannot be undone. Family content you created stays with your family, no longer linked to your name.',
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
  const { colors: theme } = useAppTheme();
  const [activeCategory, setActiveCategory] = useState<keyof AvatarConfig>(CATEGORY_ORDER[0]);

  function setOption<K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) {
    onChange({ ...config, [key]: value });
  }

  return (
    <Card elevated style={styles.editorCard}>
      <AppText variant="eyebrow" tone="primary">Create your avatar</AppText>
      <AppText variant="heading" style={styles.editorTitle}>Make it unmistakably you</AppText>
      <AppText variant="body" tone="mutedText" style={styles.editorIntro}>Pick a category below and tap an option — your avatar updates instantly.</AppText>

      <View style={styles.avatarStage}>
        <View style={[styles.avatarStageGlow, { backgroundColor: theme.primarySoft, borderColor: theme.border }]} />
        <View style={[styles.avatarShadowWrap, shadows.lg, { shadowColor: theme.shadow, borderRadius: HERO_AVATAR_SIZE / 2 }]}>
          <FamilyAppAvatar config={config} size={HERO_AVATAR_SIZE} />
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Surprise me with a random avatar"
        onPress={() => onChange(randomAvatarConfig())}
        disabled={saving}
        style={[styles.surpriseButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <AppText variant="label" tone="secondary">&#8635; Surprise me</AppText>
      </Pressable>

      <View style={[styles.sectionDivider, { backgroundColor: theme.divider }]} />

      <AppText variant="eyebrow" tone="secondary" style={styles.categoryHeading}>Customize</AppText>
      <View style={styles.categoryTabs}>
        {CATEGORY_ORDER.map((category) => {
          const active = activeCategory === category;
          return (
            <Pressable
              key={category}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setActiveCategory(category)}
              style={[styles.categoryTab, active ? { backgroundColor: theme.primary } : { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, borderWidth: 1 }]}
            >
              <AppText variant="label" style={{ color: active ? theme.onPrimary : theme.textSecondary, fontWeight: active ? typography.weight.bold : typography.weight.medium }}>
                {CATEGORY_LABELS[category]}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <FadeInView key={activeCategory} distance={4} style={styles.avatarOptionsGrid}>
        {AVATAR_OPTIONS[activeCategory].map((option) => (
          <AvatarOptionTile
            key={option}
            category={activeCategory}
            option={option}
            config={config}
            selected={config[activeCategory] === option}
            onPress={() => setOption(activeCategory, option as AvatarConfig[typeof activeCategory])}
          />
        ))}
      </FadeInView>

      <View style={[styles.sectionDivider, { backgroundColor: theme.divider }]} />
      <View style={styles.formActions}>
        <Button label="Cancel" variant="quiet" onPress={onCancel} disabled={saving} />
        <Button label="Save avatar" loading={saving} onPress={onSave} />
      </View>
    </Card>
  );
}

function AvatarOptionTile({ category, option, config, selected, onPress }: {
  category: keyof AvatarConfig;
  option: string;
  config: AvatarConfig;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors: theme } = useAppTheme();
  const label = OPTION_LABELS[option] ?? option;
  const swatchColor = swatchColorFor(category, option);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${CATEGORY_LABELS[category]}: ${label}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.avatarOptionTile}
    >
      <View style={[styles.avatarOptionSwatch, { borderColor: selected ? theme.primary : theme.border, borderWidth: selected ? 3 : 1 }]}>
        {swatchColor ? (
          <View style={[styles.colorSwatchFill, { backgroundColor: swatchColor }]} />
        ) : (
          <FamilyAppAvatar config={{ ...config, [category]: option } as AvatarConfig} size={OPTION_PREVIEW_SIZE} />
        )}
        {selected ? (
          <View style={[styles.optionSelectedMark, { backgroundColor: theme.primary, borderColor: theme.surface }]}>
            <AppText variant="caption" style={{ color: theme.onPrimary }}>&#10003;</AppText>
          </View>
        ) : null}
      </View>
      <AppText variant="caption" tone={selected ? 'primary' : 'mutedText'} numberOfLines={1} style={styles.avatarOptionLabel}>{label}</AppText>
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
  editorTitle: { marginTop: spacing.xs },
  editorIntro: { marginTop: spacing.sm, maxWidth: 480 },
  avatarStage: {
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    width: HERO_AVATAR_SIZE + 64,
    height: HERO_AVATAR_SIZE + 64
  },
  avatarStageGlow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: (HERO_AVATAR_SIZE + 64) / 2, borderWidth: 1 },
  avatarShadowWrap: { alignSelf: 'center' },
  surpriseButton: { alignSelf: 'center', borderRadius: radius.pill, borderWidth: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg },
  categoryHeading: { marginTop: spacing.md },
  categoryTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.sm },
  categoryTab: { borderRadius: radius.pill, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md, flexBasis: '31%', flexGrow: 1, minWidth: 96 },
  avatarOptionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  avatarOptionTile: { alignItems: 'center', gap: spacing.xs, flexBasis: '28%', flexGrow: 1, minWidth: 84 },
  avatarOptionSwatch: {
    alignItems: 'center',
    justifyContent: 'center',
    width: OPTION_PREVIEW_SIZE + 8,
    height: OPTION_PREVIEW_SIZE + 8,
    borderRadius: (OPTION_PREVIEW_SIZE + 8) / 2
  },
  colorSwatchFill: { width: OPTION_PREVIEW_SIZE, height: OPTION_PREVIEW_SIZE, borderRadius: OPTION_PREVIEW_SIZE / 2 },
  optionSelectedMark: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2
  },
  avatarOptionLabel: { textAlign: 'center' },
  savedConfirmation: { marginTop: spacing.xs },
  formActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.xl }
});
