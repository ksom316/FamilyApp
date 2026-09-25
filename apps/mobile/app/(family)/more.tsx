import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, spacing, type Theme } from '@familyapp/config';

import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';

const destinations = [
  { route: 'chat', title: 'Family chat', detail: 'Little notes and conversations' },
  { route: 'memories', title: 'Memories', detail: 'Moments worth keeping' },
  { route: 'capsules', title: 'Time Capsules', detail: 'Messages and memories sealed for the future' },
  { route: 'location', title: 'Location', detail: 'Share where you are, only when you choose' },
  { route: 'brain', title: 'Family Brain', detail: 'A thoughtful family helper' }
];

export default function MoreScreen() {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <Screen scroll maxWidth={840} contentStyle={styles.content}>
      <AppText variant="eyebrow" tone="primary">More to explore</AppText>
      <AppText variant="display" style={styles.title}>Your family’s next chapters.</AppText>
      <AppText variant="body" tone="mutedText" style={styles.subtitle}>These spaces are taking shape. Here’s where they’ll live.</AppText>
      <View style={styles.list}>{destinations.map((destination) => <Pressable key={destination.route} accessibilityRole="button" onPress={() => router.navigate(`/(family)/${destination.route}` as never)}><Card style={styles.destination}><View style={[styles.dot, { backgroundColor: theme.primarySoft }]}><AppText variant="label" tone="primary">✦</AppText></View><View style={styles.destinationCopy}><AppText variant="label">{destination.title}</AppText><AppText variant="caption" tone="mutedText" style={styles.detail}>{destination.detail}</AppText></View><AppText variant="body" tone="mutedText">›</AppText></Card></Pressable>)}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, paddingTop: spacing.xl },
  title: { marginTop: spacing.sm },
  subtitle: { marginTop: spacing.md },
  list: { gap: spacing.sm, marginTop: spacing.xl },
  destination: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  dot: { alignItems: 'center', borderRadius: radius.md, height: 44, justifyContent: 'center', width: 44 },
  destinationCopy: { flex: 1 },
  detail: { marginTop: spacing.xs }
});
