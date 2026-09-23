import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing, typography } from '@familyapp/config';
import { authClient } from '../lib/auth-client';
import { useAuth } from '../lib/use-auth';

export default function HomeScreen() {
  const { data: session, status } = useAuth();

  if (status === 'loading') {
    return <View style={styles.container}><Text style={styles.subtitle}>Loading your session…</Text></View>;
  }

  if (status === 'unauthenticated') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>FamilyApp</Text>
        <Text style={styles.subtitle}>A warm home for the people you love.</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.push('/sign-in')}>
          <Text style={styles.primaryButtonText}>Sign in</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.push('/sign-up')}>
          <Text style={styles.secondaryButtonText}>Create an account</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>SIGNED IN</Text>
      <Text style={styles.title}>Welcome, {session?.user.name}</Text>
      <Text style={styles.subtitle}>{session?.user.email}</Text>
      <Pressable style={styles.secondaryButton} onPress={() => authClient.signOut()}>
        <Text style={styles.secondaryButtonText}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.light.background, padding: spacing.xl },
  eyebrow: { color: colors.light.success, fontSize: typography.size.xs, fontWeight: '700', letterSpacing: 1.5 },
  title: { color: colors.light.text, fontSize: typography.size.xl, fontWeight: '700', marginTop: spacing.sm, textAlign: 'center' },
  subtitle: { color: colors.light.mutedText, fontSize: typography.size.md, marginTop: spacing.sm, textAlign: 'center' },
  primaryButton: { alignItems: 'center', backgroundColor: colors.light.primary, borderRadius: 14, marginTop: spacing.xl, padding: spacing.md, width: '100%', maxWidth: 360 },
  primaryButtonText: { color: colors.light.surface, fontSize: typography.size.md, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', borderColor: colors.light.border, borderRadius: 14, borderWidth: 1, marginTop: spacing.md, padding: spacing.md, width: '100%', maxWidth: 360 },
  secondaryButtonText: { color: colors.light.text, fontSize: typography.size.md, fontWeight: '600' }
});
