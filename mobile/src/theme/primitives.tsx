/**
 * UI primitives for TailorApp mobile.
 *
 * These are the shared building blocks every screen composes: cards, KPI
 * tiles, pills, rows, segmented controls and form controls. Keeping them here
 * means a screen describes *what* it shows, and the system decides how it
 * looks — which is what keeps 18 screens visually consistent.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from 'react-native';
import { SvgUri, SvgXml } from 'react-native-svg';
import {
  parseConfigurableLogoUrl,
  renderConfigurableLogoSvg,
  type LogoStyleKey,
} from '@tailor/shared';
import { Icon, type IconName } from '../Icons';
import { useAppTheme } from './palette';
import { useAppStyles } from './useAppStyles';
import { resolveBrandAssetUrl } from './branding';
import { Sparkline } from '../components/Charts';

export type Tone = 'mint' | 'amber' | 'red' | 'muted' | 'info' | 'violet' | 'brand';

type ToneStyles = { bg: ViewStyle; fg: { color: string } };

export function useTones(): Record<Tone, ToneStyles> {
  const styles = useAppStyles();
  return {
    mint: { bg: styles.pillMint, fg: styles.pillMintText },
    amber: { bg: styles.pillAmber, fg: styles.pillAmberText },
    red: { bg: styles.pillRed, fg: styles.pillRedText },
    muted: { bg: styles.pillMuted, fg: styles.pillMutedText },
    info: { bg: styles.pillInfo, fg: styles.pillInfoText },
    violet: { bg: styles.pillViolet, fg: styles.pillVioletText },
    brand: { bg: styles.pillBrand, fg: styles.pillBrandText },
  };
}

export function ConfigurableBrandMark({
  logoUrl,
  name,
  primaryColor,
  accentColor,
  defaultStyle = 'shears',
  size = 'sm',
}: {
  logoUrl?: string | null;
  name: string;
  primaryColor: string;
  accentColor: string;
  defaultStyle?: LogoStyleKey;
  size?: 'sm' | 'lg';
}) {
  const { palette } = useAppTheme();
  const styles = useAppStyles();
  const [failedUrl, setFailedUrl] = useState('');
  const parsed = useMemo(
    () => parseConfigurableLogoUrl(logoUrl, {
      style: defaultStyle,
      primaryColor,
      accentColor,
      fallbackName: name,
    }),
    [accentColor, defaultStyle, logoUrl, name, primaryColor],
  );
  const svgXml = useMemo(() => renderConfigurableLogoSvg(parsed, name), [name, parsed]);
  const rawUrl = (logoUrl ?? '').trim();
  const uri = rawUrl && !parsed.isConfigurablePreset ? resolveBrandAssetUrl(rawUrl) : '';
  useEffect(() => setFailedUrl(''), [uri]);
  const isSvg = /\.svg(?:$|[?#])/i.test(uri);
  const markStyle = size === 'lg' ? styles.authBrandMark : styles.brandMark;
  const letterStyle = size === 'lg' ? styles.authBrandLetter : styles.brandLetter;
  const dim = size === 'lg' ? 64 : 38;
  const fontSize = size === 'lg' ? 28 : 17;

  return (
    <View style={[markStyle, { backgroundColor: palette.brand600 }]}>
      <Text style={[letterStyle, { color: palette.onPrimary, fontSize }]}>
        {parsed.monogram.charAt(0) || 'A'}
      </Text>
      <View style={[StyleSheet.absoluteFill, styles.logoImage]}>
        <SvgXml xml={svgXml} width={dim} height={dim} />
      </View>
      {uri && failedUrl !== uri
        ? isSvg
          ? (
            <View style={[StyleSheet.absoluteFill, styles.logoImage]}>
              <SvgUri uri={uri} width={dim} height={dim} onError={() => setFailedUrl(uri)} />
            </View>
          )
          : (
            <Image source={{ uri }} style={[StyleSheet.absoluteFill, styles.logoImage]} resizeMode="contain" onError={() => setFailedUrl(uri)} />
          )
        : null}
    </View>
  );
}

export function ApplicationMark({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const { branding } = useAppTheme();
  return (
    <ConfigurableBrandMark
      logoUrl={branding.logoUrl}
      name={branding.brandName}
      primaryColor={branding.primaryColor}
      accentColor={branding.accentColor}
      size={size}
    />
  );
}

export function ThemeToggle({ copy, compact = false }: { copy: ReturnType<typeof import('../i18n').getCopy>; compact?: boolean }) {
  const { themeMode, toggleTheme, palette } = useAppTheme();
  const styles = useAppStyles();
  const nextThemeLabel = themeMode === 'dark' ? copy.lightTheme : copy.darkTheme;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={`${copy.appearance}: ${nextThemeLabel}`}
      accessibilityState={{ checked: themeMode === 'dark' }}
      android_ripple={{ color: palette.brand50 }}
      onPress={toggleTheme}
      style={({ pressed }) => [styles.themeToggle, compact && styles.themeToggleCompact, pressed && styles.secondaryButtonPressed]}
    >
      <Icon name={themeMode === 'dark' ? 'sun' : 'moon'} size={20} color={palette.brand700} />
      {!compact ? <Text style={styles.themeToggleText}>{nextThemeLabel}</Text> : null}
    </Pressable>
  );
}

/** Plain surface card. Screens nest rows, charts and lists inside it. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useAppStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Titled section with an optional "view all" style action. */
export function Section({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderTitle}>{title}</Text>
        {actionLabel && onAction ? (
          <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8} android_ripple={{ color: palette.brand50 }}>
            <Text style={styles.sectionHeaderAction}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** KPI tile: uppercase label, big value, delta pill and optional sparkline. */
export function StatCard({
  label,
  value,
  delta,
  deltaSuffix = '%',
  icon,
  spark,
  tone = 'brand',
  style,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaSuffix?: string;
  icon?: IconName;
  spark?: number[];
  tone?: 'brand' | 'mint' | 'amber' | 'red' | 'info' | 'violet' | 'muted';
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const iconTint = {
    brand: { bg: palette.brand50, fg: palette.brand700 },
    mint: { bg: palette.okBg, fg: palette.okFg },
    amber: { bg: palette.warnBg, fg: palette.warnFg },
    red: { bg: palette.badBg, fg: palette.badFg },
    info: { bg: palette.infoBg, fg: palette.infoFg },
    violet: { bg: palette.violetBg, fg: palette.violetFg },
    muted: { bg: palette.surfaceSunken, fg: palette.ink500 },
  }[tone];

  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.metricCard, style]}
    >
      <View style={styles.statTop}>
        <Text style={styles.statLabel} numberOfLines={2}>{label}</Text>
        {icon ? (
          <View style={[styles.metricIcon, { position: 'relative', top: 0, right: 0, backgroundColor: iconTint.bg }]}>
            <Icon name={icon} size={16} color={iconTint.fg} />
          </View>
        ) : null}
      </View>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {spark && spark.length > 1 ? (
        <View style={styles.statSpark}>
          <Sparkline data={spark} height={26} color={palette.brand600} />
        </View>
      ) : null}
      {typeof delta === 'number' ? <DeltaPill value={delta} suffix={deltaSuffix} /> : null}
    </View>
  );
}

