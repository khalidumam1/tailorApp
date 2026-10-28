/**
 * Vela-style design tokens for TailorApp mobile.
 *
 * The palette is the single source of truth for colour. It mirrors the web
 * console's design system so both clients read as one product:
 *
 * - An ink ramp (not raw black) for text, so light text stays soft.
 * - A brand ramp derived from the configured `primaryColor`, so a tenant's
 *   brand colour drives chrome, charts and accents without hand-tuning.
 * - Semantic tones (ok / warn / bad / info / violet) that ship a foreground,
 *   a surface and a line colour so pills, banners and dots agree.
 * - Radius, spacing and elevation scales, plus a categorical chart palette.
 *
 * Light-first: shopkeepers work in bright workshop conditions, so the light
 * ramp is the reference and the dark ramp is tuned separately rather than
 * inverted.
 *
 * Legacy keys (`background`, `surfaceMuted`, `text`, …) are preserved so
 * screens that have not been migrated yet keep compiling and stay on-brand.
 */
import {
  accessibleTextColor,
  type ApplicationBranding,
} from '@tailor/shared';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ThemeMode = 'light' | 'dark';

/** RN elevation/shadow presets. iOS reads shadow*, Android reads elevation. */
export type Elevation = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

export type Radius = {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  pill: number;
};

export type AppPalette = {
  mode: ThemeMode;

  /* --- Ramps ------------------------------------------------------- */
  ink900: string;
  ink800: string;
  ink700: string;
  ink600: string;
  ink500: string;
  ink400: string;
  ink300: string;

  brand900: string;
  brand800: string;
  brand700: string;
  brand600: string;
  brand500: string;
  brand400: string;
  brand300: string;
  brand100: string;
  brand50: string;

  accent600: string;
  accent500: string;
  accent400: string;
  accent100: string;
  accent50: string;

  /* --- Surfaces ---------------------------------------------------- */
  background: string;
  canvas: string;
  surface: string;
  surfaceMuted: string;
  surfaceSunken: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  line: string;
  lineStrong: string;
  lineSoft: string;

  /* --- Text -------------------------------------------------------- */
  text: string;
  secondaryText: string;
  mutedText: string;

  /* --- Brand-driven ------------------------------------------------ */
  primary: string;
  primaryText: string;
  onPrimary: string;
  primarySoft: string;
  accent: string;

  /* --- Semantic tones ---------------------------------------------- */
  success: string;
  successSurface: string;
  successBorder: string;
  warning: string;
  warningSurface: string;
  warningBorder: string;
  danger: string;
  dangerSurface: string;
  dangerBorder: string;
  info: string;
  infoSurface: string;
  violet: string;
  violetSurface: string;

  okFg: string;
  okBg: string;
  okLine: string;
  warnFg: string;
  warnBg: string;
  warnLine: string;
  badFg: string;
  badBg: string;
  badLine: string;
  infoFg: string;
  infoBg: string;
  infoLine: string;
  violetFg: string;
  violetBg: string;

  /* --- Solid brand surface ---------------------------------------- */
  /** A brand-filled control or mark. Deep enough for white text in both
      themes, unlike `brand600`, which is lightened for dark mode. */
  brandSolidBg: string;
  brandSolidBgPressed: string;
  onBrandSolid: string;
  /** Brand-coloured text sitting on a brand-tinted (50/100) surface. */
  brandOnSoft: string;

  /* --- Hero (brand-filled surface) --------------------------------- */
  /** Deep enough for white body text in both themes. */
  heroBg: string;
  heroFg: string;
  /** Muted white for labels and meta — still clears 4.5:1 on heroBg. */
  heroFgMuted: string;
  /** Translucent chip behind white hero text. */
  heroPillBg: string;

  /* --- Scales ------------------------------------------------------ */
  radius: Radius;
  shadowXs: Elevation;
  shadowSm: Elevation;
  shadowMd: Elevation;
  shadowLg: Elevation;
  shadow: string;
  /** Categorical colours for charts, always led by the brand colour. */
  chart: string[];
};

