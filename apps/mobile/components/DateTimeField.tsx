import { createElement, useState } from 'react';
import { Platform, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors, radius, spacing, typography, type Theme } from '@familyapp/config';

import { AppText } from './AppText';
import { Button } from './Button';

export type DateTimeFieldProps = {
  label: string;
  /** ISO 8601 string, or null when no date/time is selected. */
  value: string | null;
  onChange: (iso: string | null) => void;
  minimumDate?: Date;
  placeholder?: string;
  hint?: string;
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

/** Local (not UTC) `YYYY-MM-DDTHH:mm`, the format `<input type="datetime-local">` expects. */
function toWebInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatHumanReadable(date: Date) {
  return date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Cross-platform date + time picker that always yields a full ISO 8601 string (or null).
 * Web uses the browser's native `datetime-local` input; native uses
 * `@react-native-community/datetimepicker`. Intended to be reused anywhere FamilyApp
 * needs a "pick a date and time" field instead of free-text entry.
 */
export function DateTimeField({ label, value, onChange, minimumDate, placeholder = 'Choose a date and time', hint }: DateTimeFieldProps) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const date = value ? new Date(value) : null;
  // Android has no native combined date+time dialog, so it's a two-step date-then-time
  // flow; iOS gets a single spinner showing both at once.
  const [step, setStep] = useState<'date' | 'time' | 'ios' | null>(null);
  const [draftDate, setDraftDate] = useState<Date>(date ?? minimumDate ?? new Date());

  function handleWebChange(rawValue: string) {
    if (!rawValue) {
      onChange(null);
      return;
    }
    const parsed = new Date(rawValue);
    if (!Number.isNaN(parsed.getTime())) onChange(parsed.toISOString());
  }

  function openNativePicker() {
    setDraftDate(date ?? minimumDate ?? new Date(Date.now() + 60 * 60 * 1000));
    setStep(Platform.OS === 'ios' ? 'ios' : 'date');
  }

  function handleAndroidDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type !== 'set' || !selected) {
      setStep(null);
      return;
    }
    setDraftDate((current) => {
      const next = new Date(selected);
      next.setHours(current.getHours(), current.getMinutes(), 0, 0);
      return next;
    });
    setStep('time');
  }

  function handleAndroidTimeChange(event: DateTimePickerEvent, selected?: Date) {
    setStep(null);
    if (event.type !== 'set' || !selected) return;
    const combined = new Date(draftDate);
    combined.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    onChange(combined.toISOString());
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.wrapper}>
        <AppText variant="label" style={styles.label}>{label}</AppText>
        <View style={styles.row}>
          {createElement('input', {
            type: 'datetime-local',
            value: date ? toWebInputValue(date) : '',
            min: minimumDate ? toWebInputValue(minimumDate) : undefined,
            onChange: (event: { target: { value: string } }) => handleWebChange(event.target.value),
            style: {
              backgroundColor: theme.input,
              border: `1px solid ${theme.border}`,
              borderRadius: radius.md,
              color: theme.text,
              flex: 1,
              fontFamily: 'inherit',
              fontSize: typography.size.md,
              minHeight: 54,
              minWidth: 0,
              paddingLeft: spacing.md,
              paddingRight: spacing.md
            }
          })}
          {date ? <Button label="Clear" variant="quiet" onPress={() => onChange(null)} /> : null}
        </View>
        {hint ? <AppText variant="caption" tone="mutedText" style={styles.message}>{hint}</AppText> : null}
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <AppText variant="label" style={styles.label}>{label}</AppText>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={openNativePicker}
          style={[styles.nativeField, { backgroundColor: theme.input, borderColor: theme.border }]}
        >
          <AppText variant="body" tone={date ? 'text' : 'mutedText'}>{date ? formatHumanReadable(date) : placeholder}</AppText>
        </Pressable>
        {date ? <Button label="Clear" variant="quiet" onPress={() => onChange(null)} /> : null}
      </View>
      {hint ? <AppText variant="caption" tone="mutedText" style={styles.message}>{hint}</AppText> : null}

      {step === 'date' ? (
        <DateTimePicker value={draftDate} mode="date" display="default" minimumDate={minimumDate} onChange={handleAndroidDateChange} />
      ) : null}

      {step === 'time' ? (
        <DateTimePicker value={draftDate} mode="time" display="default" onChange={handleAndroidTimeChange} />
      ) : null}

      {step === 'ios' ? (
        <View style={[styles.iosPicker, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <DateTimePicker
            value={draftDate}
            mode="datetime"
            display="spinner"
            minimumDate={minimumDate}
            onChange={(_event, selected) => { if (selected) setDraftDate(selected); }}
          />
          <View style={styles.iosActions}>
            <Button label="Cancel" variant="quiet" onPress={() => setStep(null)} />
            <Button label="Done" onPress={() => { onChange(draftDate.toISOString()); setStep(null); }} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginTop: spacing.md },
  label: { marginBottom: spacing.xs },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  nativeField: { borderRadius: radius.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 54, paddingHorizontal: spacing.md },
  message: { marginTop: spacing.xs },
  iosPicker: { borderRadius: radius.md, borderWidth: 1, marginTop: spacing.sm, padding: spacing.md },
  iosActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.sm }
});
