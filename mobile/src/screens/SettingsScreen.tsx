/**
 * Settings — appearance, language, security and session details.
 *
 * Grouped cards with one row per action; the destructive sign-out is set apart
 * in its own card so it is never tapped by accident.
 */
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { ActionButton, Card, MenuRow, Section, Segmented, ThemeToggle } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';
import { ChangePasswordScreen } from './ChangePasswordScreen';
import type { Language } from '../i18n';

export function SettingsScreen() {
  const styles = useAppStyles();
  const ws = useWorkspace();
  const copy = ws.copy;
  const [changingPassword, setChangingPassword] = useState(false);

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>{copy.settings}</Text>
          <Text style={styles.pageSubtitle}>{ws.branding.brandName}</Text>
        </View>
      </View>

      <Section title={copy.appearance}>
        <Card>
          <ThemeToggle copy={copy} />
          <View style={{ marginTop: 12 }}>
            <Text style={styles.listMeta}>{copy.themeDefault}: {ws.branding.defaultTheme === 'dark' ? copy.darkTheme : copy.lightTheme}</Text>
            <Text style={styles.listMeta}>{copy.themePreferenceNote}</Text>
          </View>
        </Card>
      </Section>

      <Section title={copy.language}>
        <Card style={{ padding: 12 }}>
          <Segmented<Language>
            options={ws.languageOptions.map((option) => ({ key: option.id, label: option.label }))}
            value={ws.language}
            onChange={(next) => void ws.setLanguage(next)}
          />
        </Card>
      </Section>

      <Section title="Password">
        <Card style={{ padding: changingPassword ? 16 : 6 }}>
          {changingPassword ? (
            <ChangePasswordScreen forced={false} onCancel={() => setChangingPassword(false)} />
          ) : (
            <MenuRow
              icon="shield"
              title="Change password"
              meta="Use a password only you know. Your administrator can reset it if you forget it."
              onPress={() => setChangingPassword(true)}
            />
          )}
        </Card>
      </Section>

      {ws.session ? (
        <Section title={ws.session.business.name}>
          <Card style={{ padding: 6 }}>
            <MenuRow icon="building" title={ws.session.user.name} meta={ws.session.user.email} />
            {ws.businessConfiguration ? (
              <>
                <View style={styles.divider} />
                <MenuRow
                  icon="spark"
                  title={ws.businessConfiguration.template.name}
                  meta={`${ws.businessConfiguration.business.currency} · ${ws.businessConfiguration.business.timezone}`}
                />
                <View style={styles.divider} />
                <MenuRow
                  icon="check"
                  title="Enabled modules"
                  meta={ws.businessConfiguration.enabledModules.join(', ')}
                />
              </>
            ) : null}
          </Card>
        </Section>
      ) : null}

      <Section title="Session">
        <Card style={{ padding: 6 }}>
          <MenuRow icon="signOut" title={copy.signOut} tone="red" destructive onPress={() => void ws.handleSignOut()} />
        </Card>
      </Section>
    </>
  );
}