/** Green up / red down trend badge used by KPI tiles and chart headers. */
export function DeltaPill({ value, suffix = '%', inverted = false }: { value: number; suffix?: string; inverted?: boolean }) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const rounded = Math.round(value * 10) / 10;
  const up = rounded > 0;
  const flat = rounded === 0;
  const label = `${up ? '+' : ''}${rounded}${suffix}`;
  const tone = flat ? styles.statDeltaNeutral : up ? styles.statDeltaUp : styles.statDeltaDown;
  const toneText = flat ? styles.statDeltaNeutralText : up ? styles.statDeltaUpText : styles.statDeltaDownText;
  return (
    <View
      style={[
        styles.statDelta,
        { alignSelf: 'flex-start' },
        inverted ? { backgroundColor: palette.heroPillBg } : tone,
      ]}
    >
      {!flat ? (
        <Icon name={up ? 'arrowUp' : 'arrowDown'} size={11} color={inverted ? palette.heroFg : toneText.color} />
      ) : null}
      <Text style={[styles.statDeltaText, inverted ? { color: palette.heroFg } : toneText]}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ value, max = 1, color, height = 6 }: { value: number; max?: number; color?: string; height?: number }) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={[styles.progressTrack, { height }]}>
      <View style={[styles.progressFill, { height, width: `${ratio * 100}%`, backgroundColor: color ?? palette.brand600 }]} />
    </View>
  );
}

