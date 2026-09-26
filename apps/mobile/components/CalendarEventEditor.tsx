import { useAppTheme } from '../lib/app-theme';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { radius, spacing } from '@familyapp/config';

import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';
import { DateTimeField } from './DateTimeField';
import { TextField } from './TextField';
import {
  CalendarApiError,
  createCalendarEvent,
  updateCalendarEvent,
  type CalendarEvent,
  type CalendarEventInput
} from '../lib/calendar';
import type { FamilyMember } from '../lib/families';
import type { Household } from '../lib/households';

type AudienceType = 'family' | 'household' | 'members';

function timedIso(date = new Date(Date.now() + 60 * 60 * 1000)) {
  date.setSeconds(0, 0);
  return date.toISOString();
}

function toAllDayValue(value: string) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString();
}

function toTimedValue(value: string) {
  const date = new Date(value);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 9).toISOString();
}

export function CalendarEventEditor({ familyId, event, households, members, onCancel, onSaved }: {
  familyId: string;
  event?: CalendarEvent;
  households: Household[];
  members: FamilyMember[];
  onCancel: () => void;
  onSaved: (event: CalendarEvent) => Promise<void> | void;
}) {
  const { colors: theme } = useAppTheme();
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [startsAt, setStartsAt] = useState(event?.startsAt ?? timedIso());
  const [endsAt, setEndsAt] = useState<string | null>(event?.endsAt ?? null);
  const [audienceType, setAudienceType] = useState<AudienceType>(event?.audience.type ?? 'family');
  const [householdId, setHouseholdId] = useState<string | null>(event?.audience.type === 'household' ? event.audience.household.id : null);
  const [memberIds, setMemberIds] = useState<string[]>(event?.audience.type === 'members' ? event.audience.members.map((member) => member.memberId) : []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  function toggleAllDay() {
    const next = !allDay;
    setAllDay(next);
    setStartsAt(next ? toAllDayValue(startsAt) : toTimedValue(startsAt));
    if (endsAt) setEndsAt(next ? toAllDayValue(endsAt) : toTimedValue(endsAt));
  }

  function toggleMember(memberId: string) {
    setMemberIds((current) => current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId]);
  }

  async function save() {
    if (savingRef.current) return;
    if (!title.trim()) return setError('Give this event a title.');
    if (!startsAt) return setError('Choose a start date.');
    if (endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) return setError('End must be after start.');
    if (audienceType === 'household' && !householdId) return setError('Choose a family group.');
    if (audienceType === 'members' && memberIds.length === 0) return setError('Choose at least one person.');

    const base = {
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      startsAt,
      endsAt,
      allDay
    };
    const input: CalendarEventInput = audienceType === 'household'
      ? { ...base, audienceType, householdId: householdId as string }
      : audienceType === 'members'
        ? { ...base, audienceType, memberIds }
        : { ...base, audienceType: 'family' };

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const saved = event
        ? await updateCalendarEvent(familyId, event.id, input)
        : await createCalendarEvent(familyId, input);
      await onSaved(saved);
    } catch (caught) {
      setError(caught instanceof CalendarApiError ? caught.message : 'The calendar event could not be saved.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Card elevated style={styles.editor}>
      <AppText variant="heading">{event ? 'Edit calendar event' : 'New calendar event'}</AppText>
      <TextField label="Title" value={title} onChangeText={setTitle} maxLength={140} autoFocus />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} maxLength={2000} multiline />
      <TextField label="Location (optional)" value={location} onChangeText={setLocation} maxLength={300} />

      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allDay }} disabled={saving} onPress={toggleAllDay} style={styles.toggleRow}>
        <View style={[styles.checkbox, { borderColor: allDay ? theme.primary : theme.borderStrong, backgroundColor: allDay ? theme.primary : 'transparent' }]}>
          <AppText variant="caption" style={{ color: allDay ? theme.textOnPrimary : theme.mutedText }}>{allDay ? '✓' : ''}</AppText>
        </View>
        <View style={styles.toggleCopy}><AppText variant="label">All-day event</AppText><AppText variant="caption" tone="mutedText">Use calendar dates without a specific time.</AppText></View>
      </Pressable>

      <View style={styles.dateRow}>
        <View style={styles.dateField}><DateTimeField label={allDay ? 'Start date' : 'Starts'} value={startsAt} onChange={(value) => { if (value) setStartsAt(value); }} dateOnly={allDay} /></View>
        <View style={styles.dateField}><DateTimeField label={allDay ? 'End date (optional)' : 'Ends (optional)'} value={endsAt} onChange={setEndsAt} dateOnly={allDay} /></View>
      </View>

      <AppText variant="label" style={styles.audienceLabel}>Audience</AppText>
      <View style={styles.audienceTabs}>
        <AudienceChoice label="Entire family" selected={audienceType === 'family'} onPress={() => setAudienceType('family')} />
        <AudienceChoice label="Family group" selected={audienceType === 'household'} onPress={() => setAudienceType('household')} />
        <AudienceChoice label="Specific people" selected={audienceType === 'members'} onPress={() => setAudienceType('members')} />
      </View>

      {audienceType === 'household' ? (
        <View style={styles.choices}>
          {households.length ? households.map((household) => <AudienceChoice key={household.id} label={household.name} selected={householdId === household.id} onPress={() => setHouseholdId(household.id)} />) : <AppText variant="caption" tone="mutedText">You do not currently belong to a family group.</AppText>}
        </View>
      ) : null}

      {audienceType === 'members' ? (
        <View>
          <AppText variant="caption" tone="mutedText" style={styles.selectionHint}>Choose one or more people. Select only yourself to create a creator-only event.</AppText>
          <View style={styles.choices}>{members.map((member) => <AudienceChoice key={member.id} label={member.displayName} selected={memberIds.includes(member.id)} onPress={() => toggleMember(member.id)} />)}</View>
        </View>
      ) : null}

      {error ? <AppText variant="caption" tone="danger" style={styles.error}>{error}</AppText> : null}
      <View style={styles.actions}>
        <Button label="Cancel" variant="quiet" disabled={saving} onPress={onCancel} />
        <Button label={event ? 'Save changes' : 'Create event'} loading={saving} onPress={() => void save()} />
      </View>
    </Card>
  );
}

function AudienceChoice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors: theme } = useAppTheme();
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.choice, { backgroundColor: selected ? theme.primarySoft : theme.input, borderColor: selected ? theme.primary : theme.border }]}><AppText variant="caption" tone={selected ? 'primary' : 'text'}>{label}</AppText></Pressable>;
}

const styles = StyleSheet.create({
  editor: { marginTop: spacing.lg, padding: spacing.xl },
  toggleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  checkbox: { alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, height: 28, justifyContent: 'center', width: 28 },
  toggleCopy: { flex: 1, gap: spacing.xs },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  dateField: { flex: 1, minWidth: 240 },
  audienceLabel: { marginTop: spacing.lg },
  audienceTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  choice: { borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md },
  selectionHint: { marginTop: spacing.sm },
  error: { marginTop: spacing.md },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg }
});
