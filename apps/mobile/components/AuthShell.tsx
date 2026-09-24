import { KeyboardAvoidingView, Platform, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import { colors, radius, spacing, type Theme } from '@familyapp/config';
import { AppText } from './AppText';
import { BrandMark } from './BrandMark';
import { Card } from './Card';
import { Screen } from './Screen';

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  const scheme = useColorScheme();
  const theme: Theme = colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll contentStyle={styles.screenContent}>
        <View style={[styles.layout, isWide && styles.layoutWide]}>
          <View style={[styles.intro, !isWide && styles.hidden]}>
            <BrandMark />
            <View style={styles.introCopy}>
              <AppText variant="eyebrow" tone="primary">A softer place to land</AppText>
              <AppText variant="display" style={styles.introTitle}>More of life, together.</AppText>
              <AppText variant="body" tone="mutedText" style={styles.introBody}>FamilyApp gives the people you love a private, thoughtful space to stay close.</AppText>
              <View style={[styles.colorTile, { backgroundColor: theme.primarySoft }]}><View style={[styles.tileDot, { backgroundColor: theme.primary }]} /><View style={[styles.tileDot, styles.tileDotTwo, { backgroundColor: theme.accent }]} /><View style={[styles.tileDot, styles.tileDotThree, { backgroundColor: theme.secondary }]} /></View>
            </View>
          </View>
          <View style={styles.formColumn}>
            <View style={[styles.mobileBrand, isWide && styles.hidden]}><BrandMark compact /></View>
            <Card elevated style={styles.formCard}>
              <AppText variant="heading">{title}</AppText>
              <AppText variant="body" tone="mutedText" style={styles.subtitle}>{subtitle}</AppText>
              <View style={styles.form}>{children}</View>
              {footer}
            </Card>
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screenContent: { justifyContent: 'center', paddingBottom: spacing.xl, paddingTop: spacing.xl },
  layout: { alignSelf: 'center', maxWidth: 480, width: '100%' },
  layoutWide: { alignItems: 'center', flexDirection: 'row', maxWidth: 1080 },
  intro: { flex: 1, marginRight: spacing.xxxl, minHeight: 560, paddingVertical: spacing.lg },
  introCopy: { flex: 1, justifyContent: 'center', paddingTop: spacing.xxl },
  introTitle: { maxWidth: 470, marginTop: spacing.md },
  introBody: { fontSize: 18, lineHeight: 28, marginTop: spacing.md, maxWidth: 390 },
  colorTile: { borderRadius: radius.xl, height: 170, marginTop: spacing.xxl, overflow: 'hidden', position: 'relative', width: 260 },
  tileDot: { borderRadius: 90, height: 150, left: -38, position: 'absolute', top: 48, width: 150 },
  tileDotTwo: { height: 88, left: 105, top: -35, width: 88 },
  tileDotThree: { height: 54, left: 188, top: 82, width: 54 },
  formColumn: { flex: 1, maxWidth: 480, width: '100%' },
  mobileBrand: { alignItems: 'center', marginBottom: spacing.xl },
  formCard: { padding: spacing.xl, width: '100%' },
  subtitle: { marginTop: spacing.sm },
  form: { marginTop: spacing.sm },
  hidden: { display: 'none' },
  footer: { alignItems: 'center', marginTop: spacing.lg }
});