/** List row used for menus, settings and detail screens. */
export function MenuRow({
  icon,
  title,
  meta,
  value,
  onPress,
  tone = 'brand',
  destructive = false,
}: {
  icon?: IconName;
  title: string;
  meta?: string;
  value?: string;
  onPress?: () => void;
  tone?: 'brand' | 'mint' | 'amber' | 'red' | 'info' | 'violet' | 'muted';
  destructive?: boolean;
}) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const iconTint = {
    brand: { bg: palette.brand50, fg: palette.brand700 },
    mint: { bg: palette.okBg, fg: palette.okFg },
    amber: { bg: palette.warnBg, fg: palette.warnFg },
    red: { bg: palette.badBg, fg: palette.badFg },
    info: { bg: palette.infoBg, fg: palette.infoFg },
    violet: { bg: palette.violetBg, fg: palette.violetFg },
    muted: { bg: palette.surfaceSunken, fg: palette.ink500 },
  }[tone];

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'none'}
      accessibilityLabel={title}
      android_ripple={{ color: palette.brand50 }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
    >
      {icon ? (
        <View style={[styles.menuIcon, { backgroundColor: iconTint.bg }]}>
          <Icon name={icon} size={18} color={destructive ? palette.badFg : iconTint.fg} />
        </View>
      ) : null}
      <View style={styles.menuMain}>
        <Text style={[styles.menuTitle, destructive && { color: palette.badFg }]} numberOfLines={1}>{title}</Text>
        {meta ? <Text style={styles.menuMeta} numberOfLines={2}>{meta}</Text> : null}
      </View>
      {value ? <Text style={styles.menuValue} numberOfLines={1}>{value}</Text> : null}
      {onPress ? <Icon name="arrowRight" size={16} color={styles.menuChevron.color as string} /> : null}
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            android_ripple={{ color: palette.brand50 }}
            onPress={() => onChange(option.key)}
            style={[styles.segmentedItem, active && styles.segmentedItemActive]}
          >
            <Text style={[styles.segmentedText, active && styles.segmentedTextActive]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  secureTextEntry,
  editable = true,
  helper,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad' | 'decimal-pad';
  multiline?: boolean;
  secureTextEntry?: boolean;
  editable?: boolean;
  helper?: string;
  maxLength?: number;
}) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        autoCorrect={false}
        keyboardType={keyboardType}
        editable={editable}
        maxLength={maxLength}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={palette.ink400}
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline && styles.multiline, !editable && styles.inputReadonly]}
        value={value}
      />
      {helper ? <Text style={styles.toggleHint}>{helper}</Text> : null}
    </View>
  );
}

export function ActionButton({
  title,
  onPress,
  secondary = false,
  disabled = false,
  loading = false,
  loadingTitle,
  style,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
  loadingTitle?: string;
  style?: any;
}) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      android_ripple={{ color: secondary ? palette.brand50 : 'rgba(255, 255, 255, 0.24)' }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        secondary && styles.secondaryButton,
        loading && styles.loadingButton,
        disabled && !loading && styles.disabled,
        pressed && !isDisabled && (secondary ? styles.secondaryButtonPressed : styles.actionButtonPressed),
        style,
      ]}
    >
      <View style={styles.actionButtonContent}>
        {loading ? <ActivityIndicator size="small" color={secondary ? palette.brand700 : palette.onPrimary} /> : null}
        <Text style={[styles.actionText, secondary && styles.secondaryText]}>
          {loading ? (loadingTitle ?? title) : title}
        </Text>
      </View>
    </Pressable>
  );
}

export function StatusPill({ tone = 'mint', children }: { tone?: Tone; children: ReactNode }) {
  const styles = useAppStyles();
  const tones = useTones();
  const pick = tones[tone] ?? tones.muted;
  return (
    <View style={[styles.statusPill, pick.bg]}>
      <Text style={[styles.statusPillText, pick.fg]}>{children}</Text>
    </View>
  );
}

export function IconDot({ tone = 'primary', name }: { tone?: 'primary' | 'mint' | 'amber' | 'blue' | 'violet' | 'red' | 'muted'; name: IconName }) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const colorMap: Record<typeof tone, { bg: any; color: string }> = {
    primary: { bg: styles.iconDot, color: palette.brand700 },
    mint: { bg: styles.iconDotMint, color: palette.okFg },
    amber: { bg: styles.iconDotAmber, color: palette.warnFg },
    blue: { bg: styles.iconDotBlue, color: palette.infoFg },
    violet: { bg: styles.iconDotViolet, color: palette.violetFg },
    red: { bg: styles.iconDotRed, color: palette.badFg },
    muted: { bg: styles.iconDotMuted, color: palette.ink500 },
  };
  const pick = colorMap[tone];
  return (
    <View style={pick.bg}>
      <Icon name={name} size={19} color={pick.color} />
    </View>
  );
}

export function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'lg' }) {
  const styles = useAppStyles();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return (
    <View style={size === 'lg' ? styles.avatarLg : styles.avatar}>
      <Text style={size === 'lg' ? styles.avatarTextLg : styles.avatarText}>{initials || '—'}</Text>
    </View>
  );
}

export function EmptyState({ title, detail, action, onAction }: { title: string; detail?: string; action?: string; onAction?: () => void }) {
  const styles = useAppStyles();
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIconWrap}>
        <Icon name="inbox" size={24} color={styles.emptyText.color as string} />
      </View>
      <Text style={styles.listTitle}>{title}</Text>
      {detail ? <Text style={styles.emptyText}>{detail}</Text> : null}
      {action && onAction ? (
        <View style={{ marginTop: 16, alignSelf: 'stretch' }}>
          <ActionButton title={action} onPress={onAction} secondary />
        </View>
      ) : null}
    </View>
  );
}

export function openExternal(url: string, copy: ReturnType<typeof import('../i18n').getCopy>): void {
  void Linking.openURL(url).catch(() => Alert.alert(copy.error));
}