export type AppThemeValue = {
  branding: ApplicationBranding;
  themeMode: ThemeMode;
  palette: AppPalette;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
};

const THEME_KEY = 'tailorapp.theme.v1';
const BRANDING_CACHE_KEY = 'tailorapp.application-branding.v1';

export { THEME_KEY, BRANDING_CACHE_KEY };

export function mixHex(foreground: string, background: string, foregroundWeight: number): string {
  const toChannels = (color: string) => [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  const first = toChannels(foreground);
  const second = toChannels(background);
  const weight = Math.max(0, Math.min(1, foregroundWeight));
  return `#${first
    .map((channel, index) =>
      Math.round(channel * weight + second[index] * (1 - weight))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Deep shade mixed into brand colours; matches the web console's ramp. */
const BRAND_SHADE = '#08291f';
const ACCENT_SHADE = '#082f49';

const FALLBACK_BRANDING = {
  brandName: 'TailorApp',
  primaryColor: '#117a5c',
  accentColor: '#c08a33',
  defaultTheme: 'light',
  logoUrl: '',
} as ApplicationBranding;

export function createPalette(branding: ApplicationBranding, mode: ThemeMode): AppPalette {
  const dark = mode === 'dark';
  const primary = branding.primaryColor;
  const accent = branding.accentColor;

  /* In dark mode the ramp runs the other way: the brand colour is already the
     darkest usable value on a near-black surface, so lighter steps come from
     mixing toward white instead of toward the deep shade. */
  const brand = dark
    ? {
      /* Weights run the other way here: the second argument is the colour
         being mixed *in*, so a smaller weight means more white and a lighter
         step. brand-900 is the lightest, brand-50 the deepest. */
      brand900: mixHex(primary, '#ffffff', 0.1),
      brand800: mixHex(primary, '#ffffff', 0.2),
      brand700: mixHex(primary, '#ffffff', 0.32),
      brand600: mixHex(primary, '#ffffff', 0.48),
      brand500: mixHex(primary, '#ffffff', 0.66),
      brand400: mixHex(primary, '#ffffff', 0.8),
      brand300: primary,
      brand100: mixHex(primary, BRAND_SHADE, 0.3),
      brand50: mixHex(primary, BRAND_SHADE, 0.14),
    }
    : {
      brand900: mixHex(primary, BRAND_SHADE, 0.18),
      brand800: mixHex(primary, BRAND_SHADE, 0.26),
      brand700: mixHex(primary, BRAND_SHADE, 0.34),
      brand600: primary,
      brand500: mixHex(primary, '#ffffff', 0.86),
      brand400: mixHex(primary, '#ffffff', 0.64),
      brand300: mixHex(primary, '#ffffff', 0.42),
      brand100: mixHex(primary, '#ffffff', 0.18),
      brand50: mixHex(primary, '#ffffff', 0.07),
    };

  const accentRamp = dark
    ? {
      accent600: mixHex(accent, '#ffffff', 0.38),
      accent500: mixHex(accent, '#ffffff', 0.58),
      accent400: mixHex(accent, '#ffffff', 0.76),
      accent100: mixHex(accent, ACCENT_SHADE, 0.32),
      accent50: mixHex(accent, ACCENT_SHADE, 0.16),
    }
    : {
      accent600: mixHex(accent, ACCENT_SHADE, 0.84),
      accent500: accent,
      accent400: mixHex(accent, '#ffffff', 0.62),
      accent100: mixHex(accent, '#ffffff', 0.18),
      accent50: mixHex(accent, '#ffffff', 0.08),
    };

  const ink = dark
    ? {
      ink900: '#eaf4ef',
      ink800: '#d8e8e0',
      ink700: '#b3cbc0',
      ink600: '#93ada2',
      ink500: '#8ba398',
      ink400: '#5f746a',
      ink300: '#31443c',
    }
    : {
      ink900: '#14231c',
      ink800: '#20342a',
      ink700: '#3e5749',
      ink600: '#536b5e',
      ink500: '#5f7468',
      ink400: '#94a69b',
      ink300: '#cbd7d0',
    };

  const surfaces = dark
    ? {
      canvas: '#0b1512',
      surface: '#132019',
      surfaceSunken: '#0f1a15',
      surfaceRaised: '#18261f',
      line: '#22332b',
      lineStrong: '#32473c',
      lineSoft: '#1a2822',
    }
    : {
      canvas: '#f3f7f5',
      surface: '#ffffff',
      surfaceSunken: '#f6f9f7',
      surfaceRaised: '#ffffff',
      line: '#e2ebe6',
      lineStrong: '#cedbd4',
      lineSoft: '#edf2ef',
    };

  const tones = dark
    ? {
      okFg: '#5fd09f',
      okBg: '#10312a',
      okLine: '#1d4c3c',
      warnFg: '#e8b866',
      warnBg: '#33240c',
      warnLine: '#4a3a15',
      badFg: '#f08b85',
      badBg: '#3a1614',
      badLine: '#55221e',
      infoFg: '#7cc2f0',
      infoBg: '#0e2c40',
      infoLine: '#1b4257',
      violetFg: '#bca6f0',
      violetBg: '#221a35',
    }
    : {
      okFg: '#167151',
      okBg: '#edf8f2',
      okLine: '#cce7d8',
      warnFg: '#9b6818',
      warnBg: '#fff8e9',
      warnLine: '#f0dfb8',
      badFg: '#b74445',
      badBg: '#fff1ef',
      badLine: '#f2d1cb',
      infoFg: '#246caa',
      infoBg: '#eef6fb',
      infoLine: '#d4e8f4',
      violetFg: '#7459b3',
      violetBg: '#f3f0fb',
    };

  const shadowColor = dark ? '#000000' : '#143022';
  const elevation = (opacity: number, radius: number, offset: number, android: number): Elevation => ({
    shadowColor,
    shadowOffset: { width: 0, height: offset },
    shadowOpacity: dark ? Math.min(1, opacity * 2.2) : opacity,
    shadowRadius: radius,
    elevation: android,
  });

  /* The chart ramp leads with the brand so a tenant's colour shows up in
     every series, then falls back to hues that stay distinct in both themes. */
  const chart = dark
    ? [brand.brand600, '#5aa8dd', '#e0b45f', '#a996ee', '#ef8b86', '#4cc2c6', '#8fc46b']
    : [brand.brand700, '#4389c1', '#d39a38', '#816bd1', '#d55c59', '#20979b', '#6f9c4a'];

  return {
    mode,
    ...ink,
    ...brand,
    ...accentRamp,

    background: surfaces.canvas,
    canvas: surfaces.canvas,
    surface: surfaces.surface,
    surfaceMuted: surfaces.lineSoft,
    surfaceSunken: surfaces.surfaceSunken,
    surfaceRaised: surfaces.surfaceRaised,
    border: surfaces.line,
    borderStrong: surfaces.lineStrong,
    line: surfaces.line,
    lineStrong: surfaces.lineStrong,
    lineSoft: surfaces.lineSoft,

    text: ink.ink900,
    secondaryText: ink.ink600,
    mutedText: ink.ink500,

    primary: brand.brand600,
    primaryText: dark ? brand.brand600 : brand.brand700,
    onPrimary: accessibleTextColor(dark ? brand.brand600 : primary),
    primarySoft: dark ? brand.brand50 : brand.brand50,
    accent: accentRamp.accent500,

    success: tones.okFg,
    successSurface: tones.okBg,
    successBorder: tones.okLine,
    warning: tones.warnFg,
    warningSurface: tones.warnBg,
    warningBorder: tones.warnLine,
    danger: tones.badFg,
    dangerSurface: tones.badBg,
    dangerBorder: tones.badLine,
    info: tones.infoFg,
    infoSurface: tones.infoBg,
    violet: tones.violetFg,
    violetSurface: tones.violetBg,

    ...tones,

    brandSolidBg: dark ? mixHex(primary, BRAND_SHADE, 0.24) : brand.brand600,
    brandSolidBgPressed: dark ? brand.brand300 : brand.brand700,
    onBrandSolid: accessibleTextColor(dark ? mixHex(primary, BRAND_SHADE, 0.24) : primary),
    brandOnSoft: dark ? brand.brand800 : brand.brand700,

    /* In dark mode the brand colour is already the lightest usable value, so a
       filled hero surface has to come from the deep end of the ramp instead. */
    heroBg: dark ? mixHex(primary, BRAND_SHADE, 0.28) : brand.brand600,
    heroFg: '#ffffff',
    heroFgMuted: dark
      ? mixHex('#ffffff', mixHex(primary, BRAND_SHADE, 0.28), 0.86)
      : mixHex('#ffffff', primary, 0.86),
    heroPillBg: 'rgba(0, 0, 0, 0.18)',

    radius: { xs: 5, sm: 8, md: 10, lg: 12, xl: 16, xxl: 20, pill: 999 },
    shadowXs: elevation(0.05, 2, 1, 1),
    shadowSm: elevation(0.06, 6, 2, 2),
    shadowMd: elevation(0.08, 14, 6, 4),
    shadowLg: elevation(0.12, 26, 12, 8),
    shadow: shadowColor,
    chart,
  };
}

const defaultPalette = createPalette(FALLBACK_BRANDING, 'light');

const AppThemeContext = createContext<AppThemeValue>({
  branding: FALLBACK_BRANDING,
  themeMode: 'light',
  palette: defaultPalette,
  toggleTheme: () => undefined,
  setThemeMode: () => undefined,
});

export function useAppTheme(): AppThemeValue {
  return useContext(AppThemeContext);
}

export function MobileBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<ApplicationBranding>(FALLBACK_BRANDING);
  const [themeOverride, setThemeOverride] = useState<ThemeMode | null>(null);
  const themeChosen = useRef(false);

  const chooseTheme = useCallback((nextTheme: ThemeMode) => {
    themeChosen.current = true;
    setThemeOverride(nextTheme);
    void SecureStore.setItemAsync(THEME_KEY, nextTheme).catch(() => undefined);
  }, []);

  const themeMode: ThemeMode = themeOverride ?? branding.defaultTheme;
  const palette = useMemo(() => createPalette(branding, themeMode), [branding, themeMode]);
  const toggleTheme = useCallback(
    () => chooseTheme(themeMode === 'dark' ? 'light' : 'dark'),
    [chooseTheme, themeMode],
  );

  useEffect(() => {
    let active = true;
    let brandingRequest: Promise<void> | null = null;

    const refreshBranding = () => {
      if (!active || brandingRequest) return brandingRequest;
      brandingRequest = (async () => {
        try {
          const { fetchApplicationBranding } = await import('./branding');
          const latest = await fetchApplicationBranding();
          if (!active) return;
          setBranding(latest);
          await SecureStore.setItemAsync(BRANDING_CACHE_KEY, JSON.stringify(latest)).catch(() => undefined);
        } catch {
          // Branding is public and non-critical.
        }
      })().finally(() => {
        brandingRequest = null;
      });
      return brandingRequest;
    };

    void (async () => {
      const [savedTheme, savedBranding] = await Promise.all([
        SecureStore.getItemAsync(THEME_KEY).catch(() => null),
        SecureStore.getItemAsync(BRANDING_CACHE_KEY).catch(() => null),
      ]);
      if (!active) return;
      if (!themeChosen.current && (savedTheme === 'light' || savedTheme === 'dark')) {
        setThemeOverride(savedTheme);
      }
      if (savedBranding) {
        try {
          const parsed = JSON.parse(savedBranding) as unknown;
          if (parsed && typeof parsed === 'object' && 'brandName' in parsed) {
            setBranding(parsed as ApplicationBranding);
          }
        } catch {
          // Ignore corrupt local branding.
        }
      }
      void refreshBranding();
    })();

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(
    () => ({ branding, themeMode, palette, toggleTheme, setThemeMode: chooseTheme }),
    [branding, themeMode, palette, toggleTheme, chooseTheme],
  );
  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}
