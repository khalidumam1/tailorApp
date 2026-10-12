/**
 * Measurements screen — Payrio-style. Shows the latest revision for a
 * selected customer/template in a 2-col grid, plus a history list of
 * prior revisions.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { ActionButton, EmptyState, Field, IconDot } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';
import { interpolate } from '../i18n';

export function MeasurementsScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;
  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  useEffect(() => { void ws.runSync(); }, [ws.runSync]);

  const profiles = useMemo(() => {
    const byKey = new Map<string, { id: string; garmentTemplate: { name: string }; revisions: any[] }>();
    for (const record of ws.measurements) {
      if (record.customer_id !== selectedCustomerId) continue;
      const values = (() => {
        try { return JSON.parse(record.values_json) as Record<string, string>; } catch { return {}; }
      })();
      const profile = byKey.get(record.template_name) ?? { id: record.template_name, garmentTemplate: { name: record.template_name }, revisions: [] };
      profile.revisions.push({
        id: record.id,
        version: record.measured_at,
        measuredAt: record.measured_at,
        values,
        syncState: record.sync_state,
      });
      byKey.set(record.template_name, profile);
    }
    return [...byKey.values()];
  }, [selectedCustomerId, ws.measurements]);

  const allProfiles = useMemo(() => profiles.flatMap((p) => p.revisions), [profiles]);

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{copy.measurements}</Text>
          <Text style={styles.pageSubtitle}>{interpolate(copy.totalCount, String(allProfiles.length))}</Text>
        </View>
        {ws.can('measurements:write') ? (
          <ActionButton title={`＋ ${copy.saveMeasurement}`} onPress={() => ws.setMeasurementForm(!ws.measurementForm)} />
        ) : null}
      </View>

      {/* Customer selector chips */}
      <View style={styles.chipWrap}>
        {ws.customers.map((c) => {
          const active = selectedCustomerId === c.id;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              android_ripple={{ color: palette.primarySoft }}
              onPress={() => setSelectedCustomerId(c.id)}
              style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
            >
              <Text style={[styles.chipText, active && styles.chipTextSelected]}>{c.name}</Text>
            </Pressable>
          );
        })}
      </View>

      {selectedCustomerId ? (
        <>
          {/* Latest revision hero card */}
          {profiles.length > 0 && profiles[0].revisions.length > 0 ? (
            <View style={[styles.card, styles.cardAccentPrimary]}>
              <View style={styles.listRow}>
                <Text style={styles.sectionTitle}>{copy.latestRevision}</Text>
                <StatusPillInline tone="mint">{copy.vToday}</StatusPillInline>
              </View>
              <Text style={styles.listMeta}>
                {profiles[0].garmentTemplate.name} · {new Date(profiles[0].revisions[0].measuredAt).toLocaleDateString()}
              </Text>
              <View style={[styles.splitRow, { marginTop: 12, flexWrap: 'wrap' }]}>
                {Object.entries(profiles[0].revisions[0].values ?? {}).slice(0, 8).map(([key, value]) => (
                  <View key={key} style={{ minWidth: '45%', marginBottom: 10 }}>
                    <Text style={styles.fieldLabel}>{key.replaceAll('_', ' ')}</Text>
                    <Text style={styles.listTitle}>{String(value)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* History */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>{copy.history}</Text>
            <Text style={styles.sectionLink}>{interpolate(copy.totalCount, String(allProfiles.length))}</Text>
          </View>
          {allProfiles.length === 0 ? (
            <EmptyState title={copy.emptyMeasurements} />
          ) : (
            allProfiles.slice(0, 8).map((rev) => (
              <View key={rev.id} style={styles.listCard}>
                <IconDot tone="violet" name="measurements" />
                <View style={styles.listMain}>
                  <Text style={styles.listTitle}>{new Date(rev.measuredAt).toLocaleDateString()}</Text>
                  <Text style={styles.listMeta} numberOfLines={1}>
                    {Object.entries(rev.values).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                  </Text>
                </View>
                <Text style={styles.customerAction}>{copy.viewDiff}</Text>
              </View>
            ))
          )}
        </>
      ) : (
        <EmptyState title="Choose a customer" detail="Pick a customer above to see their measurement revisions." />
      )}
    </>
  );
}

function StatusPillInline({ tone, children }: { tone: 'mint' | 'amber'; children: React.ReactNode }) {
  const styles = useAppStyles();
  return (
    <View style={[styles.statusPill, tone === 'mint' ? styles.pillMint : styles.pillAmber]}>
      <Text style={[styles.statusPillText, tone === 'mint' ? styles.pillMintText : styles.pillAmberText]}>
        {children}
      </Text>
    </View>
  );
}
