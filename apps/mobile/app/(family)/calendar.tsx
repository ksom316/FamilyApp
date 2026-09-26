import { useAppTheme } from '../../lib/app-theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { radius, spacing } from '@familyapp/config';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { CalendarEventEditor } from '../../components/CalendarEventEditor';
import { Card } from '../../components/Card';
import { MemberAvatar } from '../../components/MemberAvatar';
import { Screen } from '../../components/Screen';
import {
  CalendarApiError,
  deleteCalendarEvent,
  formatCalendarAudience,
  getCalendarEvents,
  type CalendarEvent
} from '../../lib/calendar';
import { CalendarTimelineApiError, getCalendarTimeline, type CalendarTimelineItem, type CalendarTimelineSource } from '../../lib/calendar-timeline';
import { useCurrentFamily } from '../../lib/family-context';
import { getFamilyMembers, type FamilyMember } from '../../lib/families';
import { getFamilyHousehold, getFamilyHouseholds, type Household } from '../../lib/households';

const POLL_INTERVAL_MS = 30_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SOURCE_ICON: Record<CalendarTimelineSource, string> = { calendar: '📅', task: '✓', shopping: '🛒', poll: '🗳', capsule: '🔓' };
const SOURCE_LABEL: Record<CalendarTimelineSource, string> = { calendar: 'Event', task: 'Task', shopping: 'Shopping', poll: 'Poll', capsule: 'Capsule' };

