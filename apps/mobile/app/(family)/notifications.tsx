import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { useCurrentFamily } from '../../lib/family-context';
import {
  getFamilyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationApiError,
  type FamilyNotification
} from '../../lib/notifications';

const POLL_INTERVAL_MS = 30_000;
type Filter = 'all' | 'unread';

function formatWhen(value: string) {
  const date = new Date(value);
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const isToday = date.toDateString() === new Date().toDateString();
  if (isToday) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function NotificationsScreen() {
  const family = useCurrentFamily();
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];

  const [notifications, setNotifications] = useState<FamilyNotification[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [markingAll, setMarkingAll] = useState(false);

  const focusedRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (!focusedRef.current || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const result = await getFamilyNotifications(family.familyId);
      if (!focusedRef.current) return;
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
      setLoadError(null);
    } catch (err) {
      if (focusedRef.current) setLoadError(err instanceof NotificationApiError ? err.message : 'We could not load notifications.');
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [family.familyId]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      focusedRef.current = false;
      clearInterval(interval);
    };
  }, [load]));

  async function openNotification(notification: FamilyNotification) {
    if (!notification.readAt) {
      setNotifications((current) => current?.map((item) => (item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item)) ?? current);
      setUnreadCount((count) => Math.max(0, count - 1));
      markNotificationRead(family.familyId, notification.id).catch(() => {});
    }
    if (notification.route) router.push(notification.route as never);
  }

  async function markAllRead() {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead(family.familyId);
      setNotifications((current) => current?.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })) ?? current);
      setUnreadCount(0);
    } catch {
      // leave state as-is; the next poll will reconcile
    } finally {
      setMarkingAll(false);
    }
  }

  const visible = useMemo(() => {
    if (!notifications) return null;
    return filter === 'unread' ? notifications.filter((item) => !item.readAt) : notifications;
  }, [notifications, filter]);

  return (
    <Screen scroll maxWidth={720} contentStyle={styles.content}>
      <View style={styles.headingRow}>
        <View>
          <AppText variant="display" style={styles.title}>Notifications</AppText>
          <AppText variant="body" tone="mutedText" style={styles.subtitle}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'You’re all caught up'}
          </AppText>
        </View>
      </View>

      <View style={styles.controls}>
        <View style={styles.filterRow}>
          <FilterChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          <FilterChip label="Unread" active={filter === 'unread'} onPress={() => setFilter('unread')} />
        </View>
        <Button label="Mark all as read" variant="quiet" loading={markingAll} disabled={unreadCount === 0} onPress={() => void markAllRead()} />
      </View>

      {loadError ? (
        <Card style={[styles.messageCard, { backgroundColor: theme.dangerSoft }]}>
          <AppText variant="body" tone="danger">{loadError}</AppText>
          <Button label="Try again" variant="quiet" onPress={() => void load()} />
        </Card>
      ) : visible === null ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
          <AppText variant="caption" tone="mutedText" style={styles.loadingText}>Loading notifications…</AppText>
        </View>
      ) : visible.length === 0 ? (
        <Card style={styles.empty}>
          <AppText variant="label" style={styles.emptyTitle}>
            {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </AppText>
          <AppText variant="caption" tone="mutedText" align="center">
            {filter === 'unread' ? 'You’ve seen everything.' : 'Family activity will show up here.'}
          </AppText>
        </Card>
      ) : (
        <View style={styles.list}>
          {visible.map((notification) => (
            <Pressable key={notification.id} accessibilityRole="button" onPress={() => void openNotification(notification)}>
              <Card style={[styles.notificationCard, !notification.readAt && { borderColor: theme.primary, backgroundColor: theme.primarySoft }]}>
                <View style={styles.notificationRow}>
                  {notification.actor ? (
                    <Avatar name={notification.actor.displayName} imageUrl={notification.actor.avatar} size={36} />
                  ) : (
                    <View style={[styles.systemMark, { backgroundColor: theme.accentSoft }]}>
                      <AppText variant="label">✦</AppText>
                    </View>
                  )}
                  <View style={styles.detailCopy}>
                    <AppText variant="label" numberOfLines={2}>{notification.title}</AppText>
                    {notification.message ? <AppText variant="caption" tone="mutedText" numberOfLines={2} style={styles.messageText}>{notification.message}</AppText> : null}
                    <AppText variant="caption" tone="mutedText" style={styles.timeText}>{formatWhen(notification.createdAt)}</AppText>
                  </View>
                  {!notification.readAt ? <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} /> : null}
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? theme.primarySoft : theme.input, borderColor: active ? theme.primary : theme.border }]}
    >
      <AppText variant="label" tone={active ? 'primary' : 'text'}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xl },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between' },
  title: { marginTop: spacing.xs },
  subtitle: { marginTop: spacing.sm },
  controls: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.lg },
  filterRow: { flexDirection: 'row', gap: spacing.sm },
  chip: { borderRadius: radius.pill, borderWidth: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md },
  messageCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.lg },
  loading: { alignItems: 'center', paddingVertical: spacing.xxxl },
  loadingText: { marginTop: spacing.md },
  empty: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, padding: spacing.xl },
  emptyTitle: { marginBottom: spacing.xs },
  list: { gap: spacing.sm, marginTop: spacing.md },
  notificationCard: { padding: spacing.lg },
  notificationRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  systemMark: { alignItems: 'center', borderRadius: radius.md, height: 36, justifyContent: 'center', width: 36 },
  detailCopy: { flex: 1, minWidth: 0 },
  messageText: { marginTop: spacing.xs },
  timeText: { marginTop: spacing.xs },
  unreadDot: { borderRadius: 5, height: 10, width: 10 }
});
