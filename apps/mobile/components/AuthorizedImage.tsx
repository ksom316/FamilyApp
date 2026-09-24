import { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, useColorScheme, View, type ImageStyle, type StyleProp } from 'react-native';
import { colors } from '@familyapp/config';

import { apiFetch } from '../lib/api';
import { apiUrl } from '../lib/api-url';
import { authClient } from '../lib/auth-client';

type ImageSource = { uri: string; headers?: Record<string, string> };

export function AuthorizedImage({ path, style, resizeMode = 'cover' }: { path: string; style?: StyleProp<ImageStyle>; resizeMode?: 'cover' | 'contain' }) {
  const scheme = useColorScheme();
  const theme = colors[scheme === 'dark' ? 'dark' : 'light'];
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
          if (!response.ok) throw new Error('media_unavailable');
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

  if (failed || !source) {
    return <View style={[styles.fallback, { backgroundColor: theme.backgroundTint }, style]} />;
  }

  return <Image source={source} style={style} resizeMode={resizeMode} onError={() => setFailed(true)} />;
}

const styles = StyleSheet.create({ fallback: {} });
