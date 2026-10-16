/**
 * Settings — clean layout. Language, appearance, business info, sign out.
 */
import { Pressable, Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { ActionButton, ThemeToggle } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';

export function SettingsScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{copy.settings}</Text>
          <Text style={styles.pageSubtitle}>{ws.branding.brandName}</Text>
        </View>
      </View>

      {/* Appearance */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{copy.appearance}</Text>
        <ThemeToggle copy={copy} />
        <Text style={styles.listMeta}>{copy.themeDefault}: {ws.branding.defaultTheme === 'dark' ? copy.darkTheme : copy.lightTheme}</Text>
        <Text style={styles.listMeta}>{copy.themePreferenceNote}</Text>
      </View>

      {/* Language */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{copy.language}</Text>
        {ws.languageOptions.map((option) => {
          const active = ws.language === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              android_ripple={{ color: palette.primarySoft }}
              onPress={() => void ws.setLanguage(option.id)}
              style={({ pressed }) => [styles.languageRow, pressed && styles.languageRowPressed]}
            >
              <Text style={styles.listTitle}>{option.label}</Text>
              <Text style={styles.radio}>{active ? '●' : '○'}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Business info */}
      {ws.session ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{ws.session.business.name}</Text>
          <Text style={styles.listMeta}>{ws.session.user.name} · {ws.session.user.email}</Text>
          {ws.businessConfiguration ? (
            <>
              <Text style={styles.listMeta}>{ws.businessConfiguration.template.name} · {ws.businessConfiguration.business.currency} · {ws.businessConfiguration.business.timezone}</Text>
              <Text style={styles.listMeta}>Enabled: {ws.businessConfiguration.enabledModules.join(', ')}</Text>
            </>
          ) : null}
        </View>
      ) : null}

      <ActionButton title={copy.signOut} onPress={() => void ws.handleSignOut()} secondary />
    </>
  );
}
