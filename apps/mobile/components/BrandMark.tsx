import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import { colors, radius, spacing, typography, type Theme } from '@familyapp/config';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  return <View style={styles.row}><View style={[styles.mark, { backgroundColor: theme.primary, borderRadius: compact ? 10 : 14 }]}><View style={[styles.dot, { backgroundColor: theme.accent }]} /><View style={[styles.dot, styles.dotSmall, { backgroundColor: theme.secondary }]} /></View><Text style={[styles.name, { color: theme.text, fontSize: compact ? typography.size.lg : typography.size.xl }]}>Family<Text style={{ color: theme.primary }}>App</Text></Text></View>;
}

const styles = StyleSheet.create({ row: { alignItems: 'center', flexDirection: 'row' }, mark: { height: 40, justifyContent: 'center', marginRight: spacing.sm, overflow: 'hidden', position: 'relative', width: 40 }, dot: { borderRadius: radius.pill, height: 13, left: 9, position: 'absolute', top: 8, width: 13 }, dotSmall: { height: 10, left: 20, top: 22, width: 10 }, name: { fontWeight: typography.weight.heavy, letterSpacing: -0.5 } });
