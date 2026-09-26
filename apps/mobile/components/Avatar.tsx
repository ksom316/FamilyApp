import { useAppTheme } from '../lib/app-theme';
import { Image, StyleSheet, Text, View } from 'react-native';
import { radius, typography } from '@familyapp/config';

export function Avatar({ name, imageUrl, size = 48 }: { name?: string | null; imageUrl?: string | null; size?: number }) {
  const { colors: theme } = useAppTheme();
  const initials = (name ?? 'F').trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return <View accessibilityLabel={`${name ?? 'FamilyApp'} avatar`} style={[styles.base, { backgroundColor: theme.primarySoft, borderRadius: size / 2, height: size, width: size }]}>{imageUrl ? <Image source={{ uri: imageUrl }} style={{ borderRadius: size / 2, height: size, width: size }} /> : <Text style={[styles.text, { color: theme.primary, fontSize: size * 0.34 }]}>{initials}</Text>}</View>;
}

const styles = StyleSheet.create({ base: { alignItems: 'center', justifyContent: 'center' }, text: { fontWeight: typography.weight.bold } });
