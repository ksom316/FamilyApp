import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { useCurrentFamily } from '../../lib/family-context';
import { getFamilyMembers } from '../../lib/families';
import { getFamilyMemories, type FamilyMemory } from '../../lib/memories';
import { getFamilyPlans, type FamilyPlans } from '../../lib/plans';
import { useAuth } from '../../lib/use-auth';

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

  useEffect(() => {
    let active = true;
    setMemberCountFailed(false);
    setPlansFailed(false);
    setMemoriesFailed(false);
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
    return () => { active = false; };
  }, [family.familyId]);

  const name = session?.user.name?.trim() || 'there';
  const firstName = name.split(/\s+/)[0];
  const shellWidth = width >= 900 ? width - 264 : width;
  const horizontalPadding = width >= 900 ? spacing.xxl * 2 : spacing.lg * 2;
  const contentWidth = Math.min(1080, shellWidth - horizontalPadding);
  const isWideHero = contentWidth >= 720;
  const isCompact = contentWidth < 620;
  const pendingTasks = plans?.tasks.filter((task) => !task.completedAt) ?? [];
  const upcomingPlans = plans ? [
    ...plans.events.map((event) => ({ id: `event-${event.id}`, title: event.title, at: event.startsAt, kind: 'Event' })),
    ...pendingTasks.map((task) => ({ id: `task-${task.id}`, title: task.title, at: task.dueAt, kind: 'Task' }))
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()).slice(0, 3) : [];

  return (
    <Screen scroll maxWidth={1080} contentStyle={styles.content}>
      <View style={[styles.welcome, isWideHero && styles.welcomeWide]}>
        <View style={styles.welcomeCopy}>
          <AppText variant="eyebrow" tone="primary">{greetingForHour(new Date().getHours())}, {firstName}</AppText>
          <AppText variant="display" style={styles.title}>{family.familyName}</AppText>
          <AppText variant="body" tone="mutedText" style={styles.subtitle}>Your family’s home, all in one warm place.</AppText>
        </View>
        <View style={[styles.welcomeArt, !isWideHero && styles.welcomeArtStacked, isWideHero && styles.welcomeArtWide, { backgroundColor: theme.accentSoft }]}>
          <View style={[styles.artOrb, { backgroundColor: theme.primarySoft }]} />
          <View style={[styles.artOrbSmall, { backgroundColor: theme.accent }]} />
          <Avatar name={family.familyName} size={68} />
        </View>
      </View>

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
        <Card style={[styles.overviewCard, { backgroundColor: theme.successSoft }]}>
          <AppText variant="caption" tone="mutedText">TOGETHER</AppText>
          <AppText variant="heading" style={styles.overviewTitle}>{plans ? pendingTasks.length : plansFailed ? '—' : '…'} tasks</AppText>
          <AppText variant="caption" tone="mutedText">{plans ? (pendingTasks.length ? 'Still to do' : 'All caught up') : plansFailed ? 'Unavailable right now' : 'Loading family tasks'}</AppText>
        </Card>
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
        <ComingSoonCard title="Share location" detail="Only when you choose" mark="⌖" color={theme.accentSoft} textColor={theme.warning} />
        <PlanActionCard title="Add a task" detail="Keep home in sync" mark="✓" color={theme.successSoft} textColor={theme.success} onPress={() => router.push('/(family)/plans' as never)} />
        <Card style={styles.actionCard}>
          <View style={[styles.actionMark, { backgroundColor: theme.primarySoft }]}><AppText variant="heading" tone="primary">✳</AppText></View>
          <AppText variant="label" style={styles.actionTitle}>Memories</AppText>
          <AppText variant="caption" tone="mutedText">{memories ? (memories.length ? `${memories.length} moments saved` : 'Start your first memory') : memoriesFailed ? 'Unavailable right now' : 'Loading memories'}</AppText>
          <Button label="Open Memories" variant="quiet" onPress={() => router.push('/(family)/memories' as never)} style={styles.actionButton} />
        </Card>
      </View>

      <Card style={[styles.brainCard, { backgroundColor: theme.backgroundTint }]}>
        <View style={styles.brainTop}><View style={[styles.brainMark, { backgroundColor: theme.accentSoft }]}><AppText variant="heading" style={{ color: theme.warning }}>✦</AppText></View><AppText variant="eyebrow" tone="secondary">A thought partner for your family</AppText></View>
        <AppText variant="title" style={styles.brainTitle}>What can I help your family with today?</AppText>
        <AppText variant="body" tone="mutedText">Family Brain is finding its way here. A thoughtful helper for the everyday things that bring you together.</AppText>
        <AppText variant="caption" tone="secondary" style={styles.comingSoon}>Coming in a future update</AppText>
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

function ComingSoonCard({ title, detail, mark, color, textColor }: { title: string; detail: string; mark: string; color: string; textColor: string }) {
  return <Card style={styles.actionCard}><View style={[styles.actionMark, { backgroundColor: color }]}><AppText variant="heading" style={{ color: textColor }}>{mark}</AppText></View><AppText variant="label" style={styles.actionTitle}>{title}</AppText><AppText variant="caption" tone="mutedText">{detail}</AppText><AppText variant="caption" tone="mutedText" style={styles.actionComing}>Coming soon</AppText></Card>;
}

function PlanActionCard({ title, detail, mark, color, textColor, onPress }: { title: string; detail: string; mark: string; color: string; textColor: string; onPress: () => void }) {
  return <Card style={styles.actionCard}><View style={[styles.actionMark, { backgroundColor: color }]}><AppText variant="heading" style={{ color: textColor }}>{mark}</AppText></View><AppText variant="label" style={styles.actionTitle}>{title}</AppText><AppText variant="caption" tone="mutedText">{detail}</AppText><Button label="Open plans" variant="quiet" onPress={onPress} style={styles.actionButton} /></Card>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.lg },
  welcome: { alignItems: 'center', gap: spacing.lg },
  welcomeWide: { alignItems: 'stretch', flexDirection: 'row' },
  welcomeCopy: { flex: 1, minWidth: 0, paddingVertical: spacing.lg },
  title: { marginTop: spacing.sm },
  subtitle: { marginTop: spacing.sm },
  welcomeArt: { alignItems: 'center', borderRadius: radius.xl, height: 176, justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  welcomeArtStacked: { width: '100%' },
  welcomeArtWide: { flex: 0.78, minWidth: 280 },
  artOrb: { borderRadius: 100, height: 160, left: -35, position: 'absolute', top: 85, width: 160 },
  artOrbSmall: { borderRadius: 40, height: 54, position: 'absolute', right: 32, top: 26, width: 54 },
  overview: { gap: spacing.md, marginTop: spacing.lg },
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
  comingSoon: { marginTop: spacing.md },
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
