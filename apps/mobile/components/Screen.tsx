import { useAppTheme } from '../lib/app-theme';
import { ScrollView, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { spacing } from '@familyapp/config';

export type ScreenProps = { children: React.ReactNode; scroll?: boolean; contentStyle?: ViewStyle; maxWidth?: number };

export function Screen({ children, scroll = false, contentStyle, maxWidth = 1180 }: ScreenProps) {
  const { colors: theme } = useAppTheme();
  const { width } = useWindowDimensions();
  const horizontalPadding = width >= 900 ? spacing.xxl : spacing.lg;
  const content = <View style={[styles.content, { maxWidth, paddingHorizontal: horizontalPadding }, contentStyle]}>{children}</View>;
  return scroll ? <ScrollView contentContainerStyle={[styles.scroll, { backgroundColor: theme.background }]} keyboardShouldPersistTaps="handled">{content}</ScrollView> : <View style={[styles.screen, { backgroundColor: theme.background }]}>{content}</View>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, scroll: { flexGrow: 1, minHeight: '100%' }, content: { alignSelf: 'center', flexGrow: 1, width: '100%' } });
