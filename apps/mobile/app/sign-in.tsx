import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { spacing } from '@familyapp/config';

import { AppText } from '../components/AppText';
import { AuthShell } from '../components/AuthShell';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { authClient } from '../lib/auth-client';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await authClient.signIn.email({
        email: email.trim(),
        password
      });

      if (result.error) {
        setError(result.error.message ?? 'Unable to sign in.');
        return;
      }

      router.replace('/');
    } catch {
      setError('Unable to sign in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to return to your family’s private home."
      footer={(
        <View style={styles.footer}>
          <AppText variant="caption" tone="mutedText">New to FamilyApp?</AppText>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/sign-up')} style={styles.linkButton}>
            <AppText variant="caption" tone="secondary">Create an account</AppText>
          </Pressable>
        </View>
      )}
    >
      <TextField autoFocus autoCapitalize="none" autoComplete="email" keyboardType="email-address" label="Email" onChangeText={setEmail} placeholder="you@example.com" value={email} />
      <TextField autoComplete="password" label="Password" onChangeText={setPassword} placeholder="Your password" secureTextEntry value={password} />
      {error ? <AppText variant="caption" tone="danger" style={styles.error}>{error}</AppText> : null}
      <Button fullWidth label="Sign in" loading={isSubmitting} onPress={submit} style={styles.submit} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  error: { marginTop: spacing.md },
  footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  linkButton: { justifyContent: 'center', marginLeft: spacing.xs, minHeight: 44 },
  submit: { marginTop: spacing.lg }
});
