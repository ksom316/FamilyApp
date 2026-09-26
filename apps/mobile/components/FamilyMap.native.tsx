import { useAppTheme } from '../lib/app-theme';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { radius } from '@familyapp/config';

import { AppText } from './AppText';
import type { FamilyMapProps } from './FamilyMap.types';

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

export function FamilyMap({ shares, selectedShareId, onSelect }: FamilyMapProps) {
  const { colors: theme } = useAppTheme();
  const mapRef = useRef<MapView | null>(null);
  const [ready, setReady] = useState(false);
  const coordinateKey = useMemo(
    () => shares.map((share) => `${share.id}:${share.latitude}:${share.longitude}`).join('|'),
    [shares]
  );

  useEffect(() => {
    if (!ready || shares.length === 0) return;
    const coordinates = shares.map((share) => ({ latitude: share.latitude, longitude: share.longitude }));
    try {
      if (coordinates.length === 1) {
        mapRef.current?.animateToRegion({ ...coordinates[0]!, latitudeDelta: 0.025, longitudeDelta: 0.025 }, 350);
      } else {
        mapRef.current?.fitToCoordinates(coordinates, {
          animated: true,
          edgePadding: { top: 64, right: 64, bottom: 64, left: 64 }
        });
      }
    } catch {
      // The list and external map actions remain available if the native provider fails.
    }
  }, [coordinateKey, ready]);

  if (shares.length === 0) {
    return <View style={[styles.empty, { backgroundColor: theme.backgroundTint }]}><AppText variant="title" tone="mutedText">◎</AppText><AppText variant="label">No locations to map yet</AppText><AppText variant="caption" tone="mutedText" align="center">Eligible shares will appear here without using your device location to invent a map center.</AppText></View>;
  }

  const first = shares[0]!;
  return (
    <View style={[styles.shell, { borderColor: theme.border }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: first.latitude, longitude: first.longitude, latitudeDelta: 0.025, longitudeDelta: 0.025 }}
        onMapReady={() => setReady(true)}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {shares.map((share) => {
          const selected = share.id === selectedShareId;
          const findMe = share.purpose === 'come_find_me';
          return (
            <Marker
              key={share.id}
              coordinate={{ latitude: share.latitude, longitude: share.longitude }}
              title={share.member.displayName}
              description={findMe ? 'Come Find Me' : 'Sharing location'}
              onPress={() => onSelect(share.id)}
            >
              <View style={[styles.markerHalo, { backgroundColor: theme.surface, borderColor: theme.surface }, findMe && { backgroundColor: theme.primarySoft }, selected && { borderColor: theme.primary, borderWidth: 3 }]}>
                <View style={[styles.marker, { backgroundColor: findMe ? theme.primary : theme.secondary }]}>
                  <AppText variant="caption" style={[styles.markerText, { color: theme.onPrimary }]}>{initials(share.member.displayName)}</AppText>
                </View>
              </View>
            </Marker>
          );
        })}
      </MapView>
      {!ready ? <View pointerEvents="none" style={[styles.loading, { backgroundColor: theme.surfaceElevated }]}><ActivityIndicator color={theme.primary} /><AppText variant="caption" tone="mutedText">Loading family map…</AppText></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { borderRadius: radius.lg, borderWidth: 1, height: 360, marginTop: 12, overflow: 'hidden', position: 'relative' },
  empty: { alignItems: 'center', borderRadius: radius.lg, gap: 6, justifyContent: 'center', minHeight: 300, padding: 24 },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', gap: 8, justifyContent: 'center', opacity: 0.92 },
  markerHalo: { alignItems: 'center', borderRadius: 28, borderWidth: 3, height: 52, justifyContent: 'center', width: 52 },
  marker: { alignItems: 'center', borderRadius: 21, height: 42, justifyContent: 'center', width: 42 },
  markerText: { fontWeight: '800' }
});
