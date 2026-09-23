import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, spacing, typography } from '@familyapp/config';

import { authClient } from '../lib/auth-client';

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setIsSubmitting(true);
    const result = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password });
    setIsSubmitting(false);

    if (result.error) {
      setError(result.error.message ?? 'Unable to create your account.');
      return;
    }

    router.replace('/');
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Start building your family home.</Text>
          <TextInput autoComplete="name" onChangeText={setName} placeholder="Name" placeholderTextColor={colors.light.mutedText} style={styles.input} value={name} />
          <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.light.mutedText} style={styles.input} value={email} />
          <TextInput autoComplete="new-password" onChangeText={setPassword} placeholder="Password (8+ characters)" placeholderTextColor={colors.light.mutedText} secureTextEntry style={styles.input} value={password} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable disabled={isSubmitting} onPress={submit} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{isSubmitting ? 'Creating account…' : 'Create account'}</Text>
          </Pressable>
          <Pressable onPress={() => router.replace('/sign-in')} style={styles.linkButton}>
            <Text style={styles.linkText}>Already have an account? Sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.light.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  card: { alignSelf: 'center', backgroundColor: colors.light.surface, borderColor: colors.light.border, borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, width: '100%', maxWidth: 440 },
  title: { color: colors.light.text, fontSize: typography.size.xl, fontWeight: '700' },
  subtitle: { color: colors.light.mutedText, fontSize: typography.size.md, marginTop: spacing.sm },
  input: { backgroundColor: colors.light.background, borderColor: colors.light.border, borderRadius: radius.md, borderWidth: 1, color: colors.light.text, fontSize: typography.size.md, marginTop: spacing.md, padding: spacing.md },
  error: { color: colors.light.danger, fontSize: typography.size.sm, marginTop: spacing.sm },
  primaryButton: { alignItems: 'center', backgroundColor: colors.light.primary, borderRadius: radius.md, marginTop: spacing.lg, padding: spacing.md },
  primaryButtonText: { color: colors.light.surface, fontSize: typography.size.md, fontWeight: '700' },
  linkButton: { alignItems: 'center', marginTop: spacing.lg },
  linkText: { color: colors.light.secondary, fontSize: typography.size.sm, fontWeight: '600' }
});
