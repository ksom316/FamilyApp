import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import type { FamilyMapProps } from './FamilyMap.types';

// Platform builds resolve FamilyMap.native.tsx or FamilyMap.web.tsx. This small fallback
// keeps TypeScript and any unsupported platform usable without hiding the share list.
export function FamilyMap({ shares }: FamilyMapProps) {
  return (
    <View style={styles.fallback}>
      <AppText variant="label">{shares.length ? 'The embedded map is unavailable on this platform.' : 'No locations to map yet.'}</AppText>
      <AppText variant="caption" tone="mutedText">The accessible sharing list remains available below.</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', minHeight: 300, padding: 24 }
});
