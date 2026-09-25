import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from './AppText';
import { BrandMark } from './BrandMark';
import { Button } from './Button';
import { MemberAvatar } from './MemberAvatar';
import { authClient } from '../lib/auth-client';
import type { FamilyMembership } from '../lib/families';
import {
  EMPTY_NAVIGATION_ATTENTION_COUNTS,
  loadNavigationAttentionCounts,
  subscribeToAttentionRefresh,
  type NavigationAttentionCounts
} from '../lib/navigation-attention';
import { getMyIdentity, type ProfileIdentity } from '../lib/profile';

const ATTENTION_POLL_INTERVAL_MS = 30_000;
// Which nav item each attention count belongs to. Chat combines group-chat unread (this
// member's own read-state row) with the sum of every private conversation's unread count.
const BADGE_COUNT_KEYS: Partial<Record<string, keyof NavigationAttentionCounts>> = {
  notifications: 'notifications',
  tasks: 'tasks',
  polls: 'polls',
  emergency: 'emergencies',
  chat: 'chat'
};

type NavItem = { name: string; label: string; mark: string };

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Main',
    items: [
      { name: 'home', label: 'Home', mark: '⌂' },
      { name: 'notifications', label: 'Notifications', mark: '🔔' },
      { name: 'family', label: 'Family', mark: '♡' },
      { name: 'chat', label: 'Chat', mark: '◌' }
    ]
  },
  {
    label: 'Plan',
    items: [
      { name: 'plans', label: 'Plans', mark: '▤' },
      { name: 'tasks', label: 'Tasks', mark: '☐' },
      { name: 'calendar', label: 'Calendar', mark: '◫' },
      { name: 'polls', label: 'Polls', mark: '☑' },
      { name: 'shopping', label: 'Shopping', mark: '▣' },
      { name: 'menu', label: 'Menu', mark: '▨' }
    ]
  },
  {
    label: 'Keep',
    items: [
      { name: 'memories', label: 'Memories', mark: '✳' },
      { name: 'capsules', label: 'Time Capsules', mark: '⌛' }
    ]
  },
  {
    label: 'Safety',
    items: [
      { name: 'location', label: 'Location', mark: '◎' },
      { name: 'check-ins', label: 'Check-ins', mark: '✓' },
      { name: 'emergency', label: 'Emergency', mark: '⚠' }
    ]
  },
  {
    label: '',
    items: [{ name: 'brain', label: 'Family Brain', mark: '✦' }]
  }
];

