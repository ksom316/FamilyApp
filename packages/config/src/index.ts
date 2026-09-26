export type AppearanceMode = 'system' | 'light' | 'dark';
export type ResolvedAppearance = Exclude<AppearanceMode, 'system'>;
export type ThemeName = 'family' | 'ocean' | 'nature' | 'sunset' | 'blossom' | 'lavender' | 'midnight';

export type Theme = {
  background: string; backgroundTint: string; surface: string; surfaceSecondary: string; surfaceElevated: string; surfaceRaised: string;
  text: string; textSecondary: string; textMuted: string; mutedText: string; textInverse: string; textOnPrimary: string;
  border: string; borderStrong: string; divider: string;
  primary: string; primaryPressed: string; primarySoft: string; onPrimary: string;
  secondary: string; secondarySoft: string; accent: string; accentSoft: string;
  inputBackground: string; input: string; inputBorder: string; placeholder: string;
  navigationBackground: string; navigationActive: string; navigationInactive: string;
  success: string; successSoft: string; warning: string; warningSoft: string; danger: string; dangerSoft: string; info: string; infoSoft: string;
  overlay: string; shadow: string;
};

type Personality = {
  label: string;
  light: { primary: string; primaryPressed: string; primarySoft: string; secondary: string; secondarySoft: string; accent: string; accentSoft: string };
  dark: { primary: string; primaryPressed: string; primarySoft: string; secondary: string; secondarySoft: string; accent: string; accentSoft: string };
};

export const themeNames: readonly ThemeName[] = ['family', 'ocean', 'nature', 'sunset', 'blossom', 'lavender', 'midnight'];

export const themePersonalities: Record<ThemeName, Personality> = {
  family: { label: 'Family', light: { primary: '#C94731', primaryPressed: '#AA3928', primarySoft: '#FFF8F5', secondary: '#4F68CC', secondarySoft: '#FAFBFF', accent: '#C88712', accentSoft: '#FFF2D4' }, dark: { primary: '#F47B5D', primaryPressed: '#FF9A7F', primarySoft: '#492A28', secondary: '#A9B6FF', secondarySoft: '#29304D', accent: '#F7CA6A', accentSoft: '#453A24' } },
  ocean: { label: 'Ocean', light: { primary: '#087EA4', primaryPressed: '#066581', primarySoft: '#FAFEFF', secondary: '#087F8C', secondarySoft: '#F3FCFB', accent: '#2F6DCB', accentSoft: '#E5EEFC' }, dark: { primary: '#55C7E8', primaryPressed: '#82D9EF', primarySoft: '#173F4B', secondary: '#58D0C4', secondarySoft: '#173E3B', accent: '#82ACF0', accentSoft: '#24395D' } },
  nature: { label: 'Nature', light: { primary: '#477A43', primaryPressed: '#365F33', primarySoft: '#F5FAF3', secondary: '#7A6840', secondarySoft: '#F1EBDD', accent: '#A45F2A', accentSoft: '#F8E8D8' }, dark: { primary: '#91C987', primaryPressed: '#AFDAA7', primarySoft: '#294329', secondary: '#D0B976', secondarySoft: '#443D28', accent: '#E3A16F', accentSoft: '#4B3325' } },
  sunset: { label: 'Sunset', light: { primary: '#C74649', primaryPressed: '#A9363D', primarySoft: '#FFF8F6', secondary: '#9252A1', secondarySoft: '#F7EFF8', accent: '#C96A19', accentSoft: '#FCEBD8' }, dark: { primary: '#FF8A7A', primaryPressed: '#FFA69A', primarySoft: '#512B2D', secondary: '#D9A0E4', secondarySoft: '#422D48', accent: '#F3AF62', accentSoft: '#4B3421' } },
  blossom: { label: 'Blossom', light: { primary: '#B84E72', primaryPressed: '#963C5C', primarySoft: '#FFF7FA', secondary: '#8C5E8F', secondarySoft: '#F7EFF7', accent: '#B56A3D', accentSoft: '#F8EADF' }, dark: { primary: '#F18BAC', primaryPressed: '#F7AAC1', primarySoft: '#4D2836', secondary: '#D7A2D8', secondarySoft: '#402D42', accent: '#E7A17A', accentSoft: '#493126' } },
  lavender: { label: 'Lavender', light: { primary: '#7558B2', primaryPressed: '#5F4595', primarySoft: '#EEE8FA', secondary: '#4F72B8', secondarySoft: '#F9FAFF', accent: '#A25A88', accentSoft: '#F5E5EF' }, dark: { primary: '#B9A0F0', primaryPressed: '#CDBCF5', primarySoft: '#382D52', secondary: '#94B2ED', secondarySoft: '#293A57', accent: '#E09BC5', accentSoft: '#482E40' } },
  midnight: { label: 'Midnight', light: { primary: '#384A9B', primaryPressed: '#2B397C', primarySoft: '#E4E8F8', secondary: '#654AA5', secondarySoft: '#ECE7F7', accent: '#7C4F8C', accentSoft: '#F0E5F2' }, dark: { primary: '#91A7FF', primaryPressed: '#AFC0FF', primarySoft: '#27345F', secondary: '#BEA2F3', secondarySoft: '#382E58', accent: '#D79DDB', accentSoft: '#472F4C' } }
};

