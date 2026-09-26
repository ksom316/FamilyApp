import { useAppTheme } from '../lib/app-theme';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { radius, shadows, spacing } from '@familyapp/config';

export type CardProps = ViewProps & { padded?: boolean; elevated?: boolean };

export function Card({ padded = true, elevated = false, style, ...props }: CardProps) {
  const { colors: theme } = useAppTheme();
  return <View {...props} style={[styles.base, { backgroundColor: elevated ? theme.surfaceElevated : theme.surface, borderColor: theme.border }, padded && styles.padded, elevated && [shadows.md, { shadowColor: theme.shadow }], style]} />;
}

const styles = StyleSheet.create({ base: { borderRadius: radius.lg, borderWidth: 1 }, padded: { padding: spacing.lg } });
