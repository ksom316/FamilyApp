import { ActivityIndicator, Pressable, StyleSheet, Text, useColorScheme, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing, typography, type Theme } from '@familyapp/config';

type ButtonVariant = 'primary' | 'secondary' | 'quiet';
export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & { label: string; variant?: ButtonVariant; loading?: boolean; fullWidth?: boolean; style?: StyleProp<ViewStyle> };

export function Button({ label, variant = 'primary', loading = false, disabled, fullWidth = false, style, ...props }: ButtonProps) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      disabled={isDisabled}
      hitSlop={6}
      style={({ pressed }) => [styles.base, fullWidth && styles.fullWidth, variant === 'primary' && { backgroundColor: theme.primary }, variant === 'secondary' && { backgroundColor: theme.surface, borderColor: theme.borderStrong, borderWidth: 1 }, variant === 'quiet' && styles.quiet, isDisabled && styles.disabled, pressed && !isDisabled && styles.pressed, style]}
    >
      {loading ? <ActivityIndicator color={variant === 'primary' ? theme.textOnPrimary : theme.primary} /> : <Text style={[styles.label, { color: variant === 'primary' ? theme.textOnPrimary : variant === 'quiet' ? theme.secondary : theme.text }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', borderRadius: radius.md, justifyContent: 'center', minHeight: 52, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  fullWidth: { alignSelf: 'stretch', width: '100%' },
  quiet: { minHeight: 44, paddingHorizontal: spacing.sm },
  label: { fontSize: typography.size.md, fontWeight: typography.weight.bold, lineHeight: typography.lineHeight.md },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.985 }] }
});
