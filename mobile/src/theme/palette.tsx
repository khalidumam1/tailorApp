/**
 * Simple, clean theme for TailorApp mobile.
 *
 * Light-first design: shopkeepers work in bright workshop conditions.
 * Clean cards, subtle borders, clear typography. No glassmorphism,
 * no excessive gradients, no childish colors.
 *
 * The primary colour is driven by the brand's configurable `primaryColor`.
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

export type AppPalette = {
  mode: ThemeMode;
  background: string;
  surface: string;
  surfaceMuted: string;
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

export function createPalette(branding: ApplicationBranding, mode: ThemeMode): AppPalette {
  const dark = mode === 'dark';

  return {
    mode,
    background: dark ? '#0f1720' : '#f8faf5',
    surface: dark ? '#1e293b' : '#ffffff',
    surfaceMuted: dark ? '#334155' : '#f1f5f0',
    border: dark ? '#475569' : '#e2e8e0',
    borderStrong: dark ? '#64748b' : '#cbd5c1',
    text: dark ? '#f8fafc' : '#0f172a',
    secondaryText: dark ? '#cbd5e1' : '#475569',
    mutedText: dark ? '#94a3b8' : '#6b7b70',
    primary: branding.primaryColor,
    primaryText: dark
      ? mixHex(branding.primaryColor, '#ffffff', 0.6)
      : mixHex('#0f172a', branding.primaryColor, 0.35),
    onPrimary: accessibleTextColor(branding.primaryColor),
    primarySoft: dark
      ? mixHex(branding.primaryColor, '#0f1720', 0.15)
      : mixHex(branding.primaryColor, '#ffffff', 0.12),
    accent: branding.accentColor,
    success: dark ? '#4ade80' : '#15803d',
    successSurface: dark ? '#064e3b' : '#f0fdf4',
    successBorder: dark ? '#1f2937' : '#bbf7d0',
    warning: dark ? '#fbbf24' : '#92400e',
    warningSurface: dark ? '#451a03' : '#fefce8',
    warningBorder: dark ? '#3f3f1f' : '#fef3c7',
    danger: dark ? '#fb7185' : '#b91c1c',
    dangerSurface: dark ? '#450a0a' : '#fef2f2',
    dangerBorder: dark ? '#7f1d1d' : '#fee2e2',
    info: dark ? '#38bdf8' : '#0369a1',
    infoSurface: dark ? '#0c4a6e' : '#eff6ff',
    shadow: dark ? '#000000' : '#000000',
  };
}

const defaultPalette = createPalette(
  { brandName: 'TailorApp', primaryColor: '#0f766e', accentColor: '#d97706', defaultTheme: 'light', logoUrl: '' } as ApplicationBranding,
  'light',
);

const AppThemeContext = createContext<AppThemeValue>({
  branding: { brandName: 'TailorApp', primaryColor: '#0f766e', accentColor: '#d97706', defaultTheme: 'light', logoUrl: '' } as ApplicationBranding,
  themeMode: 'light',
  palette: defaultPalette,
  toggleTheme: () => undefined,
  setThemeMode: () => undefined,
});

export function useAppTheme(): AppThemeValue {
  return useContext(AppThemeContext);
}

export function MobileBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<ApplicationBranding>(
    { brandName: 'TailorApp', primaryColor: '#0f766e', accentColor: '#d97706', defaultTheme: 'light', logoUrl: '' } as ApplicationBranding,
  );
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
