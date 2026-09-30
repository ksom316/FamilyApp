export type AppearanceMode = 'system' | 'light' | 'dark';
export type ResolvedAppearance = Exclude<AppearanceMode, 'system'>;
export type ThemeName =
  | 'family' | 'ocean' | 'nature' | 'sunset' | 'blossom' | 'lavender' | 'midnight'
  // Kinzae rebrand: additive theme collection. These sit alongside the original seven
  // (never replacing them) so existing Ocean/Blossom users keep their current look, while
  // "kinzaeOcean"/"kinzaeRose" cover the same color families with the new, bolder palettes.
  | 'kinzae' | 'sunshine' | 'kinzaeRose' | 'kinzaeOcean' | 'emerald' | 'aurora' | 'midnightGold' | 'midnightNeon';

export function isAppearanceMode(value: unknown): value is AppearanceMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

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

export const themeNames: readonly ThemeName[] = [
  'family', 'ocean', 'nature', 'sunset', 'blossom', 'lavender', 'midnight',
  'kinzae', 'sunshine', 'kinzaeRose', 'kinzaeOcean', 'emerald', 'aurora', 'midnightGold', 'midnightNeon'
];

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && (themeNames as readonly string[]).includes(value);
}

export const themePersonalities: Record<ThemeName, Personality> = {
  family: { label: 'Family', light: { primary: '#C94731', primaryPressed: '#AA3928', primarySoft: '#FFF8F5', secondary: '#4F68CC', secondarySoft: '#FAFBFF', accent: '#C88712', accentSoft: '#FFF2D4' }, dark: { primary: '#F47B5D', primaryPressed: '#FF9A7F', primarySoft: '#492A28', secondary: '#A9B6FF', secondarySoft: '#29304D', accent: '#F7CA6A', accentSoft: '#453A24' } },
  ocean: { label: 'Ocean', light: { primary: '#087EA4', primaryPressed: '#066581', primarySoft: '#FAFEFF', secondary: '#087F8C', secondarySoft: '#F3FCFB', accent: '#2F6DCB', accentSoft: '#E5EEFC' }, dark: { primary: '#55C7E8', primaryPressed: '#82D9EF', primarySoft: '#173F4B', secondary: '#58D0C4', secondarySoft: '#173E3B', accent: '#82ACF0', accentSoft: '#24395D' } },
  nature: { label: 'Nature', light: { primary: '#477A43', primaryPressed: '#365F33', primarySoft: '#F5FAF3', secondary: '#7A6840', secondarySoft: '#F1EBDD', accent: '#A45F2A', accentSoft: '#F8E8D8' }, dark: { primary: '#91C987', primaryPressed: '#AFDAA7', primarySoft: '#294329', secondary: '#D0B976', secondarySoft: '#443D28', accent: '#E3A16F', accentSoft: '#4B3325' } },
  sunset: { label: 'Sunset', light: { primary: '#C74649', primaryPressed: '#A9363D', primarySoft: '#FFF8F6', secondary: '#9252A1', secondarySoft: '#F7EFF8', accent: '#C96A19', accentSoft: '#FCEBD8' }, dark: { primary: '#FF8A7A', primaryPressed: '#FFA69A', primarySoft: '#512B2D', secondary: '#D9A0E4', secondarySoft: '#422D48', accent: '#F3AF62', accentSoft: '#4B3421' } },
  blossom: { label: 'Blossom', light: { primary: '#B84E72', primaryPressed: '#963C5C', primarySoft: '#FFF7FA', secondary: '#8C5E8F', secondarySoft: '#F7EFF7', accent: '#B56A3D', accentSoft: '#F8EADF' }, dark: { primary: '#F18BAC', primaryPressed: '#F7AAC1', primarySoft: '#4D2836', secondary: '#D7A2D8', secondarySoft: '#402D42', accent: '#E7A17A', accentSoft: '#493126' } },
  lavender: { label: 'Lavender', light: { primary: '#7558B2', primaryPressed: '#5F4595', primarySoft: '#EEE8FA', secondary: '#4F72B8', secondarySoft: '#F9FAFF', accent: '#A25A88', accentSoft: '#F5E5EF' }, dark: { primary: '#B9A0F0', primaryPressed: '#CDBCF5', primarySoft: '#382D52', secondary: '#94B2ED', secondarySoft: '#293A57', accent: '#E09BC5', accentSoft: '#482E40' } },
  midnight: { label: 'Midnight', light: { primary: '#384A9B', primaryPressed: '#2B397C', primarySoft: '#E4E8F8', secondary: '#654AA5', secondarySoft: '#ECE7F7', accent: '#7C4F8C', accentSoft: '#F0E5F2' }, dark: { primary: '#91A7FF', primaryPressed: '#AFC0FF', primarySoft: '#27345F', secondary: '#BEA2F3', secondarySoft: '#382E58', accent: '#D79DDB', accentSoft: '#472F4C' } },

  // --- Kinzae additive theme collection (below) ---
  kinzae: { label: 'Kinzae', light: { primary: '#0A8FD1', primaryPressed: '#086FA8', primarySoft: '#EAF7FE', secondary: '#D63384', secondarySoft: '#FDE9F2', accent: '#12B886', accentSoft: '#E1F8F0' }, dark: { primary: '#4FC3F7', primaryPressed: '#7ED4FA', primarySoft: '#10344A', secondary: '#F783AC', secondarySoft: '#4A2233', accent: '#63E6BE', accentSoft: '#163B30' } },
  sunshine: { label: 'Sunshine', light: { primary: '#E08A00', primaryPressed: '#B96F00', primarySoft: '#FFF3D6', secondary: '#D9622B', secondarySoft: '#FDEBDF', accent: '#A6790A', accentSoft: '#F7E9C9' }, dark: { primary: '#FFC94D', primaryPressed: '#FFD873', primarySoft: '#4A3510', secondary: '#FF9F5A', secondarySoft: '#4A2C15', accent: '#FFE08A', accentSoft: '#453518' } },
  kinzaeRose: { label: 'Kinzae Rose', light: { primary: '#C6316B', primaryPressed: '#A11F55', primarySoft: '#FFE9F1', secondary: '#8B4FA0', secondarySoft: '#F3E8F7', accent: '#E0637B', accentSoft: '#FCE5EA' }, dark: { primary: '#FF7FA8', primaryPressed: '#FFA0C0', primarySoft: '#4A1F30', secondary: '#C692DB', secondarySoft: '#3A2745', accent: '#F090A0', accentSoft: '#452430' } },
  kinzaeOcean: { label: 'Kinzae Ocean', light: { primary: '#0088C2', primaryPressed: '#006A99', primarySoft: '#E1F5FC', secondary: '#2456C9', secondarySoft: '#E6ECFC', accent: '#00A896', accentSoft: '#DAF5F0' }, dark: { primary: '#4FD1F0', primaryPressed: '#7EDEF5', primarySoft: '#0F3A47', secondary: '#6E93FF', secondarySoft: '#1F2C4D', accent: '#4FE3CE', accentSoft: '#133C36' } },
  emerald: { label: 'Emerald', light: { primary: '#0E8A5F', primaryPressed: '#0B6E4B', primarySoft: '#E2F7EE', secondary: '#5C8A5A', secondarySoft: '#EEF5EA', accent: '#0E9E96', accentSoft: '#DFF6F3' }, dark: { primary: '#4FD69B', primaryPressed: '#79E4B4', primarySoft: '#133A2A', secondary: '#A0CB93', secondarySoft: '#263A24', accent: '#4FE0D4', accentSoft: '#103A36' } },
  aurora: { label: 'Aurora', light: { primary: '#6E3FCC', primaryPressed: '#5730A6', primarySoft: '#EFE7FC', secondary: '#C13B9B', secondarySoft: '#FAE7F4', accent: '#2F6FE0', accentSoft: '#E3ECFC' }, dark: { primary: '#A98BF5', primaryPressed: '#C1A9FA', primarySoft: '#2E2050', secondary: '#EE8FD4', secondarySoft: '#452038', accent: '#6FA0FF', accentSoft: '#1D2E52' } },
  midnightGold: { label: 'Midnight Gold', light: { primary: '#C9A227', primaryPressed: '#A9861D', primarySoft: '#2B2412', secondary: '#9C6B3B', secondarySoft: '#2E2416', accent: '#E7C873', accentSoft: '#332A16' }, dark: { primary: '#E8C567', primaryPressed: '#F2D689', primarySoft: '#33290F', secondary: '#C08A54', secondarySoft: '#2E2114', accent: '#F2DFA0', accentSoft: '#362B14' } },
  midnightNeon: { label: 'Midnight Neon', light: { primary: '#3E8EFF', primaryPressed: '#6AA8FF', primarySoft: '#16233E', secondary: '#9B5CF0', secondarySoft: '#241A3D', accent: '#33E0FF', accentSoft: '#12313A' }, dark: { primary: '#6AB4FF', primaryPressed: '#8FC6FF', primarySoft: '#16273F', secondary: '#C08CFF', secondarySoft: '#2C1F44', accent: '#4DF0FF', accentSoft: '#123640' } }
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
  },

  // --- Kinzae additive theme collection (below) ---
  kinzae: {
    light: { background: '#F4FBFE', backgroundTint: '#E4F5FC', surface: '#FFFFFF', surfaceSecondary: '#EAF6FB', surfaceElevated: '#FFFFFF', text: '#142A38', textSecondary: '#3B5666', textMuted: '#63808E', border: '#CDE7F2', borderStrong: '#9FC9DC', divider: '#DCEEF6', inputBackground: '#FBFEFF', inputBorder: '#B7D9E8', placeholder: '#63808E', navigationBackground: '#EAF6FC', navigationInactive: '#5C7A88', overlay: 'rgba(8, 32, 44, 0.60)', shadow: '#0F3A4D' },
    dark: { background: '#081824', backgroundTint: '#0E2331', surface: '#0F2836', surfaceSecondary: '#133040', surfaceElevated: '#183849', text: '#EAF7FD', textSecondary: '#C7E3ED', textMuted: '#98BAC8', border: '#1E4356', borderStrong: '#2E5A70', divider: '#1A3B4C', inputBackground: '#0C202C', inputBorder: '#2C5468', placeholder: '#86ABB9', navigationBackground: '#0B2029', navigationInactive: '#93B5C3', overlay: 'rgba(2, 10, 15, 0.82)', shadow: '#010A0F' }
  },
  sunshine: {
    light: { background: '#FFF6DF', backgroundTint: '#FCEAC0', surface: '#FFFCF2', surfaceSecondary: '#FBEFD2', surfaceElevated: '#FFFFFF', text: '#3B2C0E', textSecondary: '#6B5322', textMuted: '#8C7440', border: '#F0DBA0', borderStrong: '#DEBE68', divider: '#F5E7BE', inputBackground: '#FFFBF0', inputBorder: '#E2C787', placeholder: '#8C7440', navigationBackground: '#FCECC4', navigationInactive: '#8A7238', overlay: 'rgba(59, 44, 14, 0.60)', shadow: '#4A3A12' },
    dark: { background: '#241A08', backgroundTint: '#33260D', surface: '#2E220C', surfaceSecondary: '#392A0F', surfaceElevated: '#453313', text: '#FFF6DE', textSecondary: '#F0DFAE', textMuted: '#C7AF78', border: '#4E3B16', borderStrong: '#6E541F', divider: '#443410', inputBackground: '#2A1F0A', inputBorder: '#63491B', placeholder: '#B99F65', navigationBackground: '#2A1F0B', navigationInactive: '#C2A96E', overlay: 'rgba(10, 7, 2, 0.82)', shadow: '#0A0701' }
  },
  kinzaeRose: {
    light: { background: '#FFF1F6', backgroundTint: '#FBDFEA', surface: '#FFFBFD', surfaceSecondary: '#FCE7EF', surfaceElevated: '#FFFFFF', text: '#3A1D2A', textSecondary: '#63404F', textMuted: '#8C6C77', border: '#F3CEDE', borderStrong: '#DEA6C0', divider: '#F7DEE8', inputBackground: '#FFFAFC', inputBorder: '#E6B9CE', placeholder: '#8C6C77', navigationBackground: '#FCE4EF', navigationInactive: '#8A6470', overlay: 'rgba(58, 29, 42, 0.60)', shadow: '#5C2A3D' },
    dark: { background: '#200E17', backgroundTint: '#2E1420', surface: '#2A121D', surfaceSecondary: '#351826', surfaceElevated: '#41202F', text: '#FFF1F7', textSecondary: '#F0D6E1', textMuted: '#C9A3B4', border: '#4A2434', borderStrong: '#6C3549', divider: '#3E1C2B', inputBackground: '#240F1A', inputBorder: '#5E2D41', placeholder: '#B98A9C', navigationBackground: '#240F1B', navigationInactive: '#C193A5', overlay: 'rgba(10, 4, 7, 0.84)', shadow: '#080305' }
  },
  kinzaeOcean: {
    light: { background: '#EAF8FD', backgroundTint: '#D5F0FA', surface: '#FBFEFF', surfaceSecondary: '#E3F3FA', surfaceElevated: '#FFFFFF', text: '#0E2C38', textSecondary: '#345863', textMuted: '#5C7F89', border: '#C4E6F0', borderStrong: '#92CBDD', divider: '#D7EDF5', inputBackground: '#F7FDFF', inputBorder: '#ABD8E7', placeholder: '#5C7F89', navigationBackground: '#E1F2FA', navigationInactive: '#557682', overlay: 'rgba(8, 36, 46, 0.60)', shadow: '#0C3A48' },
    dark: { background: '#061A22', backgroundTint: '#0B2732', surface: '#0D2A34', surfaceSecondary: '#113340', surfaceElevated: '#163E4C', text: '#E6F7FC', textSecondary: '#C0E1EA', textMuted: '#92B9C4', border: '#1B4350', borderStrong: '#2A5A6A', divider: '#163847', inputBackground: '#091F28', inputBorder: '#275564', placeholder: '#7FA7B4', navigationBackground: '#081C24', navigationInactive: '#89B0BC', overlay: 'rgba(1, 9, 12, 0.84)', shadow: '#010609' }
  },
  emerald: {
    light: { background: '#F0FAF4', backgroundTint: '#DFF3E6', surface: '#FCFFFC', surfaceSecondary: '#E7F5EC', surfaceElevated: '#FFFFFF', text: '#16301F', textSecondary: '#35543F', textMuted: '#5C7A64', border: '#CBE7D5', borderStrong: '#A0CDAF', divider: '#DCEEE1', inputBackground: '#F8FDF9', inputBorder: '#B3DAC0', placeholder: '#5C7A64', navigationBackground: '#E6F5EA', navigationInactive: '#517A5C', overlay: 'rgba(15, 40, 25, 0.60)', shadow: '#1A4A2E' },
    dark: { background: '#0A1F14', backgroundTint: '#10301F', surface: '#10291A', surfaceSecondary: '#163420', surfaceElevated: '#1C3F28', text: '#EAFBF0', textSecondary: '#C6E6D2', textMuted: '#98BFA6', border: '#204A2E', borderStrong: '#2E6440', divider: '#1C3E26', inputBackground: '#0D2517', inputBorder: '#2C5A3B', placeholder: '#82AC91', navigationBackground: '#0C2417', navigationInactive: '#8FBB9D', overlay: 'rgba(2, 12, 6, 0.84)', shadow: '#010A04' }
  },
  aurora: {
    light: { background: '#F7F3FE', backgroundTint: '#ECE3FB', surface: '#FDFCFF', surfaceSecondary: '#F0E9FA', surfaceElevated: '#FFFFFF', text: '#271B42', textSecondary: '#48396B', textMuted: '#6E5F8C', border: '#DED0F5', borderStrong: '#BCA3E6', divider: '#E7DCF7', inputBackground: '#FAF8FF', inputBorder: '#C7B2EA', placeholder: '#6E5F8C', navigationBackground: '#EFE7FC', navigationInactive: '#6A5C88', overlay: 'rgba(30, 18, 55, 0.62)', shadow: '#34206A' },
    dark: { background: '#150E26', backgroundTint: '#1F1536', surface: '#1C1332', surfaceSecondary: '#24193F', surfaceElevated: '#2D204D', text: '#F5F0FF', textSecondary: '#DBCEF2', textMuted: '#B4A2D6', border: '#362A54', borderStrong: '#4D3B70', divider: '#2C2145', inputBackground: '#180F2A', inputBorder: '#453569', placeholder: '#9F8CC4', navigationBackground: '#170E28', navigationInactive: '#AD9AD0', overlay: 'rgba(6, 3, 14, 0.86)', shadow: '#030108' }
  },
  midnightGold: {
    // Deliberately dark-charcoal in BOTH appearances — this personality's identity is
    // "near-black, gold, warm cream" regardless of the light/dark toggle, so it never
    // collapses into a plain white surface. "light" here means the lighter of the two
    // charcoals, not an actual light background.
    light: { background: '#262115', backgroundTint: '#2E2818', surface: '#241F15', surfaceSecondary: '#2C2619', surfaceElevated: '#352E1D', text: '#F5EEDA', textSecondary: '#D8CBA6', textMuted: '#AC9E79', border: '#3A331F', borderStrong: '#52492A', divider: '#2E2919', inputBackground: '#1A1710', inputBorder: '#4A4126', placeholder: '#9C8E6C', navigationBackground: '#18160F', navigationInactive: '#A0906B', overlay: 'rgba(5, 4, 2, 0.70)', shadow: '#000000' },
    dark: { background: '#0E0C08', backgroundTint: '#17140D', surface: '#151209', surfaceSecondary: '#1B170F', surfaceElevated: '#221D13', text: '#F8F1DC', textSecondary: '#DFD3AE', textMuted: '#B3A47D', border: '#322B18', borderStrong: '#473D22', divider: '#261F13', inputBackground: '#110F08', inputBorder: '#3E3520', placeholder: '#9C8D66', navigationBackground: '#0F0D08', navigationInactive: '#A79862', overlay: 'rgba(2, 2, 1, 0.82)', shadow: '#000000' }
  },
  midnightNeon: {
    // Same reasoning as Midnight Gold: always a deep navy/near-black, with "light" being the
    // lighter of the two navy depths rather than an actual light surface.
    light: { background: '#131A2E', backgroundTint: '#1B2540', surface: '#161E36', surfaceSecondary: '#1D2745', surfaceElevated: '#24305A', text: '#EAF1FF', textSecondary: '#C6D3F2', textMuted: '#98A8CE', border: '#2C3B63', borderStrong: '#3F5389', divider: '#232E50', inputBackground: '#161F3B', inputBorder: '#3C4F80', placeholder: '#8C9DC6', navigationBackground: '#141C33', navigationInactive: '#92A2C8', overlay: 'rgba(3, 6, 16, 0.70)', shadow: '#000000' },
    dark: { background: '#070A16', backgroundTint: '#0D1226', surface: '#0B0F20', surfaceSecondary: '#101528', surfaceElevated: '#161C34', text: '#F0F5FF', textSecondary: '#D2DAF5', textMuted: '#A2AEDA', border: '#212A4C', borderStrong: '#303C68', divider: '#1A2140', inputBackground: '#090D1C', inputBorder: '#2E3A66', placeholder: '#8B96C6', navigationBackground: '#070A18', navigationInactive: '#96A2D2', overlay: 'rgba(1, 2, 8, 0.86)', shadow: '#000000' }
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
