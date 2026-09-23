export const colors = {
  light: {
    primary: '#F26B38', secondary: '#4C7DFF', accent: '#F6C453', success: '#43A976', warning: '#D89026', danger: '#D9534F',
    background: '#FFF8F0', surface: '#FFFFFF', text: '#2C2730', mutedText: '#766E78', border: '#E9DFD5'
  },
  dark: {
    primary: '#FF8A5C', secondary: '#82A3FF', accent: '#F8D06A', success: '#6BCB96', warning: '#F0B451', danger: '#FF807A',
    background: '#211E25', surface: '#302B34', text: '#FFF8F0', mutedText: '#C3B9C1', border: '#514852'
  }
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;
export const typography = {
  family: { sans: 'System' },
  size: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, xxl: 36 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700' }
} as const;