const surfaces = {
  light: { background: '#FFF9F3', backgroundTint: '#FFF1E7', surface: '#FFFFFF', surfaceSecondary: '#F8F2ED', surfaceElevated: '#FFFCF9', text: '#30262A', textSecondary: '#55484D', textMuted: '#786B70', textInverse: '#FFFFFF', border: '#E9DDD5', borderStrong: '#CDBBB2', divider: '#EEE4DE', inputBackground: '#FFFCF9', inputBorder: '#D9C8BF', placeholder: '#786B70', navigationBackground: '#FFFFFF', navigationInactive: '#786B70', success: '#277A54', successSoft: '#E2F4EA', warning: '#9A6111', warningSoft: '#FFF0D2', danger: '#B93D46', dangerSoft: '#FCE6E8', info: '#286F8C', infoSoft: '#E0F1F7', overlay: 'rgba(31, 22, 25, 0.58)', shadow: '#3C2526' },
  dark: { background: '#211B1E', backgroundTint: '#302126', surface: '#2D2529', surfaceSecondary: '#332A2F', surfaceElevated: '#3A3035', text: '#FFF8F3', textSecondary: '#E4D9D5', textMuted: '#C9B9B7', textInverse: '#211B1E', border: '#4B3C41', borderStrong: '#745D65', divider: '#44363C', inputBackground: '#261F23', inputBorder: '#665158', placeholder: '#B7A5A5', navigationBackground: '#2D2529', navigationInactive: '#C9B9B7', success: '#70C89B', successSoft: '#203D31', warning: '#F0B75F', warningSoft: '#45351D', danger: '#FF8B91', dangerSoft: '#48272B', info: '#7CC1D8', infoSoft: '#203A45', overlay: 'rgba(8, 6, 7, 0.74)', shadow: '#000000' }
} as const;

type Atmosphere = Pick<Theme,
  | 'background' | 'backgroundTint' | 'surface' | 'surfaceSecondary' | 'surfaceElevated'
  | 'text' | 'textSecondary' | 'textMuted' | 'border' | 'borderStrong' | 'divider'
  | 'inputBackground' | 'inputBorder' | 'placeholder'
  | 'navigationBackground' | 'navigationInactive' | 'overlay' | 'shadow'
>;

