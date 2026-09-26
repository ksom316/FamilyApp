import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import 'leaflet/dist/leaflet.css';
import { radius, type Theme } from '@familyapp/config';

import { AppText } from './AppText';
import { useAppTheme } from '../lib/app-theme';
import type { FamilyMapProps } from './FamilyMap.types';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character);
}

function markerHtml(name: string, findMe: boolean, colors: Theme) {
  const background = findMe ? colors.primary : colors.secondary;
  const halo = findMe ? `box-shadow:0 0 0 7px ${colors.primarySoft};` : '';
  return `<div data-family-marker style="align-items:center;background:${background};border:3px solid ${colors.surface};border-radius:25px;color:${colors.onPrimary};display:flex;font-family:system-ui;font-size:13px;font-weight:800;height:44px;justify-content:center;transition:transform .15s ease,box-shadow .15s ease;width:44px;${halo}">${escapeHtml(initials(name))}</div>`;
}

export function FamilyMap({ shares, selectedShareId, onSelect }: FamilyMapProps) {
  const { colors } = useAppTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef(new Map<string, LeafletMarker>());
  const onSelectRef = useRef(onSelect);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const coordinateKey = useMemo(
    () => shares.map((share) => `${share.id}:${share.latitude}:${share.longitude}:${share.member.displayName}:${share.purpose}`).join('|'),
    [shares]
  );

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current || shares.length === 0) return;
    setFailed(false);
    setReady(false);
    void import('leaflet').then((L) => {
      if (cancelled || !containerRef.current) return;
      const map = L.map(containerRef.current, { attributionControl: true, zoomControl: true });
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);
      const bounds: Array<[number, number]> = [];
      for (const share of shares) {
        const coordinate: [number, number] = [share.latitude, share.longitude];
        bounds.push(coordinate);
        const marker = L.marker(coordinate, {
          icon: L.divIcon({
            className: '',
            html: markerHtml(share.member.displayName, share.purpose === 'come_find_me', colors),
            iconAnchor: [22, 22],
            iconSize: [44, 44]
          }),
          keyboard: true,
          title: share.member.displayName
        }).addTo(map);
        marker.on('click', () => onSelectRef.current(share.id));
        markersRef.current.set(share.id, marker);
      }
      if (bounds.length === 1) map.setView(bounds[0]!, 15);
      else map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
      setReady(true);
      setTimeout(() => map.invalidateSize(), 0);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      markersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [colors, coordinateKey]);

  useEffect(() => {
    for (const [id, marker] of markersRef.current) {
      const element = marker.getElement()?.querySelector<HTMLElement>('[data-family-marker]');
      if (!element) continue;
      const selected = id === selectedShareId;
      element.style.transform = selected ? 'scale(1.18)' : 'scale(1)';
      element.style.outline = selected ? `3px solid ${colors.primary}` : 'none';
      element.style.outlineOffset = selected ? '3px' : '0';
    }
  }, [colors.primary, selectedShareId, ready]);

  if (shares.length === 0) {
    return <View style={[styles.empty, { backgroundColor: colors.backgroundTint }]}><AppText variant="title" tone="mutedText">◎</AppText><AppText variant="label">No locations to map yet</AppText><AppText variant="caption" tone="mutedText" align="center">Eligible shares will appear here without using your browser location to invent a map center.</AppText></View>;
  }

  if (failed) {
    return <View style={[styles.empty, { backgroundColor: colors.backgroundTint }]}><AppText variant="label">The embedded map could not load.</AppText><AppText variant="caption" tone="mutedText" align="center">Use the sharing list and external map actions below.</AppText></View>;
  }

  return (
    <View style={styles.shell}>
      <div ref={containerRef} aria-label="Family map" style={{ height: '100%', width: '100%' }} />
      {!ready ? <View pointerEvents="none" style={[styles.loading, { backgroundColor: colors.surfaceElevated }]}><AppText variant="caption" tone="mutedText">Loading family map…</AppText></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { borderRadius: radius.lg, height: 360, marginTop: 12, overflow: 'hidden', position: 'relative' },
  empty: { alignItems: 'center', borderRadius: radius.lg, gap: 6, justifyContent: 'center', minHeight: 300, padding: 24 },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', opacity: 0.92 }
});
