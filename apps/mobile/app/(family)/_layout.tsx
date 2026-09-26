import { useAppTheme } from '../../lib/app-theme';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Redirect, Slot } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing } from '@familyapp/config';

import { AppText } from '../../components/AppText';
import { DesktopFamilySidebar, MobileFamilyHeader, MobileFamilyNavigation } from '../../components/FamilyNavigation';
import { FamilyOnboarding } from '../../components/FamilyOnboarding';
import { Screen } from '../../components/Screen';
import { FamilyContext } from '../../lib/family-context';
import { getFamilyMemberships, type FamilyMembership } from '../../lib/families';
import { useAuth } from '../../lib/use-auth';

export default function FamilyLayout() {
  const { status } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const [memberships, setMemberships] = useState<FamilyMembership[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { colors: theme } = useAppTheme();

  const loadMemberships = useCallback(async () => {
    setError(null);
    setMemberships(null);
    try {
      setMemberships(await getFamilyMemberships());
    } catch {
      setError('We could not load your family space.');
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') void loadMemberships();
    else setMemberships(null);
  }, [loadMemberships, status]);

  if (status === 'loading') {
    return <Screen contentStyle={styles.state}><ActivityIndicator color={theme.primary} /><AppText variant="caption" tone="mutedText" style={styles.stateText}>Checking your private space…</AppText></Screen>;
  }
  if (status === 'unauthenticated') return <Redirect href="/" />;
  if (error) return <Screen contentStyle={styles.state}><AppText variant="heading">Your family space is resting.</AppText><AppText variant="body" tone="mutedText" style={styles.stateText}>{error}</AppText><AppText accessibilityRole="link" onPress={() => void loadMemberships()} variant="label" tone="primary" style={styles.retry}>Try again</AppText></Screen>;
  if (!memberships) return <Screen contentStyle={styles.state}><ActivityIndicator color={theme.primary} /><AppText variant="caption" tone="mutedText" style={styles.stateText}>Finding your family space…</AppText></Screen>;
  if (memberships.length === 0) return <FamilyOnboarding onComplete={loadMemberships} />;

  const family = memberships[0];

  return (
    <FamilyContext.Provider value={family}>
      <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <View style={[styles.appLayout, isDesktop && styles.desktopLayout]}>
          {isDesktop ? <DesktopFamilySidebar family={family} /> : null}
          <View style={styles.main}>
            {!isDesktop ? <MobileFamilyHeader family={family} /> : null}
            <View style={styles.routes}><Slot /></View>
            {!isDesktop ? <MobileFamilyNavigation /> : null}
          </View>
        </View>
      </SafeAreaView>
    </FamilyContext.Provider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  appLayout: { flex: 1 },
  desktopLayout: { flexDirection: 'row' },
  main: { flex: 1, minWidth: 0 },
  routes: { flex: 1 },
  state: { alignItems: 'center', justifyContent: 'center' },
  stateText: { marginTop: spacing.md },
  retry: { marginTop: spacing.lg }
});
