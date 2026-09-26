import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { getFamilyCheckIns, postCheckIn, type FamilyCheckIn } from '../../lib/check-ins';
import { DailyBriefingApiError, getDailyBriefing, type DailyBriefing } from '../../lib/daily-briefing';
import { getFamilyEmergencies, type EmergencyIncident } from '../../lib/emergency';
import { useCurrentFamily } from '../../lib/family-context';
import { getFamilyNotifications } from '../../lib/notifications';
import { getFamilyMembers } from '../../lib/families';
import { getFamilyLocationShares, type FamilyLocationShare } from '../../lib/location';
import { getFamilyMemories, type FamilyMemory } from '../../lib/memories';
import { getFamilyPlans, type FamilyPlans } from '../../lib/plans';
import { getFamilyTasks, type TaskSummary } from '../../lib/tasks';
import { getFamilyTimeCapsules, type TimeCapsuleSummary } from '../../lib/time-capsules';
import { useAuth } from '../../lib/use-auth';
import { getWeeklyRecap, WeeklyRecapApiError, type WeeklyRecap } from '../../lib/weekly-recap';

const BRIEFING_POLL_INTERVAL_MS = 60_000;

function greetingForHour(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function FamilyHomeScreen() {
  const family = useCurrentFamily();
  const { data: session } = useAuth();
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [memberCountFailed, setMemberCountFailed] = useState(false);
  const [plans, setPlans] = useState<FamilyPlans | null>(null);
  const [plansFailed, setPlansFailed] = useState(false);
  const [memories, setMemories] = useState<FamilyMemory[] | null>(null);
  const [memoriesFailed, setMemoriesFailed] = useState(false);
  const [locationShares, setLocationShares] = useState<FamilyLocationShare[] | null>(null);
  const [locationFailed, setLocationFailed] = useState(false);
  const [timeCapsules, setTimeCapsules] = useState<TimeCapsuleSummary[] | null>(null);
  const [timeCapsulesFailed, setTimeCapsulesFailed] = useState(false);
  const [myLatestCheckIn, setMyLatestCheckIn] = useState<FamilyCheckIn | null>(null);
  const [checkInsFailed, setCheckInsFailed] = useState(false);
  const [checkInSending, setCheckInSending] = useState<'safe' | 'arrived' | null>(null);
  const [activeEmergencies, setActiveEmergencies] = useState<EmergencyIncident[] | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [myTasks, setMyTasks] = useState<TaskSummary[] | null>(null);
  const [tasksFailed, setTasksFailed] = useState(false);
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [weeklyRecap, setWeeklyRecap] = useState<WeeklyRecap | null>(null);
  const [weeklyRecapError, setWeeklyRecapError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setMemberCountFailed(false);
    setPlansFailed(false);
    setMemoriesFailed(false);
    setLocationFailed(false);
    setTimeCapsulesFailed(false);
    setCheckInsFailed(false);
    setTasksFailed(false);
    void getFamilyMembers(family.familyId).then((members) => {
      if (active) setMemberCount(members.length);
    }).catch(() => {
      if (active) setMemberCountFailed(true);
    });
    void getFamilyPlans(family.familyId).then((nextPlans) => {
      if (active) setPlans(nextPlans);
    }).catch(() => {
      if (active) setPlansFailed(true);
    });
    void getFamilyMemories(family.familyId).then((nextMemories) => {
      if (active) setMemories(nextMemories);
    }).catch(() => {
      if (active) setMemoriesFailed(true);
    });
    void getFamilyLocationShares(family.familyId).then((shares) => {
      if (active) setLocationShares(shares);
    }).catch(() => {
      if (active) setLocationFailed(true);
    });
    void getFamilyTimeCapsules(family.familyId).then((result) => {
      if (active) setTimeCapsules(result.capsules);
    }).catch(() => {
      if (active) setTimeCapsulesFailed(true);
    });
    void getFamilyCheckIns(family.familyId).then((checkIns) => {
      if (active) setMyLatestCheckIn(checkIns.find((item) => item.member.memberId === family.id) ?? null);
    }).catch(() => {
      if (active) setCheckInsFailed(true);
    });
    void getFamilyEmergencies(family.familyId).then((result) => {
      if (active) setActiveEmergencies(result.active);
    }).catch(() => {
      // The compact Emergency shortcut degrades gracefully with no count shown.
    });
    void getFamilyNotifications(family.familyId).then((result) => {
      if (active) setUnreadNotifications(result.unreadCount);
    }).catch(() => {
      // The Notifications shortcut degrades gracefully with no count shown.
    });
    void getFamilyTasks(family.familyId).then((tasks) => {
      if (active) setMyTasks(tasks);
    }).catch(() => {
      if (active) setTasksFailed(true);
    });
    return () => { active = false; };
  }, [family.familyId, family.id]);

  // The daily briefing and weekly recap share one focus/foreground-aware refresh (same
  // shape as the sidebar's attention counts and the Tasks screen's own polling) rather than
  // the plain mount-only effect above, since "what matters today/this week" should be
  // current when you come back to Home, not just when you first land on it. They're two
  // independent requests (each with its own in-flight guard, so one being slow never blocks
  // the other) but deliberately share a single timer/AppState subscription per F21 §10.
  const briefingFocusedRef = useRef(false);
  const briefingInFlightRef = useRef(false);
  const recapInFlightRef = useRef(false);

  const loadBriefing = useCallback(async () => {
    if (!briefingFocusedRef.current || briefingInFlightRef.current) return;
    briefingInFlightRef.current = true;
    try {
      const result = await getDailyBriefing(family.familyId);
      if (briefingFocusedRef.current) {
        setBriefing(result);
        setBriefingError(null);
      }
    } catch (err) {
      if (briefingFocusedRef.current) setBriefingError(err instanceof DailyBriefingApiError ? err.message : 'We could not load today’s briefing.');
    } finally {
      briefingInFlightRef.current = false;
    }
  }, [family.familyId]);

  const loadWeeklyRecap = useCallback(async () => {
    if (!briefingFocusedRef.current || recapInFlightRef.current) return;
    recapInFlightRef.current = true;
    try {
      const result = await getWeeklyRecap(family.familyId);
      if (briefingFocusedRef.current) {
        setWeeklyRecap(result);
        setWeeklyRecapError(null);
      }
    } catch (err) {
      if (briefingFocusedRef.current) setWeeklyRecapError(err instanceof WeeklyRecapApiError ? err.message : 'We could not load your family’s week.');
    } finally {
      recapInFlightRef.current = false;
    }
  }, [family.familyId]);

  useFocusEffect(useCallback(() => {
    briefingFocusedRef.current = true;
    void loadBriefing();
    void loadWeeklyRecap();
    const interval = setInterval(() => { void loadBriefing(); void loadWeeklyRecap(); }, BRIEFING_POLL_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { void loadBriefing(); void loadWeeklyRecap(); }
    });
    return () => {
      briefingFocusedRef.current = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [loadBriefing, loadWeeklyRecap]));

  async function sendQuickCheckIn(status: 'safe' | 'arrived') {
    setCheckInSending(status);
    try {
      const checkIn = await postCheckIn(family.familyId, { status });
      setMyLatestCheckIn(checkIn);
    } catch (err) {
      // Silently ignored here — the full Check-ins screen surfaces errors; this is a quick action.
      void err;
    } finally {
      setCheckInSending(null);
    }
  }

  const name = session?.user.name?.trim() || 'there';
  const firstName = name.split(/\s+/)[0];
  const shellWidth = width >= 900 ? width - 264 : width;
  const horizontalPadding = width >= 900 ? spacing.xxl * 2 : spacing.lg * 2;
  const contentWidth = Math.min(1080, shellWidth - horizontalPadding);
  const isWideHero = contentWidth >= 720;
  const isCompact = contentWidth < 620;
  const amISharing = locationShares?.some((share) => share.memberId === family.id) ?? false;
  const visibleFindMeShares = locationShares?.filter((share) => share.memberId !== family.id && share.purpose === 'come_find_me') ?? [];
  const lockedCapsules = timeCapsules?.filter((capsule) => capsule.isLocked) ?? [];
  const nextCapsule = lockedCapsules[0];
  const pendingTasks = plans?.tasks.filter((task) => !task.completedAt) ?? [];
  const myOutstandingTasks = (myTasks ?? [])
    .filter((task) => task.isAssignedToMe && !task.myCompletedAt)
    .sort((a, b) => {
      if (!a.dueAt && !b.dueAt) return 0;
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });
  const nextTask = myOutstandingTasks[0];
  const upcomingPlans = plans ? [
    ...plans.events.map((event) => ({ id: `event-${event.id}`, title: event.title, at: event.startsAt, kind: 'Event' })),
    ...pendingTasks.map((task) => ({ id: `task-${task.id}`, title: task.title, at: task.dueAt, kind: 'Task' }))
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()).slice(0, 3) : [];

  return (
    <Screen scroll maxWidth={1080} contentStyle={styles.content}>
      <View style={[styles.welcome, isWideHero && styles.welcomeWide]}>
        <View style={styles.welcomeCopy}>
          <View style={styles.welcomeTopRow}>
            <AppText variant="eyebrow" tone="primary">{greetingForHour(new Date().getHours())}, {firstName}</AppText>
            <Pressable accessibilityRole="button" onPress={() => router.push('/(family)/notifications' as never)} style={styles.notificationBell}>
              <AppText variant="heading">🔔</AppText>
              {unreadNotifications > 0 ? (
                <View style={[styles.notificationBadge, { backgroundColor: theme.danger }]}>
                  <AppText variant="caption" style={styles.notificationBadgeText}>{unreadNotifications > 9 ? '9+' : unreadNotifications}</AppText>
                </View>
              ) : null}
            </Pressable>
          </View>
          <AppText variant="display" style={styles.title}>{family.familyName}</AppText>
          <AppText variant="body" tone="mutedText" style={styles.subtitle}>Your family’s home, all in one warm place.</AppText>
        </View>
        <View style={[styles.welcomeArt, !isWideHero && styles.welcomeArtStacked, isWideHero && styles.welcomeArtWide, { backgroundColor: theme.accentSoft }]}>
          <View style={[styles.artOrb, { backgroundColor: theme.primarySoft }]} />
          <View style={[styles.artOrbSmall, { backgroundColor: theme.accent }]} />
          <Avatar name={family.familyName} size={68} />
        </View>
      </View>

      {activeEmergencies && activeEmergencies.length > 0 ? (
        <Card style={[styles.emergencyBanner, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}>
          <View style={styles.emergencyBannerCopy}>
            <AppText variant="label" tone="danger">Family Emergency</AppText>
            <AppText variant="caption" tone="mutedText">{activeEmergencies.length} active alert{activeEmergencies.length === 1 ? '' : 's'}</AppText>
          </View>
          <Button label="View →" variant="quiet" onPress={() => router.push('/(family)/emergency' as never)} />
        </Card>
      ) : null}

      <TodayBriefing briefing={briefing} error={briefingError} onRetry={() => void loadBriefing()} theme={theme} isCompact={isCompact} />

      <WeeklyRecapSection recap={weeklyRecap} error={weeklyRecapError} onRetry={() => void loadWeeklyRecap()} theme={theme} isCompact={isCompact} />

      <View style={[styles.overview, !isCompact && styles.overviewWide]}>
        <Card style={[styles.overviewCard, { backgroundColor: theme.primarySoft }]}>
          <AppText variant="caption" tone="mutedText">PEOPLE</AppText>
          <View style={styles.metricRow}>
            {memberCount !== null ? <AppText variant="title" tone="primary">{memberCount}</AppText> : memberCountFailed ? <AppText variant="label" tone="mutedText">Unavailable</AppText> : <ActivityIndicator color={theme.primary} />}
            <AppText variant="body" tone="mutedText">members</AppText>
          </View>
        </Card>
        <Card style={[styles.overviewCard, { backgroundColor: theme.secondarySoft }]}>
          <AppText variant="caption" tone="mutedText">UPCOMING</AppText>
          <AppText variant="heading" style={styles.overviewTitle}>{plans ? plans.events.length : plansFailed ? '—' : '…'} events</AppText>
          <AppText variant="caption" tone="mutedText">{plans?.events[0] ? `Next: ${plans.events[0].title}` : plansFailed ? 'Unavailable right now' : 'Nothing scheduled yet'}</AppText>
        </Card>
        <Pressable accessibilityRole="button" onPress={() => router.push('/(family)/tasks' as never)} style={styles.overviewPressable}>
          <Card style={[styles.overviewCard, { backgroundColor: theme.successSoft }]}>
            <AppText variant="caption" tone="mutedText">TOGETHER</AppText>
            <AppText variant="heading" style={styles.overviewTitle}>
              {myTasks ? (myOutstandingTasks.length === 0 ? 'All caught up' : `${myOutstandingTasks.length} task${myOutstandingTasks.length === 1 ? '' : 's'}`) : tasksFailed ? '—' : '…'}
            </AppText>
            <AppText variant="caption" tone="mutedText" numberOfLines={1}>
              {myTasks
                ? (nextTask ? `Next: ${nextTask.title}` : 'All caught up')
                : tasksFailed ? 'Unavailable right now' : 'Loading family tasks'}
            </AppText>
          </Card>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <View><AppText variant="heading">Make it yours</AppText><AppText variant="caption" tone="mutedText" style={styles.sectionSubtitle}>A few ways to get started</AppText></View>
      </View>
      <View style={styles.quickActions}>
        <Card style={styles.actionCard}>
          <View style={[styles.actionMark, { backgroundColor: theme.primarySoft }]}><AppText variant="heading" tone="primary">＋</AppText></View>
          <AppText variant="label" style={styles.actionTitle}>Invite someone</AppText>
          <AppText variant="caption" tone="mutedText">Bring your people in</AppText>
          {(family.role === 'owner' || family.role === 'guardian')
            ? <Button label="Invite member" onPress={() => router.push('/(family)/invite' as never)} style={styles.actionButton} />
            : <AppText variant="caption" tone="mutedText" style={styles.actionComing}>Ask a guardian to invite</AppText>}
        </Card>
        <PlanActionCard title="Add an event" detail="Plan family moments" mark="◷" color={theme.secondarySoft} textColor={theme.secondary} onPress={() => router.push('/(family)/plans' as never)} />
        <Card style={styles.actionCard}>
          <View style={[styles.actionMark, { backgroundColor: visibleFindMeShares.length > 0 ? theme.primarySoft : theme.accentSoft }]}>
            <AppText variant="heading" style={{ color: visibleFindMeShares.length > 0 ? theme.primary : theme.warning }}>◎</AppText>
          </View>
          <AppText variant="label" style={styles.actionTitle}>Location</AppText>
          <AppText variant="caption" tone="mutedText">
            {visibleFindMeShares.length > 0
              ? visibleFindMeShares.length === 1
                ? `${visibleFindMeShares[0]?.member.displayName ?? 'A family member'} is sharing their location`
                : `${visibleFindMeShares.length} family members are sharing`
              : amISharing
                ? 'You’re sharing your location'
                : locationFailed
                  ? 'Unavailable right now'
                  : 'Only when you choose'}
          </AppText>
          <Button label="Open Location" variant="quiet" onPress={() => router.push('/(family)/location' as never)} style={styles.actionButton} />
        </Card>
        <PlanActionCard title="Add a task" detail="Keep home in sync" mark="✓" color={theme.successSoft} textColor={theme.success} onPress={() => router.push('/(family)/plans' as never)} />
        <Card style={styles.actionCard}>
          <View style={[styles.actionMark, { backgroundColor: theme.dangerSoft }]}><AppText variant="heading" tone="danger">⚠</AppText></View>
          <AppText variant="label" style={styles.actionTitle}>Emergency</AppText>
          <AppText variant="caption" tone="mutedText">Alert your family if something urgent comes up</AppText>
          <Button label="Open Emergency Hub" variant="quiet" onPress={() => router.push('/(family)/emergency' as never)} style={styles.actionButton} />
        </Card>
        <Card style={styles.actionCard}>
          <View style={[styles.actionMark, { backgroundColor: theme.primarySoft }]}><AppText variant="heading" tone="primary">✳</AppText></View>
          <AppText variant="label" style={styles.actionTitle}>Memories</AppText>
          <AppText variant="caption" tone="mutedText">{memories ? (memories.length ? `${memories.length} moments saved` : 'Start your first memory') : memoriesFailed ? 'Unavailable right now' : 'Loading memories'}</AppText>
          <Button label="Open Memories" variant="quiet" onPress={() => router.push('/(family)/memories' as never)} style={styles.actionButton} />
        </Card>
        <Card style={styles.actionCard}>
          <View style={[styles.actionMark, { backgroundColor: theme.secondarySoft }]}><AppText variant="heading" tone="secondary">⌛</AppText></View>
          <AppText variant="label" style={styles.actionTitle}>Time Capsules</AppText>
          <AppText variant="caption" tone="mutedText">
            {timeCapsules
              ? nextCapsule
                ? `${lockedCapsules.length} sealed · Next ${new Date(nextCapsule.unlockAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                : timeCapsules.length
                  ? 'All capsules are ready to open'
                  : 'Seal something for the future'
              : timeCapsulesFailed
                ? 'Unavailable right now'
                : 'Loading capsules'}
          </AppText>
          <Button label="Open Time Capsules" variant="quiet" onPress={() => router.push('/(family)/capsules' as never)} style={styles.actionButton} />
        </Card>
      </View>

      <Card style={[styles.brainCard, { backgroundColor: theme.backgroundTint }]}>
        <View style={styles.brainTop}><View style={[styles.brainMark, { backgroundColor: theme.accentSoft }]}><AppText variant="heading" style={{ color: theme.warning }}>✦</AppText></View><AppText variant="eyebrow" tone="secondary">A thought partner for your family</AppText></View>
        <AppText variant="title" style={styles.brainTitle}>What can I help your family with today?</AppText>
        <AppText variant="body" tone="mutedText">Ask about your plans, tasks, and recent memories, or get ideas for a family activity.</AppText>
        <Button label="Ask Family Brain" variant="secondary" onPress={() => router.push('/(family)/brain' as never)} style={styles.brainAction} />
      </Card>

      <Card style={[styles.menuCard, { backgroundColor: theme.successSoft }]}>
        <AppText variant="eyebrow" tone="success">Safety check-in</AppText>
        <AppText variant="body" tone="mutedText" style={styles.checkInSubtitle}>
          {myLatestCheckIn
            ? `Last: ${myLatestCheckIn.status === 'safe' ? 'Safe' : 'Arrived'} · ${new Date(myLatestCheckIn.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
            : checkInsFailed
              ? 'Unavailable right now'
              : 'Let your family know you’re okay'}
        </AppText>
        <View style={styles.checkInActions}>
          <Button label="✓ I'm safe" variant="secondary" loading={checkInSending === 'safe'} onPress={() => void sendQuickCheckIn('safe')} style={styles.checkInButton} />
          <Button label="🏠 I've arrived" variant="secondary" loading={checkInSending === 'arrived'} onPress={() => void sendQuickCheckIn('arrived')} style={styles.checkInButton} />
        </View>
        <Button label="Open Check-ins" variant="quiet" onPress={() => router.push('/(family)/check-ins' as never)} style={styles.actionButton} />
      </Card>

      <View style={[styles.lowerGrid, isWideHero && styles.lowerGridWide]}>
        <Card style={styles.lowerCard}>
          <AppText variant="heading">Upcoming</AppText>
          {upcomingPlans.length ? <View style={styles.upcomingList}>{upcomingPlans.map((item) => <View key={item.id} style={[styles.upcomingRow, { borderColor: theme.border }]}><View style={[styles.upcomingDot, { backgroundColor: item.kind === 'Event' ? theme.secondary : theme.success }]} /><View style={styles.upcomingCopy}><AppText variant="label" numberOfLines={1}>{item.title}</AppText><AppText variant="caption" tone="mutedText">{item.kind} · {new Date(item.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</AppText></View></View>)}</View> : <View style={styles.emptyState}><AppText variant="title" tone="mutedText">◷</AppText><AppText variant="label" style={styles.emptyTitle}>Room for plans</AppText><AppText variant="caption" tone="mutedText" align="center">Family events and tasks will appear here.</AppText></View>}
        </Card>
        <Card style={styles.lowerCard}>
          <AppText variant="heading">Recent activity</AppText>
          <View style={styles.emptyState}><AppText variant="title" tone="mutedText">✳</AppText><AppText variant="label" style={styles.emptyTitle}>A fresh start</AppText><AppText variant="caption" tone="mutedText" align="center">Family updates will appear here as you use your space.</AppText></View>
        </Card>
      </View>
    </Screen>
  );
}

function PlanActionCard({ title, detail, mark, color, textColor, onPress }: { title: string; detail: string; mark: string; color: string; textColor: string; onPress: () => void }) {
  return <Card style={styles.actionCard}><View style={[styles.actionMark, { backgroundColor: color }]}><AppText variant="heading" style={{ color: textColor }}>{mark}</AppText></View><AppText variant="label" style={styles.actionTitle}>{title}</AppText><AppText variant="caption" tone="mutedText">{detail}</AppText><Button label="Open plans" variant="quiet" onPress={onPress} style={styles.actionButton} /></Card>;
}

function formatEventTime(event: DailyBriefing['events'][number]) {
  if (event.allDay) return 'All day';
  return new Date(event.startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatTaskStatus(task: DailyBriefing['tasks'][number]) {
  if (task.status === 'overdue') return 'Overdue';
  if (task.status === 'due_today') return 'Due today';
  return task.dueAt ? `Due ${new Date(task.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'No due date';
}

function formatPollCloses(poll: DailyBriefing['polls'][number]) {
  if (!poll.closesAt) return 'Open';
  return `Closes ${new Date(poll.closesAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

// The Home screen's "what matters today" strip — one card per section, each reusing
// exactly what the server's daily-briefing endpoint already decided this member can see.
// Sections with nothing relevant are simply left out, per F20 scope (no invented content,
// no empty boxes for every feature).
function TodayBriefing({ briefing, error, onRetry, theme, isCompact }: {
  briefing: DailyBriefing | null;
  error: string | null;
  onRetry: () => void;
  theme: Theme;
  isCompact: boolean;
}) {
  if (error) {
    return (
      <Card style={[styles.briefingMessageCard, { backgroundColor: theme.dangerSoft }]}>
        <AppText variant="body" tone="danger">{error}</AppText>
        <Button label="Try again" variant="quiet" onPress={onRetry} />
      </Card>
    );
  }

  if (!briefing) {
    return (
      <View style={styles.briefingLoading}>
        <ActivityIndicator color={theme.primary} />
        <AppText variant="caption" tone="mutedText" style={styles.briefingLoadingText}>Loading today’s briefing…</AppText>
      </View>
    );
  }

  const hasAnything = briefing.events.length > 0 || briefing.tasks.length > 0 || briefing.menus.length > 0
    || briefing.shopping.length > 0 || briefing.polls.length > 0 || briefing.capsules.length > 0;

  return (
    <View style={styles.briefingSection}>
      <View style={styles.sectionHeader}>
        <View><AppText variant="heading">Today</AppText><AppText variant="caption" tone="mutedText" style={styles.sectionSubtitle}>Here’s what’s happening today.</AppText></View>
      </View>

      {!hasAnything ? (
        <Card style={styles.briefingEmptyCard}>
          <AppText variant="label">Nothing urgent today</AppText>
          <AppText variant="caption" tone="mutedText" align="center">Enjoy a quiet one — check back tomorrow.</AppText>
        </Card>
      ) : (
        <View style={[styles.briefingGrid, !isCompact && styles.briefingGridWide]}>
          {briefing.events.length > 0 ? (
            <Card style={styles.briefingCard}>
              <View style={styles.briefingCardHeader}><AppText variant="label">Calendar</AppText><Button label="View all" variant="quiet" onPress={() => router.push(briefing.events[0].route as never)} /></View>
              <View style={styles.briefingList}>
                {briefing.events.map((event) => (
                  <Pressable key={event.id} accessibilityRole="button" onPress={() => router.push(event.route as never)} style={styles.briefingRow}>
                    <AppText variant="body" numberOfLines={1} style={styles.briefingRowTitle}>{event.title}</AppText>
                    <AppText variant="caption" tone="mutedText">{formatEventTime(event)}</AppText>
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}

          {briefing.tasks.length > 0 ? (
            <Card style={styles.briefingCard}>
              <View style={styles.briefingCardHeader}><AppText variant="label">My Tasks</AppText><Button label="View all" variant="quiet" onPress={() => router.push('/(family)/tasks' as never)} /></View>
              <View style={styles.briefingList}>
                {briefing.tasks.map((task) => (
                  <Pressable key={task.id} accessibilityRole="button" onPress={() => router.push(task.route as never)} style={styles.briefingRow}>
                    <AppText variant="body" numberOfLines={1} style={styles.briefingRowTitle}>{task.title}</AppText>
                    <AppText variant="caption" tone={task.status === 'overdue' ? 'danger' : 'mutedText'}>{formatTaskStatus(task)}</AppText>
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}

          {briefing.menus.length > 0 ? (
            <Card style={styles.briefingCard}>
              <View style={styles.briefingCardHeader}><AppText variant="label">Today’s Menu</AppText><Button label="View all" variant="quiet" onPress={() => router.push('/(family)/menu' as never)} /></View>
              <View style={styles.briefingList}>
                {briefing.menus.map((menu) => (
                  <Pressable key={menu.id} accessibilityRole="button" onPress={() => router.push(menu.route as never)} style={styles.briefingMenuBlock}>
                    <AppText variant="body" numberOfLines={1}>{menu.name}</AppText>
                    {menu.meals.map((meal) => (
                      <View key={meal.mealType} style={styles.briefingRow}>
                        <AppText variant="caption" tone="mutedText" style={styles.briefingMealType}>{meal.mealType[0].toUpperCase()}{meal.mealType.slice(1)}</AppText>
                        <AppText variant="caption" numberOfLines={1}>{meal.mealName}</AppText>
                      </View>
                    ))}
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}

          {briefing.shopping.length > 0 ? (
            <Card style={styles.briefingCard}>
              <View style={styles.briefingCardHeader}><AppText variant="label">Shopping today</AppText><Button label="View all" variant="quiet" onPress={() => router.push('/(family)/shopping' as never)} /></View>
              <View style={styles.briefingList}>
                {briefing.shopping.map((list) => (
                  <Pressable key={list.id} accessibilityRole="button" onPress={() => router.push(list.route as never)} style={styles.briefingRow}>
                    <AppText variant="body" numberOfLines={1} style={styles.briefingRowTitle}>{list.name}</AppText>
                    <AppText variant="caption" tone="mutedText">{list.remainingItems} of {list.totalItems} left</AppText>
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}

          {briefing.polls.length > 0 ? (
            <Card style={styles.briefingCard}>
              <View style={styles.briefingCardHeader}><AppText variant="label">Needs your vote</AppText><Button label="View all" variant="quiet" onPress={() => router.push('/(family)/polls' as never)} /></View>
              <View style={styles.briefingList}>
                {briefing.polls.map((poll) => (
                  <Pressable key={poll.id} accessibilityRole="button" onPress={() => router.push(poll.route as never)} style={styles.briefingRow}>
                    <AppText variant="body" numberOfLines={1} style={styles.briefingRowTitle}>{poll.question}</AppText>
                    <AppText variant="caption" tone="mutedText">{formatPollCloses(poll)}</AppText>
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}

          {briefing.capsules.length > 0 ? (
            <Card style={styles.briefingCard}>
              <View style={styles.briefingCardHeader}><AppText variant="label">Time Capsules</AppText><Button label="View all" variant="quiet" onPress={() => router.push('/(family)/capsules' as never)} /></View>
              <View style={styles.briefingList}>
                {briefing.capsules.map((capsule) => (
                  <Pressable key={capsule.id} accessibilityRole="button" onPress={() => router.push(capsule.route as never)} style={styles.briefingRow}>
                    <AppText variant="body" numberOfLines={1} style={styles.briefingRowTitle}>{capsule.title}</AppText>
                    <AppText variant="caption" tone="mutedText">Ready to open</AppText>
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}
        </View>
      )}
    </View>
  );
}

function formatUpcomingWhen(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// "Your family's week": a compact this-week summary (counts only — no invented activity)
// plus a short forward-looking "Coming up" list across the next 7 days. Deliberately
// smaller and less structured than TodayBriefing above — this is broader context, not a
// second snapshot of today, and it never duplicates F20's sections item-for-item.
function WeeklyRecapSection({ recap, error, onRetry, theme, isCompact }: {
  recap: WeeklyRecap | null;
  error: string | null;
  onRetry: () => void;
  theme: Theme;
  isCompact: boolean;
}) {
  if (error) {
    return (
      <Card style={[styles.briefingMessageCard, { backgroundColor: theme.dangerSoft }]}>
        <AppText variant="body" tone="danger">{error}</AppText>
        <Button label="Try again" variant="quiet" onPress={onRetry} />
      </Card>
    );
  }

  if (!recap) {
    return (
      <View style={styles.briefingLoading}>
        <ActivityIndicator color={theme.primary} />
        <AppText variant="caption" tone="mutedText" style={styles.briefingLoadingText}>Loading your family’s week…</AppText>
      </View>
    );
  }

  const { highlights, upcoming } = recap;
  const hasHighlights = highlights.tasksCompleted > 0 || highlights.events > 0 || highlights.pollsClosed > 0 || highlights.memoriesAdded > 0;
  const upcomingItems: { id: string; title: string; when: string; route: string }[] = [
    ...upcoming.events.map((event) => ({ id: `event-${event.id}`, title: event.title, when: event.allDay ? 'All day' : formatUpcomingWhen(event.startsAt), route: event.route })),
    ...upcoming.tasks.map((task) => ({ id: `task-${task.id}`, title: task.title, when: task.dueAt ? formatUpcomingWhen(task.dueAt) : 'No due date', route: task.route })),
    ...upcoming.shopping.map((list) => ({ id: `shopping-${list.id}`, title: list.name, when: list.shoppingDate ? formatUpcomingWhen(list.shoppingDate) : '', route: list.route })),
    ...upcoming.polls.map((poll) => ({ id: `poll-${poll.id}`, title: poll.question, when: poll.closesAt ? `Closes ${formatUpcomingWhen(poll.closesAt)}` : '', route: poll.route })),
    ...upcoming.capsules.map((capsule) => ({ id: `capsule-${capsule.id}`, title: capsule.title, when: formatUpcomingWhen(capsule.unlockAt), route: capsule.route })),
    ...upcoming.menus.map((menu) => ({ id: `menu-${menu.id}`, title: `${menu.name} — active`, when: '', route: menu.route }))
  ];
  const hasUpcoming = upcomingItems.length > 0;

  if (!hasHighlights && !hasUpcoming) {
    return (
      <View style={styles.briefingSection}>
        <View style={styles.sectionHeader}>
          <View><AppText variant="heading">Your family’s week</AppText></View>
        </View>
        <Card style={styles.briefingEmptyCard}>
          <AppText variant="caption" tone="mutedText" align="center">A quiet week so far. Your upcoming family plans will appear here.</AppText>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.briefingSection}>
      <View style={styles.sectionHeader}>
        <View><AppText variant="heading">Your family’s week</AppText></View>
      </View>

      {hasHighlights ? (
        <View style={[styles.recapHighlights, !isCompact && styles.recapHighlightsWide]}>
          {highlights.tasksCompleted > 0 ? <RecapStat label={`${highlights.tasksCompleted} task${highlights.tasksCompleted === 1 ? '' : 's'} completed`} theme={theme} /> : null}
          {highlights.events > 0 ? <RecapStat label={`${highlights.events} event${highlights.events === 1 ? '' : 's'}`} theme={theme} /> : null}
          {highlights.pollsClosed > 0 ? <RecapStat label={`${highlights.pollsClosed} poll${highlights.pollsClosed === 1 ? '' : 's'} decided`} theme={theme} /> : null}
          {highlights.memoriesAdded > 0 ? <RecapStat label={`${highlights.memoriesAdded} memor${highlights.memoriesAdded === 1 ? 'y' : 'ies'} added`} theme={theme} /> : null}
        </View>
      ) : null}

      {hasUpcoming ? (
        <Card style={styles.recapUpcomingCard}>
          <AppText variant="label">Coming up</AppText>
          <View style={styles.briefingList}>
            {upcomingItems.map((item) => (
              <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push(item.route as never)} style={styles.briefingRow}>
                <AppText variant="body" numberOfLines={1} style={styles.briefingRowTitle}>{item.title}</AppText>
                {item.when ? <AppText variant="caption" tone="mutedText">{item.when}</AppText> : null}
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

function RecapStat({ label, theme }: { label: string; theme: Theme }) {
  return (
    <View style={[styles.recapStat, { backgroundColor: theme.primarySoft }]}>
      <AppText variant="label" tone="primary">{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.lg },
  welcome: { alignItems: 'center', gap: spacing.lg },
  welcomeWide: { alignItems: 'stretch', flexDirection: 'row' },
  welcomeCopy: { flex: 1, minWidth: 0, paddingVertical: spacing.lg },
  welcomeTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  notificationBell: { padding: spacing.xs, position: 'relative' },
  notificationBadge: { alignItems: 'center', borderRadius: 9, height: 18, justifyContent: 'center', minWidth: 18, paddingHorizontal: 3, position: 'absolute', right: 0, top: 0 },
  notificationBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  title: { marginTop: spacing.sm },
  subtitle: { marginTop: spacing.sm },
  welcomeArt: { alignItems: 'center', borderRadius: radius.xl, height: 176, justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  welcomeArtStacked: { width: '100%' },
  welcomeArtWide: { flex: 0.78, minWidth: 280 },
  artOrb: { borderRadius: 100, height: 160, left: -35, position: 'absolute', top: 85, width: 160 },
  artOrbSmall: { borderRadius: 40, height: 54, position: 'absolute', right: 32, top: 26, width: 54 },
  emergencyBanner: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.lg, padding: spacing.lg },
  emergencyBannerCopy: { flex: 1, minWidth: 0 },
  overview: { gap: spacing.md, marginTop: spacing.lg },
  overviewPressable: { flex: 1 },
  overviewWide: { flexDirection: 'row' },
  overviewCard: { flex: 1, minHeight: 128, justifyContent: 'center' },
  metricRow: { alignItems: 'baseline', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  overviewTitle: { marginVertical: spacing.xs },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xxl },
  sectionSubtitle: { marginTop: spacing.xs },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  actionCard: { flexBasis: '48%', flexGrow: 1, minWidth: 155, padding: spacing.md },
  actionMark: { alignItems: 'center', borderRadius: radius.md, height: 42, justifyContent: 'center', width: 42 },
  actionTitle: { marginTop: spacing.md },
  actionButton: { alignSelf: 'flex-start', marginTop: spacing.md },
  actionComing: { marginTop: spacing.md },
  brainCard: { marginTop: spacing.lg, padding: spacing.xl },
  brainTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  brainMark: { alignItems: 'center', borderRadius: radius.md, height: 42, justifyContent: 'center', width: 42 },
  brainTitle: { marginBottom: spacing.sm, marginTop: spacing.lg, maxWidth: 680 },
  brainAction: { alignSelf: 'flex-start', marginTop: spacing.lg },
  menuCard: { marginTop: spacing.lg, padding: spacing.xl },
  checkInSubtitle: { marginTop: spacing.sm },
  checkInActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  checkInButton: { flexGrow: 1 },
  briefingSection: { marginTop: spacing.xl },
  briefingMessageCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.lg, padding: spacing.lg },
  briefingLoading: { alignItems: 'center', marginTop: spacing.xl, paddingVertical: spacing.lg },
  briefingLoadingText: { marginTop: spacing.sm },
  briefingEmptyCard: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, padding: spacing.xl },
  briefingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  briefingGridWide: { flexWrap: 'wrap' },
  briefingCard: { flexBasis: '31%', flexGrow: 1, minWidth: 220, padding: spacing.md },
  briefingCardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  briefingList: { gap: spacing.sm, marginTop: spacing.sm },
  briefingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  briefingRowTitle: { flex: 1, minWidth: 0 },
  briefingMenuBlock: { gap: spacing.xs },
  briefingMealType: { width: 64 },
  recapHighlights: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  recapHighlightsWide: { flexWrap: 'wrap' },
  recapStat: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  recapUpcomingCard: { marginTop: spacing.md, padding: spacing.md },
  lowerGrid: { gap: spacing.md, marginTop: spacing.lg },
  lowerGridWide: { flexDirection: 'row' },
  lowerCard: { flex: 1, minHeight: 230 },
  upcomingList: { marginTop: spacing.md },
  upcomingRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 58 },
  upcomingDot: { borderRadius: 5, height: 10, width: 10 },
  upcomingCopy: { flex: 1, minWidth: 0 },
  emptyState: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.lg },
  emptyTitle: { marginBottom: spacing.xs, marginTop: spacing.sm }
});
