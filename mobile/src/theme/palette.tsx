/**
 * Payrio-inspired dark theme for TailorApp.
 *
 * The mobile app now defaults to a deep near-black surface with a hero emerald
 * card, large numeric hero amounts and high-contrast typography — the same
 * language Payrio uses for finance apps. A light variant is still available
 * via the toggle in Settings for users who prefer a bright workshop.
 *
 * The primary colour is always the brand's configurable `primaryColor`; this
 * palette only defines the surface, text and semantic tokens around it.
 */
import {
  accessibleTextColor,
  applicationBrandingSchema,
  DEFAULT_APPLICATION_BRANDING,
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

export type AppPalette = {
  mode: ThemeMode;
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  text: string;
  secondaryText: string;
  mutedText: string;
  primary: string;
  primaryText: string;
  onPrimary: string;
  primarySoft: string;
  accent: string;
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
  shadow: string;
  moneySurface: string;
  moneyLabel: string;
  // The hero card and analytics hero both rely on these tokens:
  heroBackground: string;
  heroBorder: string;
  heroShadow: string;
  glassBar: string;
  glassBarBorder: string;
  glassBarText: string;
  glassBarTextActive: string;
};

export type AppThemeValue = {
  branding: ApplicationBranding;
  themeMode: ThemeMode;
  palette: AppPalette;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
};

const LANGUAGE_KEY = 'tailorapp.language.v1';
const THEME_KEY = 'tailorapp.theme.v1';
const BRANDING_CACHE_KEY = 'tailorapp.application-branding.v1';

export { LANGUAGE_KEY, THEME_KEY, BRANDING_CACHE_KEY };

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

export function createPalette(branding: ApplicationBranding, mode: ThemeMode): AppPalette {
  const dark = mode === 'dark';
  // The dark surface is a near-black with a green undertone; the hero card is
  // a slightly lighter emerald so the user's brand colour reads against it.
  const darkBackground = '#0a1310';
  const darkSurface = '#121e18';
  const darkSurfaceMuted = '#0f1a14';
  const darkSurfaceSunken = '#070d0a';
  const darkHero = '#163024';
  const darkBorder = '#22332a';
  const darkBorderStrong = '#324a3c';
  const darkText = '#e7f1eb';
  const darkSecondary = '#9eb3a6';
  const darkMuted = '#6f8678';

   return {
     mode,
     background: dark ? darkBackground : '#f4f6f4',
     surface: dark ? darkSurface : '#ffffff',
     surfaceMuted: dark ? darkSurfaceMuted : '#f8faf9',
     surfaceSunken: dark ? darkSurfaceSunken : '#eef2ef',
     border: dark ? darkBorder : '#e3e9e5',
     borderStrong: dark ? darkBorderStrong : '#d8e2dc',
     text: dark ? mixHex(darkText, '#ffffff', 0.9) : '#182a25',
     secondaryText: dark ? darkSecondary : '#56675d',
     mutedText: dark ? mixHex(darkMuted, '#ffffff', 0.8) : '#6e7d76',
     primary: branding.primaryColor,
     primaryText: dark
       ? mixHex(branding.primaryColor, '#ffffff', 0.65)
       : mixHex('#0e1a16', branding.primaryColor, 0.32),
     onPrimary: accessibleTextColor(branding.primaryColor),
     primarySoft: dark
       ? mixHex(branding.primaryColor, '#0c1a14', 0.18)
       : mixHex(branding.primaryColor, '#ffffff', 0.08),
     accent: branding.accentColor,
     success: dark ? '#6cc08f' : '#1b6c4c',
     successSurface: dark ? '#0f2a1c' : '#e8f5ee',
     successBorder: dark ? '#1f4830' : '#cae5d6',
     warning: dark ? '#e6b866' : '#8a6413',
     warningSurface: dark ? '#2a2113' : '#fdf4e3',
     warningBorder: dark ? '#4a3b1d' : '#f0e0bb',
     danger: dark ? '#d97a6f' : '#9b4034',
     dangerSurface: dark ? '#2c1815' : '#fdeeeb',
     dangerBorder: dark ? '#52281f' : '#f3d6cf',
     info: dark ? '#7aa3ce' : '#2d5f8a',
     infoSurface: dark ? '#0f2236' : '#ecf3fa',
     shadow: dark ? '#000000' : '#18372b',
     moneySurface: dark ? '#163024' : '#17362e',
     moneyLabel: dark ? '#8fa896' : '#c4d9ce',
     heroBackground: dark
       ? `linear-gradient(140deg, ${mixHex(branding.primaryColor, darkHero, 0.65)} 0%, ${darkHero} 80%)`
       : mixHex(branding.primaryColor, '#ffffff', 0.04),
     heroBorder: dark ? mixHex(branding.primaryColor, '#0a1310', 0.5) : mixHex(branding.primaryColor, '#ffffff', 0.35),
     heroShadow: dark ? '#000000' : mixHex(branding.primaryColor, '#000000', 0.15),
     glassBar: dark ? 'rgba(12, 20, 16, 0.9)' : 'rgba(250, 250, 250, 0.92)',
     glassBarBorder: dark ? '#22332a' : '#e3e9e5',
     glassBarText: dark ? '#8fa896' : '#6e7d76',
     glassBarTextActive: dark ? mixHex(branding.primaryColor, '#ffffff', 0.6) : mixHex('#0e1a16', branding.primaryColor, 0.3),
   };
}

const defaultPalette = createPalette(DEFAULT_APPLICATION_BRANDING, 'dark');

const AppThemeContext = createContext<AppThemeValue>({
  branding: DEFAULT_APPLICATION_BRANDING,
  themeMode: 'dark',
  palette: defaultPalette,
  toggleTheme: () => undefined,
  setThemeMode: () => undefined,
});

export function useAppTheme(): AppThemeValue {
  return useContext(AppThemeContext);
}

export function MobileBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<ApplicationBranding>(DEFAULT_APPLICATION_BRANDING);
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
          // Branding is public and non-critical; use the cached or built-in identity offline.
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
          const parsed = applicationBrandingSchema.safeParse(JSON.parse(savedBranding) as unknown);
          if (parsed.success) setBranding(parsed.data);
        } catch {
          // Ignore corrupt local branding; the server/default remains authoritative.
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
