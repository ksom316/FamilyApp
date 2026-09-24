export const colors = {
  light: {
    primary: '#E85D3F', primaryStrong: '#C94731', primarySoft: '#FDE7DE', secondary: '#5571D9', secondarySoft: '#E9EDFF', accent: '#F5BD4F', accentSoft: '#FFF2D4',
    success: '#3C9B71', successSoft: '#E2F4EA', warning: '#B8781D', warningSoft: '#FFF0D2', danger: '#C84B52', dangerSoft: '#FCE6E8', info: '#367E9B',
    background: '#FFF9F3', backgroundTint: '#FFF1E7', surface: '#FFFFFF', surfaceRaised: '#FFFCF9', input: '#FFFCF9', text: '#30262A', textOnPrimary: '#FFFFFF', mutedText: '#786B70', border: '#E9DDD5', borderStrong: '#D9C8BF'
  },
  dark: {
    primary: '#F47B5D', primaryStrong: '#FF9A7F', primarySoft: '#492A28', secondary: '#91A3FF', secondarySoft: '#29304D', accent: '#F7CA6A', accentSoft: '#453A24',
    success: '#70C89B', successSoft: '#203D31', warning: '#F0B75F', warningSoft: '#45351D', danger: '#FF8B91', dangerSoft: '#48272B', info: '#7CC1D8',
    background: '#211B1E', backgroundTint: '#302126', surface: '#2D2529', surfaceRaised: '#372D32', input: '#261F23', text: '#FFF8F3', textOnPrimary: '#2B1715', mutedText: '#C9B9B7', border: '#4B3C41', borderStrong: '#665158'
  }
} as const;

export type Theme = (typeof colors)[keyof typeof colors];
export type ThemeMode = keyof typeof colors;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 72 } as const;
export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;

export const typography = {
  family: { sans: 'System' },
  size: { xs: 12, sm: 14, md: 16, lg: 20, xl: 30, xxl: 42, display: 56 },
  lineHeight: { xs: 16, sm: 20, md: 24, lg: 28, xl: 36, xxl: 50, display: 62 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700', heavy: '800' }
} as const;

export const shadows = {
  sm: { shadowColor: '#3C2526', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  md: { shadowColor: '#3C2526', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 18, elevation: 5 },
  lg: { shadowColor: '#3C2526', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.14, shadowRadius: 28, elevation: 8 }
} as const;

export const motion = { fast: 140, normal: 220, slow: 360 } as const;
