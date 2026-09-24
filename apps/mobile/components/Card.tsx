import { StyleSheet, useColorScheme, View, type ViewProps } from 'react-native';
import { colors, radius, shadows, spacing, type Theme } from '@familyapp/config';

export type CardProps = ViewProps & { padded?: boolean; elevated?: boolean };

export function Card({ padded = true, elevated = false, style, ...props }: CardProps) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  return <View {...props} style={[styles.base, { backgroundColor: theme.surface, borderColor: theme.border }, padded && styles.padded, elevated && shadows.md, style]} />;
}

const styles = StyleSheet.create({ base: { borderRadius: radius.lg, borderWidth: 1 }, padded: { padding: spacing.lg } });
