import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import { colors, radius, typography, type Theme } from '@familyapp/config';

export function Avatar({ name, size = 48 }: { name?: string | null; size?: number }) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const initials = (name ?? 'F').trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return <View accessibilityLabel={`${name ?? 'FamilyApp'} avatar`} style={[styles.base, { backgroundColor: theme.primarySoft, borderRadius: size / 2, height: size, width: size }]}><Text style={[styles.text, { color: theme.primary, fontSize: size * 0.34 }]}>{initials}</Text></View>;
}

const styles = StyleSheet.create({ base: { alignItems: 'center', justifyContent: 'center' }, text: { fontWeight: typography.weight.bold } });
