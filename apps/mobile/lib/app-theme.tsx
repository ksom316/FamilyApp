import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, StatusBar, StyleSheet, useColorScheme, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createTheme, themeNames, type AppearanceMode, type ResolvedAppearance, type Theme, type ThemeName } from '@familyapp/config';

const STORAGE_KEY = 'familyapp.appearance.v1';
const DEFAULT_APPEARANCE: AppearanceMode = 'system';
const DEFAULT_THEME: ThemeName = 'family';

type PersistedPreferences = { appearance: AppearanceMode; theme: ThemeName };
type AppThemeValue = PersistedPreferences & {
  resolvedAppearance: ResolvedAppearance;
  colors: Theme;
  hydrated: boolean;
  setAppearance: (appearance: AppearanceMode) => void;
  setTheme: (theme: ThemeName) => void;
};

const AppThemeContext = createContext<AppThemeValue | null>(null);

function isAppearance(value: unknown): value is AppearanceMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isTheme(value: unknown): value is ThemeName {
  return typeof value === 'string' && (themeNames as readonly string[]).includes(value);
}

async function readPreferences(): Promise<PersistedPreferences> {
  try {
    const raw = Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
      : await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return { appearance: DEFAULT_APPEARANCE, theme: DEFAULT_THEME };
    const parsed = JSON.parse(raw) as Partial<PersistedPreferences>;
    return {
      appearance: isAppearance(parsed.appearance) ? parsed.appearance : DEFAULT_APPEARANCE,
      theme: isTheme(parsed.theme) ? parsed.theme : DEFAULT_THEME
    };
  } catch {
    return { appearance: DEFAULT_APPEARANCE, theme: DEFAULT_THEME };
  }
}

async function writePreferences(preferences: PersistedPreferences) {
  try {
    const raw = JSON.stringify(preferences);
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(STORAGE_KEY, raw);
    else await SecureStore.setItemAsync(STORAGE_KEY, raw);
  } catch {
    // Appearance remains active for this session if device storage is unavailable.
  }
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [appearance, setAppearanceState] = useState<AppearanceMode>(DEFAULT_APPEARANCE);
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void readPreferences().then((preferences) => {
      if (!active) return;
      setAppearanceState(preferences.appearance);
      setThemeState(preferences.theme);
      setHydrated(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (hydrated) void writePreferences({ appearance, theme });
  }, [appearance, hydrated, theme]);

  const resolvedAppearance: ResolvedAppearance = appearance === 'system'
    ? (systemScheme === 'dark' ? 'dark' : 'light')
    : appearance;
  const colors = useMemo(() => createTheme(theme, resolvedAppearance), [resolvedAppearance, theme]);

  const setAppearance = useCallback((next: AppearanceMode) => setAppearanceState(next), []);
  const setTheme = useCallback((next: ThemeName) => setThemeState(next), []);

  const value = useMemo<AppThemeValue>(() => ({ appearance, theme, resolvedAppearance, colors, hydrated, setAppearance, setTheme }), [appearance, colors, hydrated, resolvedAppearance, setAppearance, setTheme, theme]);

  return (
    <AppThemeContext.Provider value={value}>
      <StatusBar barStyle={resolvedAppearance === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      {hydrated ? children : <View testID="theme-hydration" style={[styles.hydration, { backgroundColor: colors.background }]} />}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  const value = useContext(AppThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside AppThemeProvider.');
  return value;
}

const styles = StyleSheet.create({ hydration: { flex: 1 } });
