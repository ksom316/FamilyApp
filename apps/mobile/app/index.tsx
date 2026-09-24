import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../components/AppText';
import { Avatar } from '../components/Avatar';
import { BrandMark } from '../components/BrandMark';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FamilyOnboarding } from '../components/FamilyOnboarding';
import { Screen } from '../components/Screen';
import { authClient } from '../lib/auth-client';
import { getFamilyMemberships, type FamilyMembership } from '../lib/families';
import { useAuth } from '../lib/use-auth';

export default function HomeScreen() {
  const { data: session, status } = useAuth();
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const [memberships, setMemberships] = useState<FamilyMembership[] | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const loadMemberships = useCallback(async () => {
    setMembershipError(null);
    setMemberships(null);
    try {
      setMemberships(await getFamilyMemberships());
    } catch {
      setMembershipError('We could not load your family space.');
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') void loadMemberships();
    else setMemberships(null);
  }, [loadMemberships, status]);

  if (status === 'loading') {
    return <Screen contentStyle={styles.loading}><ActivityIndicator color={theme.primary} /><AppText variant="caption" tone="mutedText" style={styles.loadingText}>Checking your private space…</AppText></Screen>;
  }

  if (status === 'unauthenticated') {
    return (
      <Screen scroll contentStyle={styles.publicContent}>
        <View style={styles.publicHeader}><BrandMark /></View>
        <Card elevated style={styles.publicCard}>
          <AppText variant="eyebrow" tone="primary">A softer place to land</AppText>
          <AppText variant="display" style={styles.publicTitle}>More of life, together.</AppText>
          <AppText variant="body" tone="mutedText" style={styles.publicBody}>A private, thoughtful home for the people you love. FamilyApp is just getting started.</AppText>
          <View style={styles.publicActions}>
            <Button fullWidth label="Sign in" onPress={() => router.push('/sign-in')} />
            <Button fullWidth label="Create an account" onPress={() => router.push('/sign-up')} variant="secondary" />
          </View>
        </Card>
      </Screen>
    );
  }

  if (membershipError) {
    return <Screen contentStyle={styles.loading}><AppText variant="heading">Your family space is resting.</AppText><AppText variant="body" tone="mutedText" style={styles.loadingText}>{membershipError}</AppText><Button label="Try again" onPress={() => void loadMemberships()} style={styles.retry} /></Screen>;
  }

  if (!memberships) {
    return <Screen contentStyle={styles.loading}><ActivityIndicator color={theme.primary} /><AppText variant="caption" tone="mutedText" style={styles.loadingText}>Finding your family space…</AppText></Screen>;
  }

  if (memberships.length === 0) {
    return <FamilyOnboarding onComplete={loadMemberships} />;
  }

  const membership = memberships[0];

  const userName = session?.user.name?.trim() || 'there';
  const firstName = userName.split(/\s+/)[0];

  return (
    <Screen scroll>
      <View style={styles.header}><BrandMark compact /><Button label="Log out" onPress={() => void authClient.signOut()} variant="quiet" /></View>
      <View style={[styles.hero, isWide && styles.heroWide]}>
        <View style={styles.heroCopy}>
          <AppText variant="eyebrow" tone="primary">Family space ready</AppText>
          <AppText variant="display" style={styles.heroTitle}>{membership.familyName}</AppText>
          <AppText variant="body" tone="mutedText" style={styles.heroBody}>Welcome, {firstName}. This is your private place for the people and moments that matter most.</AppText>
        </View>
        <View style={[styles.welcomeCard, { backgroundColor: theme.primarySoft }]}>
          <Avatar name={membership.familyName} size={72} />
          <AppText variant="heading" style={styles.welcomeTitle}>You’re all set.</AppText>
          <AppText variant="caption" tone="mutedText">You joined as {membership.role}. Your family home is ready for the next chapter.</AppText>
        </View>
      </View>
      <Card style={styles.foundationCard}>
        <AppText variant="eyebrow" tone="secondary">Family ready</AppText>
        <AppText variant="heading" style={styles.foundationTitle}>The family dashboard comes next.</AppText>
        <AppText variant="body" tone="mutedText">Your membership is connected and secure. We’ll make this home more useful together, one thoughtful step at a time.</AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: spacing.md },
  retry: { marginTop: spacing.lg },
  publicContent: { justifyContent: 'center', maxWidth: 620 },
  publicHeader: { alignItems: 'center', marginBottom: spacing.xl },
  publicCard: { padding: spacing.xl },
  publicTitle: { marginTop: spacing.md },
  publicBody: { marginTop: spacing.md },
  publicActions: { gap: spacing.sm, marginTop: spacing.xl },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl },
  hero: { gap: spacing.lg },
  heroWide: { alignItems: 'stretch', flexDirection: 'row' },
  heroCopy: { flex: 1, justifyContent: 'center', paddingVertical: spacing.lg },
  heroTitle: { marginTop: spacing.md },
  heroBody: { marginTop: spacing.md, maxWidth: 470 },
  welcomeCard: { borderRadius: radius.xl, flex: 1, minHeight: 220, padding: spacing.xl },
  welcomeTitle: { marginTop: spacing.lg },
  foundationCard: { marginTop: spacing.lg },
  foundationTitle: { marginBottom: spacing.sm, marginTop: spacing.md }
});