export function DesktopFamilySidebar({ family }: { family: FamilyMembership }) {
  const { data: session } = authClient.useSession();
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const pathname = usePathname();
  const [counts, setCounts] = useState<NavigationAttentionCounts>(EMPTY_NAVIGATION_ATTENTION_COUNTS);
  const [identity, setIdentity] = useState<ProfileIdentity | null>(null);
  const activeRef = useRef(true);
  const inFlightRef = useRef(false);

  const loadCounts = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await loadNavigationAttentionCounts(family.familyId);
      if (activeRef.current) setCounts(result);
    } finally {
      inFlightRef.current = false;
    }
  }, [family.familyId]);

  // The sidebar's own logged-in-account preview, kept fresh on the exact same cadence as
  // the badge counts above (mount, 30s poll, app-foreground, and on-demand via
  // requestAttentionRefresh) rather than adding a second refresh mechanism.
  const loadIdentity = useCallback(async () => {
    try {
      const result = await getMyIdentity();
      if (activeRef.current) setIdentity(result);
    } catch {
      // Non-critical preview data — fall back silently to the initials rendering.
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    void loadCounts();
    void loadIdentity();
    const interval = setInterval(() => void loadCounts(), ATTENTION_POLL_INTERVAL_MS);
    // Also refresh on return to the app (foreground), not just on a fixed cadence.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { void loadCounts(); void loadIdentity(); }
    });
    // And refresh immediately when a screen reports it just changed a read-state (e.g.
    // marking chat read, or updating a profile identity) — no new timer, just an on-demand
    // call to the same loaders.
    const unsubscribeAttentionRefresh = subscribeToAttentionRefresh(() => { void loadCounts(); void loadIdentity(); });
    return () => {
      activeRef.current = false;
      clearInterval(interval);
      subscription.remove();
      unsubscribeAttentionRefresh();
    };
  }, [loadCounts, loadIdentity]);

  return (
    <View style={[styles.sidebar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <BrandMark compact />
      <View style={[styles.familyBadge, { backgroundColor: theme.primarySoft }]}>
        <AppText variant="caption" tone="primary">YOUR FAMILY</AppText>
        <AppText variant="label" numberOfLines={1} style={styles.familyName}>{family.familyName}</AppText>
      </View>
      <ScrollView style={styles.sideLinksScroll} contentContainerStyle={styles.sideLinks} showsVerticalScrollIndicator={false}>
        {navGroups.map((group, index) => (
          <View key={group.label || `group-${index}`} style={index > 0 && styles.navGroup}>
            {group.label ? <AppText variant="caption" tone="mutedText" style={styles.groupLabel}>{group.label.toUpperCase()}</AppText> : null}
            {group.items.map((item) => {
              // Match on the top-level route segment only (e.g. "chat" in "/chat/family"),
              // never "does this name appear anywhere in the path" — otherwise a nested
              // segment that happens to share a name with another nav item (like
              // "/chat/family") would also light up that other item.
              const topLevelSegment = pathname.split('/')[1] ?? '';
              const active = topLevelSegment === item.name || (item.name === 'chat' && topLevelSegment === 'private-chat');
              const countKey = BADGE_COUNT_KEYS[item.name];
              const badgeCount = countKey ? counts[countKey] : 0;
              return (
                <Pressable key={item.name} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => router.navigate(`/(family)/${item.name}` as never)} style={[styles.sideLink, active && { backgroundColor: theme.primarySoft }]}>
                  <AppText variant="body" tone={active ? 'primary' : 'mutedText'} style={styles.navMark}>{item.mark}</AppText>
                  <AppText variant="label" tone={active ? 'primary' : 'text'} style={styles.navLabel}>{item.label}</AppText>
                  {badgeCount > 0 ? (
                    <View style={[styles.navBadge, { backgroundColor: theme.danger }]}>
                      <AppText variant="caption" style={styles.navBadgeText}>{badgeCount > 9 ? '9+' : badgeCount}</AppText>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <View style={[styles.profile, { borderColor: theme.border }]}>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/(family)/profile' as never)} style={styles.profileTouchArea}>
          <MemberAvatar
            member={{
              displayName: session?.user.name,
              avatar: session?.user.image,
              identityType: identity?.identityType,
              avatarConfig: identity?.avatarConfig,
              hasPhoto: identity?.hasPhoto,
              memberId: family.id
            }}
            familyId={family.familyId}
            size={40}
          />
          <View style={styles.profileCopy}><AppText variant="label" numberOfLines={1}>{session?.user.name ?? 'Your account'}</AppText><AppText variant="caption" tone="mutedText" numberOfLines={1}>{session?.user.email ?? 'Family member'}</AppText></View>
        </Pressable>
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
        // Same fix as the desktop sidebar: match the top-level route segment only, so a
        // nested segment sharing a name with another tab (e.g. "/chat/family") can't also
        // light up that other tab.
        const topLevelSegment = pathname.split('/')[1] ?? '';
        const active = topLevelSegment === item.name || (item.name === 'more' && ['chat', 'private-chat', 'calendar', 'memories', 'polls', 'shopping', 'menu', 'capsules', 'location', 'check-ins', 'emergency', 'notifications', 'tasks', 'brain', 'invite'].includes(topLevelSegment));
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
  sidebar: { borderRightWidth: 1, flexShrink: 0, overflow: 'hidden', paddingHorizontal: spacing.md, paddingTop: spacing.xl, width: 264 },
  familyBadge: { borderRadius: radius.md, marginTop: spacing.xl, padding: spacing.md },
  familyName: { marginTop: spacing.xs },
  sideLinksScroll: { flex: 1, minHeight: 0, marginTop: spacing.lg },
  sideLinks: { gap: spacing.xs, paddingBottom: spacing.md },
  navGroup: { marginTop: spacing.md },
  groupLabel: { letterSpacing: 0.6, marginBottom: spacing.xs, marginLeft: spacing.md },
  sideLink: { alignItems: 'center', borderRadius: radius.md, flexDirection: 'row', gap: spacing.md, minHeight: 50, paddingHorizontal: spacing.md },
  navMark: { fontSize: 20, textAlign: 'center', width: 24 },
  navLabel: { flex: 1 },
  navBadge: { alignItems: 'center', borderRadius: 9, height: 18, justifyContent: 'center', minWidth: 18, paddingHorizontal: 3 },
  navBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  profile: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.lg, paddingTop: spacing.md },
  profileTouchArea: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm, minWidth: 0 },
  profileCopy: { flex: 1, minWidth: 0 },
  mobileHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 64, paddingHorizontal: spacing.md },
  mobileHeaderRight: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  mobileFamilyName: { flexShrink: 1, maxWidth: 110 },
  bottomNav: { borderTopWidth: 1, flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  bottomItem: { alignItems: 'center', borderRadius: radius.md, flex: 1, gap: 2, justifyContent: 'center', minHeight: 56 }
});
