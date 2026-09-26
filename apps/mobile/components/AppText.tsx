import { useAppTheme } from '../lib/app-theme';
import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';
import { typography } from '@familyapp/config';

type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'eyebrow';
type TextTone = 'text' | 'mutedText' | 'primary' | 'secondary' | 'success' | 'danger' | 'textOnPrimary';

export type AppTextProps = TextProps & { variant?: TextVariant; tone?: TextTone; align?: TextStyle['textAlign'] };

export function AppText({ variant = 'body', tone = 'text', align, style, ...props }: AppTextProps) {
  const { colors: theme } = useAppTheme();
  return <Text {...props} style={[styles[variant], { color: theme[tone], textAlign: align }, style]} />;
}

const styles = StyleSheet.create({
  display: { fontSize: typography.size.display, fontWeight: typography.weight.heavy, lineHeight: typography.lineHeight.display, letterSpacing: -1.5 },
  title: { fontSize: typography.size.xxl, fontWeight: typography.weight.bold, lineHeight: typography.lineHeight.xxl, letterSpacing: -0.7 },
  heading: { fontSize: typography.size.xl, fontWeight: typography.weight.bold, lineHeight: typography.lineHeight.xl, letterSpacing: -0.4 },
  body: { fontSize: typography.size.md, fontWeight: typography.weight.regular, lineHeight: typography.lineHeight.md },
  label: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, lineHeight: typography.lineHeight.sm },
  caption: { fontSize: typography.size.xs, fontWeight: typography.weight.medium, lineHeight: typography.lineHeight.xs },
  eyebrow: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, letterSpacing: 1.5, lineHeight: typography.lineHeight.xs, textTransform: 'uppercase' }
});
