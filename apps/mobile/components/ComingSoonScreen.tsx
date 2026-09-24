import { StyleSheet, useColorScheme } from 'react-native';
import { colors, spacing, type Theme } from '@familyapp/config';

import { AppText } from './AppText';
import { Card } from './Card';
import { Screen } from './Screen';

export function ComingSoonScreen({ title, intro, detail }: { title: string; intro: string; detail: string }) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <Screen scroll maxWidth={920} contentStyle={styles.content}>
      <AppText variant="eyebrow" tone="secondary">A little more, soon</AppText>
      <AppText variant="display" style={styles.title}>{title}</AppText>
      <AppText variant="body" tone="mutedText" style={styles.intro}>{intro}</AppText>
      <Card style={[styles.note, { backgroundColor: theme.secondarySoft }]}>
        <AppText variant="heading" tone="secondary">Made for your family</AppText>
        <AppText variant="body" tone="mutedText" style={styles.detail}>{detail}</AppText>
        <AppText variant="caption" tone="secondary" style={styles.status}>This space is coming in a future update.</AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xxl },
  title: { marginTop: spacing.sm },
  intro: { marginTop: spacing.md, maxWidth: 620 },
  note: { marginTop: spacing.xl, padding: spacing.xl },
  detail: { marginTop: spacing.sm },
  status: { marginTop: spacing.lg }
});
