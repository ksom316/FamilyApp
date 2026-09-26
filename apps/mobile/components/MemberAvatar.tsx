import { useAppTheme } from '../lib/app-theme';
import { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { typography } from '@familyapp/config';

import { FamilyAppAvatar } from './FamilyAppAvatar';
import { apiFetch } from '../lib/api';
import { apiUrl } from '../lib/api-url';
import { authClient } from '../lib/auth-client';
import { memberPhotoUrl, type AvatarConfig } from '../lib/profile';

export type MemberIdentity = {
  displayName?: string | null;
  avatar?: string | null;
  identityType?: string | null;
  avatarConfig?: AvatarConfig | null;
  hasPhoto?: boolean | null;
  memberId?: string | null;
};

export type MemberAvatarSize = 'small' | 'medium' | 'large' | number;

const SIZE_PRESETS: Record<'small' | 'medium' | 'large', number> = { small: 32, medium: 48, large: 64 };

function resolveSize(size: MemberAvatarSize | undefined) {
  if (typeof size === 'number') return size;
  return SIZE_PRESETS[size ?? 'medium'];
}

function initialsFor(name?: string | null) {
  return (name ?? 'F').trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

/**
 * The one place FamilyApp decides how a member's identity renders: FamilyApp Avatar → an
 * uploaded photo → the legacy provider avatar_url → initials. Every screen that shows a
 * member (Chat, Family, Private conversations, …) should render through this component
 * instead of re-implementing that decision.
 */
export function MemberAvatar({ member, familyId, size = 'medium' }: { member: MemberIdentity | null | undefined; familyId?: string; size?: MemberAvatarSize }) {
  const resolvedSize = resolveSize(size);

  if (member?.identityType === 'avatar' && member.avatarConfig) {
    return <FamilyAppAvatar config={member.avatarConfig} size={resolvedSize} />;
  }

  if (member?.identityType === 'photo' && member.hasPhoto && member.memberId && familyId) {
    return (
      <PhotoAvatar
        path={memberPhotoUrl(familyId, member.memberId)}
        size={resolvedSize}
        displayName={member.displayName}
      />
    );
  }

  return <InitialsCircle name={member?.displayName} imageUrl={member?.avatar} size={resolvedSize} />;
}

function InitialsCircle({ name, imageUrl, size }: { name?: string | null; imageUrl?: string | null; size: number }) {
  const { colors: theme } = useAppTheme();
  const initials = initialsFor(name);
  return (
    <View accessibilityLabel={`${name ?? 'FamilyApp'} avatar`} style={[styles.base, { backgroundColor: theme.primarySoft, borderRadius: size / 2, height: size, width: size }]}>
      {imageUrl ? <Image source={{ uri: imageUrl }} style={{ borderRadius: size / 2, height: size, width: size }} /> : <Text style={[styles.text, { color: theme.primary, fontSize: size * 0.34 }]}>{initials}</Text>}
    </View>
  );
}

type ImageSource = { uri: string; headers?: Record<string, string> };

// A minimal, self-contained authenticated-image loader (rather than reusing
// AuthorizedImage's own blank-box failure state) so a photo that fails to load falls back
// to the member's initials — never a blank tile — matching "initials must always remain
// the final fallback."
function PhotoAvatar({ path, size, displayName }: { path: string; size: number; displayName?: string | null }) {
  const [source, setSource] = useState<ImageSource | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setSource(null);
    setFailed(false);

    void (async () => {
      try {
        if (Platform.OS === 'web') {
          const response = await apiFetch(path);
          if (!response.ok) throw new Error('photo_unavailable');
          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);
          if (active) setSource({ uri: objectUrl });
        } else {
          const cookie = await authClient.getCookie();
          if (active) setSource({ uri: `${apiUrl}${path}`, headers: cookie ? { Cookie: cookie } : undefined });
        }
      } catch {
        if (active) setFailed(true);
      }
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (failed || !source) return <InitialsCircle name={displayName} size={size} />;

  return (
    <Image
      source={source}
      style={{ borderRadius: size / 2, height: size, width: size }}
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({ base: { alignItems: 'center', justifyContent: 'center' }, text: { fontWeight: typography.weight.bold } });
