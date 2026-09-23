import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@familyapp/config';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>FamilyApp</Text>
      <Text style={styles.subtitle}>Mobile foundation is running.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.light.background, padding: spacing.xl },
  title: { color: colors.light.primary, fontSize: typography.size.xl, fontWeight: '700' },
  subtitle: { color: colors.light.mutedText, fontSize: typography.size.md, marginTop: spacing.sm }
});
