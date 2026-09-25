import { Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { BrandMark } from './BrandMark';
import { Button } from './Button';
import { authClient } from '../lib/auth-client';
import type { FamilyMembership } from '../lib/families';

const navItems = [
  { name: 'home', label: 'Home', mark: '⌂' },
  { name: 'family', label: 'Family', mark: '♡' },
  { name: 'chat', label: 'Chat', mark: '◌' },
  { name: 'plans', label: 'Plans', mark: '▤' },
  { name: 'calendar', label: 'Calendar', mark: '◫' },
  { name: 'memories', label: 'Memories', mark: '✳' },
  { name: 'polls', label: 'Polls', mark: '☑' },
  { name: 'shopping', label: 'Shopping', mark: '▣' },
  { name: 'menu', label: 'Menu', mark: '▨' },
  { name: 'capsules', label: 'Time Capsules', mark: '⌛' },
  { name: 'location', label: 'Location', mark: '◎' },
  { name: 'check-ins', label: 'Check-ins', mark: '✓' },
  { name: 'emergency', label: 'Emergency', mark: '⚠' },
  { name: 'brain', label: 'Family Brain', mark: '✦' }
] as const;

export function DesktopFamilySidebar({ family }: { family: FamilyMembership }) {
  const { data: session } = authClient.useSession();
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const pathname = usePathname();

  return (
    <View style={[styles.sidebar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <BrandMark compact />
      <View style={[styles.familyBadge, { backgroundColor: theme.primarySoft }]}>
        <AppText variant="caption" tone="primary">YOUR FAMILY</AppText>
        <AppText variant="label" numberOfLines={1} style={styles.familyName}>{family.familyName}</AppText>
      </View>
      <View style={styles.sideLinks}>
        {navItems.map((item) => {
          const active = pathname.split('/').includes(item.name) || (item.name === 'chat' && pathname.split('/').includes('private-chat'));
          return (
            <Pressable key={item.name} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => router.navigate(`/(family)/${item.name}` as never)} style={[styles.sideLink, active && { backgroundColor: theme.primarySoft }]}>
              <AppText variant="body" tone={active ? 'primary' : 'mutedText'} style={styles.navMark}>{item.mark}</AppText>
              <AppText variant="label" tone={active ? 'primary' : 'text'}>{item.label}</AppText>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.profile, { borderColor: theme.border }]}>
        <Avatar name={session?.user.name} imageUrl={session?.user.image} size={40} />
        <View style={styles.profileCopy}><AppText variant="label" numberOfLines={1}>{session?.user.name ?? 'Your account'}</AppText><AppText variant="caption" tone="mutedText" numberOfLines={1}>{session?.user.email ?? 'Family member'}</AppText></View>
        <Button label="Log out" onPress={() => void authClient.signOut()} variant="quiet" />
      </View>
    </View>
  );
}

export function MobileFamilyHeader({ family }: { family: FamilyMembership }) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <View style={[styles.mobileHeader, { borderColor: theme.border }]}>
      <BrandMark compact />
      <View style={styles.mobileHeaderRight}>
        <AppText variant="label" numberOfLines={1} style={styles.mobileFamilyName}>{family.familyName}</AppText>
        <Button label="Log out" onPress={() => void authClient.signOut()} variant="quiet" />
      </View>
    </View>
  );
}

export function MobileFamilyNavigation() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const pathname = usePathname();
  const items = [
    { name: 'home', label: 'Home', mark: '⌂' },
    { name: 'family', label: 'Family', mark: '♡' },
    { name: 'plans', label: 'Plans', mark: '▤' },
    { name: 'more', label: 'More', mark: '•••' }
  ];

  return (
    <View style={[styles.bottomNav, { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {items.map((item) => {
        const active = pathname.endsWith(`/${item.name}`) || (item.name === 'more' && ['chat', 'private-chat', 'calendar', 'memories', 'polls', 'shopping', 'menu', 'capsules', 'location', 'check-ins', 'emergency', 'brain', 'invite'].some((route) => pathname.split('/').includes(route)));
        return (
          <Pressable key={item.name} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={item.label} onPress={() => router.navigate(`/(family)/${item.name}` as never)} style={[styles.bottomItem, active && { backgroundColor: theme.primarySoft }]}>
            <AppText variant="body" tone={active ? 'primary' : 'mutedText'}>{item.mark}</AppText>
            <AppText variant="caption" tone={active ? 'primary' : 'mutedText'}>{item.label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { borderRightWidth: 1, paddingHorizontal: spacing.md, paddingTop: spacing.xl, width: 264 },
  familyBadge: { borderRadius: radius.md, marginTop: spacing.xl, padding: spacing.md },
  familyName: { marginTop: spacing.xs },
  sideLinks: { gap: spacing.xs, marginTop: spacing.xl },
  sideLink: { alignItems: 'center', borderRadius: radius.md, flexDirection: 'row', gap: spacing.md, minHeight: 50, paddingHorizontal: spacing.md },
  navMark: { fontSize: 20, textAlign: 'center', width: 24 },
  profile: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, marginTop: 'auto', paddingBottom: spacing.lg, paddingTop: spacing.md },
  profileCopy: { flex: 1, minWidth: 0 },
  mobileHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 64, paddingHorizontal: spacing.md },
  mobileHeaderRight: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  mobileFamilyName: { flexShrink: 1, maxWidth: 110 },
  bottomNav: { borderTopWidth: 1, flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  bottomItem: { alignItems: 'center', borderRadius: radius.md, flex: 1, gap: 2, justifyContent: 'center', minHeight: 56 }
});
