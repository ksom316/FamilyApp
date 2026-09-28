import { useRef } from 'react';
import { useAppTheme } from '../lib/app-theme';
import { motion, useReducedMotion } from '../lib/motion';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { radius, spacing, typography } from '@familyapp/config';

type ButtonVariant = 'primary' | 'secondary' | 'quiet';
export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & { label: string; variant?: ButtonVariant; loading?: boolean; fullWidth?: boolean; style?: StyleProp<ViewStyle> };

export function Button({ label, variant = 'primary', loading = false, disabled, fullWidth = false, style, onPressIn, onPressOut, ...props }: ButtonProps) {
  const { colors: theme } = useAppTheme();
  const isDisabled = disabled || loading;
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  return (
    // The scale animation lives on this outer Animated.View, not on the Pressable that holds
    // the label. Combining Animated.createAnimatedComponent(Pressable) with a Text child put the
    // label's Yoga/text measurement inside the same native node the Animated native driver
    // mutates directly, and on Android that produced a stale, narrower text measurement that
    // rendered as a truncated label ("Join a Family" -> "Join a") in release builds. Keeping the
    // transform on an outer, text-free node and the label on a plain, unanimated inner Pressable
    // avoids that shared node entirely, independent of exact device width.
    <Animated.View
      style={[
        styles.base,
        fullWidth && styles.fullWidth,
        variant === 'primary' && { backgroundColor: theme.primary },
        variant === 'secondary' && { backgroundColor: theme.surfaceSecondary, borderColor: theme.borderStrong, borderWidth: 1 },
        variant === 'quiet' && styles.quiet,
        isDisabled && styles.disabled,
        style,
        !reduced && { transform: [{ scale }] }
      ]}
    >
      <Pressable
        {...props}
        accessibilityRole="button"
        accessibilityState={{ busy: loading, disabled: isDisabled }}
        disabled={isDisabled}
        hitSlop={6}
        onPressIn={(event) => {
          if (!isDisabled && !reduced) Animated.timing(scale, { duration: motion.pressIn, easing: Easing.out(Easing.quad), toValue: 0.98, useNativeDriver: true }).start();
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          if (!isDisabled && !reduced) Animated.spring(scale, { damping: 18, mass: 0.55, stiffness: 250, toValue: 1, useNativeDriver: true }).start();
          onPressOut?.(event);
        }}
        style={styles.hitArea}
      >
        {loading ? <ActivityIndicator color={variant === 'primary' ? theme.textOnPrimary : theme.primary} /> : <Text style={[styles.label, { color: variant === 'primary' ? theme.textOnPrimary : variant === 'quiet' ? theme.secondary : theme.text }]}>{label}</Text>}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', borderRadius: radius.md, justifyContent: 'center', minHeight: 52, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  fullWidth: { alignSelf: 'stretch', width: '100%' },
  quiet: { minHeight: 44, paddingHorizontal: spacing.sm },
  hitArea: { alignItems: 'center', alignSelf: 'stretch', flexGrow: 1, justifyContent: 'center' },
  label: { fontSize: typography.size.md, fontWeight: typography.weight.bold, lineHeight: typography.lineHeight.md, textAlign: 'center' },
  disabled: { opacity: 0.48 },
});
