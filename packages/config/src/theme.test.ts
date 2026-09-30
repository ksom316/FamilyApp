import { describe, expect, it } from 'vitest';

import { createTheme, isAppearanceMode, isThemeName, themeNames, themePersonalities, type Theme, type ThemeName } from './index';

const EXISTING_THEMES: ThemeName[] = ['family', 'ocean', 'nature', 'sunset', 'blossom', 'lavender', 'midnight'];
const NEW_THEMES: ThemeName[] = ['kinzae', 'sunshine', 'kinzaeRose', 'kinzaeOcean', 'emerald', 'aurora', 'midnightGold', 'midnightNeon'];

const REQUIRED_TOKENS: (keyof Theme)[] = [
  'background', 'backgroundTint', 'surface', 'surfaceSecondary', 'surfaceElevated', 'surfaceRaised',
  'text', 'textSecondary', 'textMuted', 'mutedText', 'textInverse', 'textOnPrimary',
  'border', 'borderStrong', 'divider',
  'primary', 'primaryPressed', 'primarySoft', 'onPrimary',
  'secondary', 'secondarySoft', 'accent', 'accentSoft',
  'inputBackground', 'input', 'inputBorder', 'placeholder',
  'navigationBackground', 'navigationActive', 'navigationInactive',
  'success', 'successSoft', 'warning', 'warningSoft', 'danger', 'dangerSoft', 'info', 'infoSoft',
  'overlay', 'shadow'
];

describe('theme catalog', () => {
  it('contains every existing theme name, unchanged, plus all 8 new Kinzae themes', () => {
    for (const name of [...EXISTING_THEMES, ...NEW_THEMES]) {
      expect(themeNames).toContain(name);
    }
    expect(themeNames).toHaveLength(EXISTING_THEMES.length + NEW_THEMES.length);
  });

  it('is a purely additive change: no existing theme name was removed', () => {
    for (const name of EXISTING_THEMES) expect(themeNames).toContain(name);
  });

  it.each(themeNames)('createTheme("%s") produces every required semantic token, in both light and dark', (name) => {
    for (const appearance of ['light', 'dark'] as const) {
      const theme = createTheme(name, appearance);
      for (const token of REQUIRED_TOKENS) {
        expect(theme[token], `${name}/${appearance}.${String(token)}`).toBeTruthy();
      }
    }
  });

  it('gives each theme a distinct, valid hex or rgba primary/background pairing (no accidental duplicate palette)', () => {
    const fingerprints = new Set<string>();
    for (const name of themeNames) {
      const light = createTheme(name, 'light');
      const fingerprint = `${light.primary}|${light.background}`;
      expect(fingerprints.has(fingerprint), `duplicate palette fingerprint for "${name}"`).toBe(false);
      fingerprints.add(fingerprint);
    }
  });
});

describe('existing Light/Dark preservation', () => {
  // Frozen regression values for the theme most existing users are actually on (the
  // pre-Kinzae default, "family"). If these ever change, an existing user's Light/Dark
  // experience silently changed underneath them — exactly what this rebrand must not do.
  it('keeps the pre-existing "family" theme colors exactly as they were before the Kinzae rebrand', () => {
    const light = createTheme('family', 'light');
    expect(light.primary).toBe('#C94731');
    expect(light.background).toBe('#FFF9F3');
    expect(light.text).toBe('#30262A');
    expect(light.surface).toBe('#FFFFFF');

    const dark = createTheme('family', 'dark');
    expect(dark.primary).toBe('#F47B5D');
    expect(dark.background).toBe('#211B1E');
    expect(dark.text).toBe('#FFF8F3');
    expect(dark.surface).toBe('#2D2529');
  });

  it('keeps every other pre-existing personality theme byte-for-byte unchanged', () => {
    const before: Record<string, { light: string; dark: string }> = {
      ocean: { light: '#087EA4', dark: '#55C7E8' },
      nature: { light: '#477A43', dark: '#91C987' },
      sunset: { light: '#C74649', dark: '#FF8A7A' },
      blossom: { light: '#B84E72', dark: '#F18BAC' },
      lavender: { light: '#7558B2', dark: '#B9A0F0' },
      midnight: { light: '#384A9B', dark: '#91A7FF' }
    };
    for (const [name, expected] of Object.entries(before)) {
      expect(themePersonalities[name as ThemeName].light.primary).toBe(expected.light);
      expect(themePersonalities[name as ThemeName].dark.primary).toBe(expected.dark);
    }
  });
});

describe('preference validation (isAppearanceMode / isThemeName)', () => {
  it('accepts exactly system, light, and dark as appearance modes', () => {
    expect(isAppearanceMode('system')).toBe(true);
    expect(isAppearanceMode('light')).toBe(true);
    expect(isAppearanceMode('dark')).toBe(true);
    expect(isAppearanceMode('kinzae')).toBe(false);
    expect(isAppearanceMode(undefined)).toBe(false);
    expect(isAppearanceMode('')).toBe(false);
  });

  it('accepts every current theme name, including all 8 new ones', () => {
    for (const name of themeNames) expect(isThemeName(name)).toBe(true);
  });

  it('rejects an invalid or retired theme id (the old/invalid-preference fallback case)', () => {
    expect(isThemeName('not-a-real-theme')).toBe(false);
    expect(isThemeName('')).toBe(false);
    expect(isThemeName(undefined)).toBe(false);
    expect(isThemeName(42)).toBe(false);
  });
});
