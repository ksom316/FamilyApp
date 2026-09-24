import { ActivityIndicator, StyleSheet, useColorScheme } from 'react-native';
import { Redirect, router } from 'expo-router';
import { colors, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../components/AppText';
import { BrandMark } from '../components/BrandMark';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { useAuth } from '../lib/use-auth';

export default function IndexScreen() {
  const { status } = useAuth();
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];

  if (status === 'loading') {
    return <Screen contentStyle={styles.loading}><ActivityIndicator color={theme.primary} /><AppText variant="caption" tone="mutedText" style={styles.loadingText}>Checking your private space…</AppText></Screen>;
  }

  if (status === 'authenticated') return <Redirect href="/(family)/home" />;

  return (
    <Screen scroll contentStyle={styles.publicContent}>
      <BrandMark />
      <Card elevated style={styles.publicCard}>
        <AppText variant="eyebrow" tone="primary">A softer place to land</AppText>
        <AppText variant="display" style={styles.publicTitle}>More of life, together.</AppText>
        <AppText variant="body" tone="mutedText" style={styles.publicBody}>A private, thoughtful home for the people you love.</AppText>
        <Button fullWidth label="Sign in" onPress={() => router.push('/sign-in')} style={styles.action} />
        <Button fullWidth label="Create an account" onPress={() => router.push('/sign-up')} variant="secondary" style={styles.action} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: spacing.md },
  publicContent: { justifyContent: 'center', maxWidth: 620 },
  publicCard: { marginTop: spacing.xl, padding: spacing.xl },
  publicTitle: { marginTop: spacing.md },
  publicBody: { marginTop: spacing.md },
  action: { marginTop: spacing.md }
});
