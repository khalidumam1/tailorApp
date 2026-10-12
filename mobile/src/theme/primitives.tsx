/**
 * Common UI primitives: brand mark, theme toggle, field, action button.
 * These are extracted from the original App.tsx and now live in their own
 * file so any screen can compose them.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'react-native';
import { SvgUri } from 'react-native-svg';
import { Icon, type IconName } from '../Icons';
import { useAppTheme } from './palette';
import { useAppStyles } from './useAppStyles';
import { resolveBrandAssetUrl } from './branding';

export function ApplicationMark({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const { branding, palette } = useAppTheme();
  const styles = useAppStyles();
  const [failedUrl, setFailedUrl] = useState('');
  const uri = branding.logoUrl ? resolveBrandAssetUrl(branding.logoUrl) : '';
  useEffect(() => setFailedUrl(''), [uri]);
  const isSvg = /\.svg(?:$|[?#])/i.test(uri);
  const markStyle = size === 'lg' ? styles.authBrandMark : styles.brandMark;
  const letterStyle = size === 'lg' ? styles.authBrandLetter : styles.brandLetter;
  const dim = size === 'lg' ? 64 : 36;
  const fontSize = size === 'lg' ? 30 : 17;

  return (
    <View style={[markStyle, { backgroundColor: palette.primary }]}>
      <Text style={[letterStyle, { color: palette.onPrimary, fontSize }]}>
        {branding.brandName.trim().charAt(0).toUpperCase() || 'A'}
      </Text>
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

export function ThemeToggle({ copy, compact = false }: { copy: ReturnType<typeof import('../i18n').getCopy>; compact?: boolean }) {
  const { themeMode, toggleTheme, palette } = useAppTheme();
  const styles = useAppStyles();
  const nextThemeLabel = themeMode === 'dark' ? copy.lightTheme : copy.darkTheme;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={`${copy.appearance}: ${themeMode === 'dark' ? copy.darkTheme : copy.lightTheme}`}
      accessibilityState={{ checked: themeMode === 'dark' }}
      android_ripple={{ color: palette.primarySoft }}
      onPress={toggleTheme}
      style={({ pressed }) => [styles.themeToggle, compact && styles.themeToggleCompact, pressed && styles.secondaryButtonPressed]}
    >
      <Icon name={themeMode === 'dark' ? 'sun' : 'moon'} size={20} color={palette.primaryText} />
      {!compact ? <Text style={styles.themeToggleText}>{nextThemeLabel}</Text> : null}
    </Pressable>
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
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={palette.mutedText}
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
      android_ripple={{ color: secondary ? palette.primarySoft : 'rgba(255, 255, 255, 0.24)' }}
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
        {loading ? <ActivityIndicator size="small" color={secondary ? palette.primaryText : palette.onPrimary} /> : null}
        <Text style={[styles.actionText, secondary && styles.secondaryText]}>
          {loading ? (loadingTitle ?? title) : title}
        </Text>
      </View>
    </Pressable>
  );
}

export function StatusPill({ tone = 'mint', children }: { tone?: 'mint' | 'amber' | 'red' | 'muted'; children: ReactNode }) {
  const styles = useAppStyles();
  const map = {
    mint: { bg: styles.pillMint, fg: styles.pillMintText },
    amber: { bg: styles.pillAmber, fg: styles.pillAmberText },
    red: { bg: styles.pillRed, fg: styles.pillRedText },
    muted: { bg: styles.pillMuted, fg: styles.pillMutedText },
  } as const;
  const pick = map[tone];
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
    primary: { bg: styles.iconDot, color: palette.primaryText },
    mint: { bg: styles.iconDotMint, color: palette.success },
    amber: { bg: styles.iconDotAmber, color: palette.warning },
    blue: { bg: styles.iconDotBlue, color: palette.info },
    violet: { bg: styles.iconDotViolet, color: '#a995e0' },
    red: { bg: styles.iconDotRed, color: palette.danger },
    muted: { bg: styles.iconDotMuted, color: palette.mutedText },
  };
  const pick = colorMap[tone];
  return (
    <View style={pick.bg}>
      <Icon name={name} size={20} color={pick.color} />
    </View>
  );
}

export function EmptyState({ title, detail, action, onAction }: { title: string; detail?: string; action?: string; onAction?: () => void }) {
  const styles = useAppStyles();
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.listTitle}>{title}</Text>
      {detail ? <Text style={styles.emptyText}>{detail}</Text> : null}
      {action && onAction ? (
        <View style={{ marginTop: 12, alignSelf: 'stretch' }}>
          <ActionButton title={action} onPress={onAction} secondary />
        </View>
      ) : null}
    </View>
  );
}

export function openExternal(url: string, copy: ReturnType<typeof import('../i18n').getCopy>): void {
  void Linking.openURL(url).catch(() => Alert.alert(copy.error));
}
