import { useAppTheme } from '../lib/app-theme';
import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps, type TextInput as TextInputType } from 'react-native';
import { radius, spacing, typography } from '@familyapp/config';
import { AppText } from './AppText';

export type TextFieldProps = Omit<TextInputProps, 'style'> & { label: string; error?: string | null; hint?: string };

export const TextField = forwardRef<TextInputType, TextFieldProps>(function TextField({ label, error, hint, onBlur, onFocus, ...props }, ref) {
  const { colors: theme } = useAppTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      <AppText variant="label" style={styles.label}>{label}</AppText>
      <TextInput
        {...props}
        ref={ref}
        accessibilityLabel={props.accessibilityLabel ?? label}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        placeholderTextColor={props.placeholderTextColor ?? theme.placeholder}
        style={[styles.input, { backgroundColor: theme.input, borderColor: error ? theme.danger : focused ? theme.primary : theme.inputBorder, color: theme.text }]}
      />
      {error ? <AppText variant="caption" tone="danger" style={styles.message}>{error}</AppText> : hint ? <AppText variant="caption" tone="mutedText" style={styles.message}>{hint}</AppText> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { marginTop: spacing.md },
  label: { marginBottom: spacing.xs },
  input: { borderRadius: radius.md, borderWidth: 1, fontSize: typography.size.md, minHeight: 54, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  message: { marginTop: spacing.xs }
});
