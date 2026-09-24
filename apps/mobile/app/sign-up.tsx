import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { spacing } from '@familyapp/config';

import { AppText } from '../components/AppText';
import { AuthShell } from '../components/AuthShell';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
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
    <AuthShell
      title="Make room for together"
      subtitle="Create your private FamilyApp account in a few seconds."
      footer={(
        <View style={styles.footer}>
          <AppText variant="caption" tone="mutedText">Already have an account?</AppText>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/sign-in')} style={styles.linkButton}>
            <AppText variant="caption" tone="secondary">Sign in</AppText>
          </Pressable>
        </View>
      )}
    >
      <TextField autoFocus autoComplete="name" label="Your name" onChangeText={setName} placeholder="What should we call you?" value={name} />
      <TextField autoCapitalize="none" autoComplete="email" keyboardType="email-address" label="Email" onChangeText={setEmail} placeholder="you@example.com" value={email} />
      <TextField autoComplete="new-password" label="Password" onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry value={password} />
      <AppText variant="caption" tone="mutedText" style={styles.hint}>Your account is the beginning of your private family space.</AppText>
      {error ? <AppText variant="caption" tone="danger" style={styles.error}>{error}</AppText> : null}
      <Button fullWidth label="Create account" loading={isSubmitting} onPress={submit} style={styles.submit} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  error: { marginTop: spacing.md },
  footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  hint: { marginTop: spacing.md },
  linkButton: { justifyContent: 'center', marginLeft: spacing.xs, minHeight: 44 },
  submit: { marginTop: spacing.lg }
});
