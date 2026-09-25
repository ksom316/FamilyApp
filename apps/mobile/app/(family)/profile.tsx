import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { FamilyAppAvatar } from '../../components/FamilyAppAvatar';
import { MemberAvatar } from '../../components/MemberAvatar';
import { Screen } from '../../components/Screen';
import { useCurrentFamily } from '../../lib/family-context';
import { requestAttentionRefresh } from '../../lib/navigation-attention';
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
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];

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
    </Screen>
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
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.chip, { backgroundColor: selected ? theme.primarySoft : theme.input, borderColor: selected ? theme.primary : theme.border }]}>
      <AppText variant="caption" tone={selected ? 'primary' : 'text'}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xl },
  title: { marginTop: spacing.xs },
  subtitle: { marginTop: spacing.sm, maxWidth: 560 },
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