function pad(value: number) { return String(value).padStart(2, '0'); }
function localDateKey(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function utcDateKey(date: Date) { return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`; }
function addDays(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function monthStart(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1); }

function gridDates(month: Date) {
  const first = monthStart(month);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function eventDayKeys(event: CalendarEvent) {
  if (event.allDay) {
    const start = new Date(event.startsAt);
    const end = new Date(event.endsAt ?? event.startsAt);
    const keys: string[] = [];
    for (let date = start; date.getTime() <= end.getTime() && keys.length < 367; date = new Date(date.getTime() + 86_400_000)) {
      keys.push(utcDateKey(date));
    }
    return keys;
  }
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt ?? event.startsAt);
  const keys: string[] = [];
  for (let date = new Date(start.getFullYear(), start.getMonth(), start.getDate()); date.getTime() <= end.getTime() && keys.length < 367; date = addDays(date, 1)) {
    keys.push(localDateKey(date));
  }
  return keys;
}

function externalItemDayKey(item: CalendarTimelineItem) {
  // Matches the multi-day/all-day handling above: an all-day item's startsAt is a UTC-date
  // stamp (shoppingDate), so it's bucketed by UTC date the same way all-day calendar events
  // are; a timed item (task due time, poll closing time, capsule unlock time) is bucketed by
  // local date, the same way timed calendar events are.
  return item.allDay ? utcDateKey(new Date(item.startsAt)) : localDateKey(new Date(item.startsAt));
}

function formatExternalItemWhen(item: CalendarTimelineItem) {
  if (item.allDay) return new Date(item.startsAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return new Date(item.startsAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatEventWhen(event: CalendarEvent) {
  if (event.allDay) {
    const start = new Date(event.startsAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    if (!event.endsAt || utcDateKey(new Date(event.endsAt)) === utcDateKey(new Date(event.startsAt))) return `${start} · All day`;
    const end = new Date(event.endsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return `${start} – ${end} · All day`;
  }
  const start = new Date(event.startsAt);
  const startText = start.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  if (!event.endsAt) return startText;
  const end = new Date(event.endsAt);
  return `${startText} – ${end.toLocaleString(undefined, start.toDateString() === end.toDateString() ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

export default function CalendarScreen() {
  const family = useCurrentFamily();
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const { colors: theme } = useAppTheme();
  const today = new Date();
  const [month, setMonth] = useState(monthStart(today));
  const [selectedDay, setSelectedDay] = useState(localDateKey(today));
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [myHouseholds, setMyHouseholds] = useState<Household[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [externalItems, setExternalItems] = useState<CalendarTimelineItem[] | null>(null);
  const [externalError, setExternalError] = useState<string | null>(null);
  const focusedRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const externalInFlightRef = useRef(false);

  const days = useMemo(() => gridDates(month), [month]);
  const range = useMemo(() => ({
    from: addDays(days[0] as Date, -1).toISOString(),
    to: addDays(days[days.length - 1] as Date, 91).toISOString()
  }), [days]);
  // The unified timeline (tasks/shopping/polls/capsules) is scoped to just the visible
  // month grid, not the extended lookahead used for manual events' own "Upcoming" list
  // below — that keeps every request comfortably under the endpoint's 120-day cap and
  // keeps each day cell's extra items compact, per F22's density guidance.
  const timelineRange = useMemo(() => ({
    from: (days[0] as Date).toISOString(),
    to: addDays(days[days.length - 1] as Date, 1).toISOString()
  }), [days]);

  const load = useCallback(async (showLoading = false) => {
    if (!focusedRef.current || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    if (showLoading) setEvents(null);
    try {
      setEvents(await getCalendarEvents(family.familyId, range.from, range.to));
      setError(null);
    } catch (caught) {
      if (focusedRef.current) setError(caught instanceof CalendarApiError ? caught.message : 'We could not load the family calendar.');
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [family.familyId, range.from, range.to]);

  const loadExternal = useCallback(async () => {
    if (!focusedRef.current || externalInFlightRef.current) return;
    externalInFlightRef.current = true;
    try {
      const result = await getCalendarTimeline(family.familyId, timelineRange.from, timelineRange.to);
      if (focusedRef.current) {
        setExternalItems(result.items.filter((item) => item.source !== 'calendar'));
        setExternalError(null);
      }
    } catch (caught) {
      if (focusedRef.current) setExternalError(caught instanceof CalendarTimelineApiError ? caught.message : 'We could not load other family items.');
    } finally {
      externalInFlightRef.current = false;
    }
  }, [family.familyId, timelineRange.from, timelineRange.to]);

  useEffect(() => {
    void getFamilyMembers(family.familyId).then(setMembers).catch(() => {});
    void (async () => {
      try {
        const all = await getFamilyHouseholds(family.familyId);
        const details = await Promise.all(all.map((household) => getFamilyHousehold(family.familyId, household.id).catch(() => null)));
        setMyHouseholds(details.filter((detail): detail is NonNullable<typeof detail> => Boolean(detail?.members.some((member) => member.memberId === family.id))).map((detail) => ({ ...detail.household, memberCount: detail.members.length })));
      } catch { setMyHouseholds([]); }
    })();
  }, [family.familyId, family.id]);

  useEffect(() => { setEvents(null); }, [range.from, range.to]);
  useEffect(() => { setExternalItems(null); }, [timelineRange.from, timelineRange.to]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    void load(true);
    void loadExternal();
    const interval = setInterval(() => { void load(false); void loadExternal(); }, POLL_INTERVAL_MS);
    return () => { focusedRef.current = false; clearInterval(interval); };
  }, [load, loadExternal]));

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events ?? []) {
      for (const key of eventDayKeys(event)) {
        const list = map.get(key) ?? [];
        list.push(event);
        map.set(key, list);
      }
    }
    return map;
  }, [events]);
  const selectedEvents = eventsByDay.get(selectedDay) ?? [];
  const upcoming = (events ?? []).filter((event) => new Date(event.endsAt ?? event.startsAt).getTime() >= Date.now()).slice(0, 6);

  const externalByDay = useMemo(() => {
    const map = new Map<string, CalendarTimelineItem[]>();
    for (const item of externalItems ?? []) {
      const key = externalItemDayKey(item);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [externalItems]);
  const selectedExternalItems = externalByDay.get(selectedDay) ?? [];

  function moveMonth(offset: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelectedDay(localDateKey(next));
    setOpenEvent(null);
    setEditing(false);
  }

  function confirmDelete() {
    if (!openEvent || deleting) return;
    const remove = async () => {
      setDeleting(true);
      setError(null);
      try {
        await deleteCalendarEvent(family.familyId, openEvent.id);
        setOpenEvent(null);
        await load(false);
      } catch (caught) {
        setError(caught instanceof CalendarApiError ? caught.message : 'The event could not be deleted.');
      } finally { setDeleting(false); }
    };
    if (Platform.OS === 'web') {
      const confirm = (globalThis as typeof globalThis & { confirm?: (message: string) => boolean }).confirm;
      if (confirm?.('Delete this calendar event? This cannot be undone.')) void remove();
    } else Alert.alert('Delete event?', 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void remove() }]);
  }

  const saved = async (event: CalendarEvent) => {
    setCreating(false);
    setEditing(false);
    setOpenEvent(event);
    setSelectedDay(eventDayKeys(event)[0] ?? selectedDay);
    await load(false);
  };

  return (
    <Screen scroll maxWidth={1180} contentStyle={styles.content}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}><AppText variant="eyebrow" tone="primary">Shared family schedule</AppText><AppText variant="display" style={styles.title}>Calendar</AppText><AppText variant="body" tone="mutedText" style={styles.subtitle}>Events are shown only to the family members they are meant for.</AppText></View>
        <Button label="New event" onPress={() => { setCreating(true); setEditing(false); setOpenEvent(null); }} />
      </View>

      {creating ? <CalendarEventEditor familyId={family.familyId} households={myHouseholds} members={members} onCancel={() => setCreating(false)} onSaved={saved} /> : null}
      {editing && openEvent ? <CalendarEventEditor familyId={family.familyId} event={openEvent} households={myHouseholds} members={members} onCancel={() => setEditing(false)} onSaved={saved} /> : null}

      {error ? <Card style={[styles.errorCard, { backgroundColor: theme.dangerSoft }]}><AppText variant="body" tone="danger" style={styles.errorText}>{error}</AppText><Button label="Try again" variant="quiet" onPress={() => void load(events === null)} /></Card> : null}
      {externalError ? <AppText variant="caption" tone="mutedText" style={styles.externalErrorNote}>Tasks/shopping/polls/capsules couldn’t be loaded on the calendar right now — events above are unaffected.</AppText> : null}

      <View style={[styles.mainGrid, isWide && styles.mainGridWide]}>
        <View style={styles.calendarColumn}>
          <View style={styles.monthHeader}>
            <Button label="Previous" variant="quiet" onPress={() => moveMonth(-1)} />
            <AppText variant="heading" align="center">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</AppText>
            <Button label="Next" variant="quiet" onPress={() => moveMonth(1)} />
          </View>
          <Card style={styles.monthCard}>
            <View style={styles.weekRow}>{WEEKDAYS.map((day) => <AppText key={day} variant="caption" tone="mutedText" align="center" style={styles.weekday}>{day}</AppText>)}</View>
            <View style={styles.daysGrid}>
              {days.map((date) => {
                const key = localDateKey(date);
                const dayEvents = eventsByDay.get(key) ?? [];
                const dayExternal = externalByDay.get(key) ?? [];
                const totalCount = dayEvents.length + dayExternal.length;
                const selected = key === selectedDay;
                const isToday = key === localDateKey(today);
                const inMonth = date.getMonth() === month.getMonth();
                const previewEvents = dayEvents.slice(0, 2);
                const previewExternal = dayExternal.slice(0, Math.max(0, 2 - previewEvents.length));
                const previewCount = previewEvents.length + previewExternal.length;
                return (
                  <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { setSelectedDay(key); setOpenEvent(null); setEditing(false); }} style={[styles.dayCell, isWide && styles.dayCellWide, { backgroundColor: selected ? theme.primarySoft : theme.surface, borderColor: isToday ? theme.primary : theme.border }, !inMonth && styles.outsideDay]}>
                    <AppText variant={isToday ? 'label' : 'caption'} tone={isToday ? 'primary' : inMonth ? 'text' : 'mutedText'}>{date.getDate()}</AppText>
                    {isWide ? previewEvents.map((event) => <AppText key={event.id} variant="caption" numberOfLines={1} style={styles.dayEvent}>{event.allDay ? 'All day · ' : ''}{event.title}</AppText>) : null}
                    {isWide ? previewExternal.map((item) => <AppText key={item.id} variant="caption" tone="mutedText" numberOfLines={1} style={styles.dayEvent}>{SOURCE_ICON[item.source]} {item.title}</AppText>) : null}
                    <View style={styles.dayDotRow}>
                      {dayEvents.length ? <View style={[styles.eventDot, { backgroundColor: theme.secondary }]} /> : null}
                      {dayExternal.length ? <View style={[styles.eventDot, { backgroundColor: theme.accent }]} /> : null}
                    </View>
                    {isWide && totalCount > previewCount ? <AppText variant="caption" tone="mutedText">+{totalCount - previewCount} more</AppText> : null}
                  </Pressable>
                );
              })}
            </View>
          </Card>
        </View>

        <View style={styles.dayColumn}>
          <AppText variant="heading">{new Date(`${selectedDay}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</AppText>
          {!events && !error ? <View style={styles.loading}><ActivityIndicator color={theme.primary} /><AppText variant="caption" tone="mutedText" style={styles.loadingText}>Loading events…</AppText></View> : null}
          {events && selectedEvents.length === 0 && selectedExternalItems.length === 0 ? <Card style={styles.empty}><AppText variant="body" tone="mutedText">Nothing scheduled for this day.</AppText></Card> : null}
          <View style={styles.eventList}>
            {selectedEvents.map((event) => <EventRow key={event.id} event={event} onPress={() => { setOpenEvent(event); setEditing(false); }} />)}
            {selectedExternalItems.map((item) => <ExternalItemRow key={item.id} item={item} onPress={() => router.push(item.route as never)} />)}
          </View>
        </View>
      </View>

      {openEvent && !editing ? (
        <Card elevated style={styles.detailCard}>
          <View style={styles.detailHeading}><View style={styles.detailCopy}><AppText variant="eyebrow" tone="secondary">Calendar event</AppText><AppText variant="title" style={styles.detailTitle}>{openEvent.title}</AppText></View><Button label="Close" variant="quiet" onPress={() => setOpenEvent(null)} /></View>
          <AppText variant="body" tone="mutedText" style={styles.detailLine}>{formatEventWhen(openEvent)}</AppText>
          {openEvent.location ? <AppText variant="body" style={styles.detailLine}>Location: {openEvent.location}</AppText> : null}
          {openEvent.description ? <AppText variant="body" style={styles.description}>{openEvent.description}</AppText> : null}
          <View style={[styles.audienceBadge, { backgroundColor: theme.secondarySoft }]}><AppText variant="caption" tone="secondary">{formatCalendarAudience(openEvent.audience)}</AppText></View>
          <View style={styles.creatorRow}><MemberAvatar member={openEvent.createdBy} familyId={family.familyId} size={32} /><AppText variant="caption" tone="mutedText">Created by {openEvent.createdBy.displayName}</AppText></View>
          {openEvent.createdByMemberId === family.id ? <View style={styles.detailActions}><Button label="Edit" variant="secondary" onPress={() => setEditing(true)} /><Button label="Delete" variant="quiet" loading={deleting} onPress={confirmDelete} /></View> : null}
        </Card>
      ) : null}

      <View style={styles.upcomingHeading}><AppText variant="heading">Upcoming</AppText><AppText variant="caption" tone="mutedText">Next visible events in the loaded range</AppText></View>
      {events && upcoming.length === 0 ? <Card style={styles.empty}><AppText variant="body" tone="mutedText">No upcoming events in this range.</AppText></Card> : null}
      <View style={styles.upcomingGrid}>{upcoming.map((event) => <EventRow key={event.id} event={event} onPress={() => { setOpenEvent(event); setEditing(false); setSelectedDay(eventDayKeys(event)[0] ?? selectedDay); }} />)}</View>
    </Screen>
  );
}

function EventRow({ event, onPress }: { event: CalendarEvent; onPress: () => void }) {
  const { colors: theme } = useAppTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      <Card style={styles.eventCard}>
        <View style={[styles.eventMark, { backgroundColor: theme.secondarySoft }]}><AppText variant="caption" tone="secondary">{event.allDay ? 'ALL DAY' : new Date(event.startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</AppText></View>
        <View style={styles.eventCopy}><AppText variant="label">{event.title}</AppText><AppText variant="caption" tone="mutedText" style={styles.eventMeta}>{formatEventWhen(event)}</AppText>{event.location ? <AppText variant="caption" tone="mutedText" style={styles.eventMeta}>{event.location}</AppText> : null}<AppText variant="caption" tone="secondary" style={styles.eventMeta}>{formatCalendarAudience(event.audience)}</AppText></View>
      </Card>
    </Pressable>
  );
}

// A deliberately lighter-weight row than EventRow: no audience badge, no creator avatar,
// and critically no Edit/Delete affordance — this represents another feature's own item,
// read-only here, so the only action is navigating to where it actually lives.
function ExternalItemRow({ item, onPress }: { item: CalendarTimelineItem; onPress: () => void }) {
  const { colors: theme } = useAppTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      <Card style={styles.eventCard}>
        <View style={[styles.eventMark, { backgroundColor: theme.accentSoft }]}><AppText variant="heading">{SOURCE_ICON[item.source]}</AppText></View>
        <View style={styles.eventCopy}>
          <AppText variant="label" numberOfLines={1}>{item.title}</AppText>
          <AppText variant="caption" tone="mutedText" style={styles.eventMeta}>{formatExternalItemWhen(item)}</AppText>
          <AppText variant="caption" style={[styles.eventMeta, { color: theme.warning }]}>{SOURCE_LABEL[item.source]} · tap to open</AppText>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xl },
  headingRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, justifyContent: 'space-between' },
  headingCopy: { flex: 1, minWidth: 260 },
  title: { marginTop: spacing.xs },
  subtitle: { marginTop: spacing.sm },
  errorCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  errorText: { flex: 1 },
  externalErrorNote: { marginTop: spacing.sm },
  mainGrid: { gap: spacing.xl, marginTop: spacing.xl },
  mainGridWide: { alignItems: 'flex-start', flexDirection: 'row' },
  calendarColumn: { flex: 2, minWidth: 0 },
  dayColumn: { flex: 1, minWidth: 280 },
  monthHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', marginBottom: spacing.sm },
  monthCard: { padding: spacing.sm },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, paddingVertical: spacing.sm },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { borderRadius: radius.sm, borderWidth: 1, flexBasis: '14.285%', minHeight: 54, padding: spacing.xs },
  dayCellWide: { minHeight: 104, padding: spacing.sm },
  outsideDay: { opacity: 0.48 },
  dayEvent: { marginTop: spacing.xs },
  dayDotRow: { flexDirection: 'row', gap: 3, marginTop: spacing.xs },
  eventDot: { borderRadius: 3, height: 6, width: 6 },
  loading: { alignItems: 'center', paddingVertical: spacing.xl },
  loadingText: { marginTop: spacing.sm },
  empty: { alignItems: 'center', marginTop: spacing.md },
  eventList: { gap: spacing.sm, marginTop: spacing.md },
  eventCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  eventMark: { alignItems: 'center', borderRadius: radius.md, justifyContent: 'center', minHeight: 48, minWidth: 72, paddingHorizontal: spacing.sm },
  eventCopy: { flex: 1, minWidth: 0 },
  eventMeta: { marginTop: spacing.xs },
  pressed: { opacity: 0.72 },
  detailCard: { marginTop: spacing.xl, padding: spacing.xl },
  detailHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  detailCopy: { flex: 1, minWidth: 0 },
  detailTitle: { marginTop: spacing.xs },
  detailLine: { marginTop: spacing.md },
  description: { marginTop: spacing.lg },
  audienceBadge: { alignSelf: 'flex-start', borderRadius: radius.pill, marginTop: spacing.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  creatorRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  detailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  upcomingHeading: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.xxl },
  upcomingGrid: { gap: spacing.sm, marginTop: spacing.md }
});