// Theme personality is carried by calm, coordinated surfaces as well as accents. These
// values deliberately stay low-chroma so content remains dominant while a theme is still
// recognizable from its page, cards, inputs, borders, and navigation alone.
const themeAtmospheres: Record<ThemeName, Record<ResolvedAppearance, Atmosphere>> = {
  family: {
    light: { background: '#FFF9F3', backgroundTint: '#FFF0E5', surface: '#FFFFFF', surfaceSecondary: '#F9F1EA', surfaceElevated: '#FFFCF9', text: '#30262A', textSecondary: '#55484D', textMuted: '#786B70', border: '#E9DAD1', borderStrong: '#CDB8AD', divider: '#F0E2DA', inputBackground: '#FFFCF9', inputBorder: '#D9C5BA', placeholder: '#786B70', navigationBackground: '#FFF4EC', navigationInactive: '#786B70', overlay: 'rgba(48, 30, 34, 0.58)', shadow: '#59342F' },
    dark: { background: '#211B1E', backgroundTint: '#302126', surface: '#2D2529', surfaceSecondary: '#352A2F', surfaceElevated: '#3C3035', text: '#FFF8F3', textSecondary: '#E4D9D5', textMuted: '#C9B9B7', border: '#4B3C41', borderStrong: '#745D65', divider: '#44363C', inputBackground: '#261F23', inputBorder: '#665158', placeholder: '#B7A5A5', navigationBackground: '#292126', navigationInactive: '#C9B9B7', overlay: 'rgba(15, 9, 11, 0.74)', shadow: '#090506' }
  },
  ocean: {
    light: { background: '#F2FAFC', backgroundTint: '#E2F4F7', surface: '#FCFEFF', surfaceSecondary: '#EAF5F7', surfaceElevated: '#FFFFFF', text: '#17323C', textSecondary: '#38545E', textMuted: '#5F757D', border: '#CDE3E8', borderStrong: '#A6C8D0', divider: '#DCECEF', inputBackground: '#F7FCFD', inputBorder: '#B7D5DB', placeholder: '#5F757D', navigationBackground: '#E8F5F8', navigationInactive: '#55717B', overlay: 'rgba(8, 39, 51, 0.60)', shadow: '#174553' },
    dark: { background: '#0D1D24', backgroundTint: '#102B34', surface: '#142A33', surfaceSecondary: '#19323B', surfaceElevated: '#1E3944', text: '#F0FAFC', textSecondary: '#D1E8ED', textMuted: '#A8C5CC', border: '#2B4A55', borderStrong: '#426773', divider: '#24414B', inputBackground: '#10232B', inputBorder: '#365C68', placeholder: '#91B2BA', navigationBackground: '#102630', navigationInactive: '#A6C5CC', overlay: 'rgba(3, 13, 18, 0.78)', shadow: '#02090C' }
  },
  nature: {
    light: { background: '#F7F8F1', backgroundTint: '#EAF0DF', surface: '#FEFEFA', surfaceSecondary: '#EFF3E7', surfaceElevated: '#FFFFFF', text: '#293326', textSecondary: '#4A5645', textMuted: '#697363', border: '#D5DDCB', borderStrong: '#B4C2A8', divider: '#E2E8D9', inputBackground: '#FBFCF6', inputBorder: '#C3CEB8', placeholder: '#697363', navigationBackground: '#EDF2E5', navigationInactive: '#64705E', overlay: 'rgba(28, 42, 25, 0.60)', shadow: '#35442E' },
    dark: { background: '#162018', backgroundTint: '#213021', surface: '#202B21', surfaceSecondary: '#283429', surfaceElevated: '#303C30', text: '#F3F7EE', textSecondary: '#DCE7D5', textMuted: '#B5C3AD', border: '#3D503D', borderStrong: '#587057', divider: '#344635', inputBackground: '#1A251B', inputBorder: '#4B624A', placeholder: '#9EAF97', navigationBackground: '#1A261B', navigationInactive: '#B1C0AA', overlay: 'rgba(7, 15, 8, 0.78)', shadow: '#060B06' }
  },
  sunset: {
    light: { background: '#FFF7F2', backgroundTint: '#FDE9DE', surface: '#FFFCFA', surfaceSecondary: '#FAEDE7', surfaceElevated: '#FFFFFF', text: '#3A292E', textSecondary: '#604A4F', textMuted: '#806C70', border: '#EBCFC4', borderStrong: '#D4AC9D', divider: '#F2DED5', inputBackground: '#FFF9F6', inputBorder: '#DDBBAD', placeholder: '#806C70', navigationBackground: '#FCEDE6', navigationInactive: '#79666B', overlay: 'rgba(55, 25, 31, 0.60)', shadow: '#66382F' },
    dark: { background: '#1E1519', backgroundTint: '#351E28', surface: '#302027', surfaceSecondary: '#3A252E', surfaceElevated: '#452B36', text: '#FFF7F3', textSecondary: '#F0DBD7', textMuted: '#D0B4B3', border: '#583943', borderStrong: '#7D505D', divider: '#4A3039', inputBackground: '#281A20', inputBorder: '#69434F', placeholder: '#BFA1A3', navigationBackground: '#291923', navigationInactive: '#CEB1B1', overlay: 'rgba(14, 5, 9, 0.80)', shadow: '#090305' }
  },
  blossom: {
    light: { background: '#FFF7FA', backgroundTint: '#FBE8F0', surface: '#FFFCFD', surfaceSecondary: '#F8EBF0', surfaceElevated: '#FFFFFF', text: '#392830', textSecondary: '#5D4650', textMuted: '#806A73', border: '#E9CED8', borderStrong: '#D0AAB9', divider: '#F1DDE4', inputBackground: '#FFF9FB', inputBorder: '#DDB8C6', placeholder: '#806A73', navigationBackground: '#FAEBF1', navigationInactive: '#7A6570', overlay: 'rgba(55, 22, 39, 0.60)', shadow: '#633548' },
    dark: { background: '#1B1920', backgroundTint: '#2B202B', surface: '#282329', surfaceSecondary: '#332832', surfaceElevated: '#3D2D39', text: '#FFF7FA', textSecondary: '#EEDAE3', textMuted: '#CDB2BE', border: '#4C3A47', borderStrong: '#6D5262', divider: '#40323D', inputBackground: '#221E25', inputBorder: '#5B4654', placeholder: '#BA9EAA', navigationBackground: '#231D27', navigationInactive: '#CBB0BC', overlay: 'rgba(10, 7, 12, 0.82)', shadow: '#050306' }
  },
  lavender: {
    light: { background: '#F8F7FE', backgroundTint: '#EEEBFA', surface: '#FEFDFF', surfaceSecondary: '#F0EEF9', surfaceElevated: '#FFFFFF', text: '#302B3D', textSecondary: '#514B61', textMuted: '#746D83', border: '#DBD5EA', borderStrong: '#BDB3D5', divider: '#E7E2F2', inputBackground: '#FBFAFF', inputBorder: '#C9C0DD', placeholder: '#746D83', navigationBackground: '#F0EDFA', navigationInactive: '#6E6880', overlay: 'rgba(36, 27, 58, 0.60)', shadow: '#443860' },
    dark: { background: '#1C1928', backgroundTint: '#29213C', surface: '#272235', surfaceSecondary: '#302A41', surfaceElevated: '#39314D', text: '#FAF8FF', textSecondary: '#E2DCF1', textMuted: '#BDB5D0', border: '#463D5B', borderStrong: '#62557B', divider: '#3B334E', inputBackground: '#211D2E', inputBorder: '#55496D', placeholder: '#AAA1BE', navigationBackground: '#242033', navigationInactive: '#B9B1CC', overlay: 'rgba(8, 6, 15, 0.80)', shadow: '#05040A' }
  },
  midnight: {
    light: { background: '#F4F6FC', backgroundTint: '#E6EAF7', surface: '#FCFDFF', surfaceSecondary: '#E9EDF7', surfaceElevated: '#FFFFFF', text: '#202943', textSecondary: '#414C69', textMuted: '#66708A', border: '#CFD6E8', borderStrong: '#AAB6D2', divider: '#DDE2F0', inputBackground: '#F8FAFF', inputBorder: '#B9C3DB', placeholder: '#66708A', navigationBackground: '#E8ECF8', navigationInactive: '#606B87', overlay: 'rgba(14, 20, 45, 0.64)', shadow: '#23315B' },
    dark: { background: '#0F1425', backgroundTint: '#171D36', surface: '#171D31', surfaceSecondary: '#1E2540', surfaceElevated: '#252D4B', text: '#F5F7FF', textSecondary: '#DCE2F5', textMuted: '#ADB8D6', border: '#34405F', borderStrong: '#52618A', divider: '#2B3552', inputBackground: '#13192B', inputBorder: '#445276', placeholder: '#96A2C2', navigationBackground: '#12182D', navigationInactive: '#A8B3D2', overlay: 'rgba(3, 5, 13, 0.84)', shadow: '#02030A' }
  }
};

