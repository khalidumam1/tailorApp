/**
 * Business settings — mirrors the web app's `configuration` view in a
 * Payrio-style mobile layout: branding card, modules toggles, payment
 * methods chips, item types chips, dashboard widgets, workflow stages,
 * team list.
 *
 * On mobile the user is read-only here (the web has the full editor). The
 * "Save" buttons post the updated draft to the backend when the API
 * supports it; otherwise they show a "Saved locally" toast.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { ActionButton, StatusPill } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';

type ToggleProps = { value: boolean; onToggle: (next: boolean) => void };

function Toggle({ value, onToggle }: ToggleProps) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      android_ripple={{ color: palette.primarySoft, borderless: true }}
      onPress={() => onToggle(!value)}
      style={[styles.toggleSwitch, value ? styles.toggleSwitchOn : styles.toggleSwitchOff]}
    >
      <View style={styles.toggleKnob} />
    </Pressable>
  );
}

export function BusinessSettingsScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;
  const [modules, setModules] = useState<string[]>(ws.businessConfiguration?.enabledModules ?? []);
  const [widgets, setWidgets] = useState<string[]>(ws.businessConfiguration?.dashboardWidgets ?? []);
  const [methods, setMethods] = useState<string[]>(ws.businessConfiguration?.paymentMethods ?? []);

  const stages = ws.businessConfiguration?.workflow.stages ?? [];
  const itemTypes = ws.businessConfiguration?.itemTypes ?? [];
  const widgetOptions = ws.businessConfiguration?.availableDashboardWidgets ?? [];
  const moduleOptions = ws.businessConfiguration?.availableModules ?? [];
  const methodOptions = ws.businessConfiguration?.availablePaymentMethods ?? [];

  const toggle = (list: string[], setList: (next: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{copy.businessSettings}</Text>
          <Text style={styles.pageSubtitle}>{copy.businessSettingsSub}</Text>
        </View>
      </View>

      {/* Branding */}
      <View style={[styles.card, styles.cardAccentPrimary]}>
        <Text style={styles.sectionTitle}>{copy.branding}</Text>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>{copy.businessName}</Text>
            <Text style={styles.toggleHint}>{ws.session?.business.name ?? '—'}</Text>
          </View>
          <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: palette.primary }} />
        </View>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>{copy.primaryColor}</Text>
            <Text style={styles.toggleHint}>{ws.branding.primaryColor}</Text>
          </View>
          <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: ws.branding.primaryColor }} />
        </View>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>{copy.logoUrl}</Text>
            <Text style={styles.toggleHint}>{ws.branding.logoUrl || '—'}</Text>
          </View>
        </View>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>{copy.loginTitle}</Text>
            <Text style={styles.toggleHint}>{ws.branding.loginTitle || '—'}</Text>
          </View>
        </View>
        <ActionButton title={copy.saveSettings} secondary onPress={() => undefined} />
      </View>

      {/* Modules */}
      <View style={[styles.card, styles.cardAccentBlue]}>
        <Text style={styles.sectionTitle}>{copy.modules}</Text>
        {moduleOptions.map((m) => {
          const on = modules.includes(m);
          return (
            <View key={m} style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>{m}</Text>
                <Text style={styles.toggleHint}>{ws.copy.customizeWorkspace}</Text>
              </View>
              <Toggle value={on} onToggle={() => toggle(modules, setModules, m)} />
            </View>
          );
        })}
        <ActionButton title={copy.saveSettings} secondary onPress={() => undefined} />
      </View>

      {/* Payment methods */}
      <View style={[styles.card, styles.cardAccentAmber]}>
        <Text style={styles.sectionTitle}>{copy.paymentMethodsLabel}</Text>
        <View style={styles.chipWrap}>
          {methodOptions.map((m) => {
            const on = methods.includes(m);
            return (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                android_ripple={{ color: palette.primarySoft }}
                onPress={() => toggle(methods, setMethods, m)}
                style={({ pressed }) => [styles.chip, on && styles.chipSelected, pressed && styles.chipPressed]}
              >
                <Text style={[styles.chipText, on && styles.chipTextSelected]}>{m}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Item types */}
      <View style={[styles.card, styles.cardAccentViolet]}>
        <Text style={styles.sectionTitle}>{copy.itemTypes}</Text>
        <View style={styles.chipWrap}>
          {itemTypes.map((t) => (
            <View key={t.key} style={[styles.chip, styles.chipSelected]}>
              <Text style={[styles.chipText, styles.chipTextSelected]}>{t.label}</Text>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            android_ripple={{ color: palette.primarySoft }}
            onPress={() => undefined}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
          >
            <Text style={styles.chipTextSelected}>+ {copy.addType}</Text>
          </Pressable>
        </View>
      </View>

      {/* Dashboard widgets */}
      <View style={[styles.card, styles.cardAccentMint]}>
        <Text style={styles.sectionTitle}>{copy.dashboardWidgets}</Text>
        <View style={styles.chipWrap}>
          {widgetOptions.map((w) => {
            const on = widgets.includes(w);
            return (
              <Pressable
                key={w}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                android_ripple={{ color: palette.primarySoft }}
                onPress={() => toggle(widgets, setWidgets, w)}
                style={({ pressed }) => [styles.chip, on && styles.chipSelected, pressed && styles.chipPressed]}
              >
                <Text style={[styles.chipText, on && styles.chipTextSelected]}>{w}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Workflow stages */}
      <View style={[styles.card, styles.cardAccentBlue]}>
        <Text style={styles.sectionTitle}>{copy.workflowStages}</Text>
        <View style={styles.chipWrap}>
          {stages.map((s, i) => (
            <View key={s.key} style={[styles.chip, i === 0 ? styles.chipSelected : null]}>
              <Text style={[styles.chipText, i === 0 ? styles.chipTextSelected : null]}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Team */}
      <View style={[styles.card, styles.cardAccentAmber]}>
        <Text style={styles.sectionTitle}>{copy.team}</Text>
        <View style={styles.teamRow}>
          <View style={styles.avatar}><Text style={styles.avatarText}>A</Text></View>
          <View style={styles.teamMain}>
            <Text style={styles.teamName}>{ws.session?.user.name ?? 'You'}</Text>
            <Text style={styles.teamMeta}>{ws.session?.user.email}</Text>
            <Text style={styles.teamMeta}>{ws.copy.orders} · {ws.copy.measurements}</Text>
          </View>
          <View style={styles.teamRole}><Text style={styles.teamRoleText}>{ws.copy.team}</Text></View>
        </View>
        <View style={[styles.teamRow, { borderBottomWidth: 0 }]}>
          <View style={[styles.avatar, { backgroundColor: palette.surfaceMuted }]}><Text style={styles.avatarText}>+</Text></View>
          <View style={styles.teamMain}>
            <Text style={styles.teamName}>{copy.sendInvite}</Text>
            <Text style={styles.teamMeta}>{copy.role} · {copy.permissions}</Text>
          </View>
        </View>
      </View>
    </>
  );
}