export function createTheme(name: ThemeName, appearance: ResolvedAppearance): Theme {
  const surface = surfaces[appearance];
  const personality = themePersonalities[name][appearance];
  const atmosphere = themeAtmospheres[name][appearance];
  return { ...surface, ...atmosphere, ...personality, surfaceRaised: atmosphere.surfaceElevated, mutedText: atmosphere.textMuted, textOnPrimary: appearance === 'dark' ? '#211B1E' : '#FFFFFF', onPrimary: appearance === 'dark' ? '#211B1E' : '#FFFFFF', input: atmosphere.inputBackground, navigationActive: personality.primary };
}

export const colors = { light: createTheme('family', 'light'), dark: createTheme('family', 'dark') } as const;
export type ThemeMode = keyof typeof colors;
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 72 } as const;
export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;
export const typography = { family: { sans: 'System' }, size: { xs: 12, sm: 14, md: 16, lg: 20, xl: 30, xxl: 42, display: 56 }, lineHeight: { xs: 16, sm: 20, md: 24, lg: 28, xl: 36, xxl: 50, display: 62 }, weight: { regular: '400', medium: '500', semibold: '600', bold: '700', heavy: '800' } } as const;
export const shadows = { sm: { shadowColor: '#3C2526', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }, md: { shadowColor: '#3C2526', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 18, elevation: 5 }, lg: { shadowColor: '#3C2526', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.14, shadowRadius: 28, elevation: 8 } } as const;
export const motion = { fast: 140, normal: 220, slow: 360 } as const;
