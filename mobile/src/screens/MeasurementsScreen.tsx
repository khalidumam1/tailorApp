/**
 * Measurements — pick a customer to see their dated measurement revisions, add
 * a new revision from a configured template, and compare any revision with the
 * previous one for the same garment.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { ActionButton, EmptyState, Field, IconDot } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';
import { interpolate } from '../i18n';
import { diffRows, parseValues } from '../data/format';

type Revision = {
  id: string;
  templateName: string;
  measuredAt: string;
  values: Record<string, string>;
  syncState: string;
};

export function MeasurementsScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Revisions for the chosen customer, newest first.
  const revisions = useMemo<Revision[]>(() => ws.measurements
    .filter((record) => record.customer_id === selectedCustomerId)
    .map((record) => ({
      id: record.id,
      templateName: record.template_name,
      measuredAt: record.measured_at,
      values: parseValues(record.values_json),
      syncState: record.sync_state,
    }))
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)), [selectedCustomerId, ws.measurements]);

  const labelFor = (key: string) => {
    for (const template of ws.templates) {
      const field = template.fields.find((item) => item.key === key);
      if (field) return field.label;
    }
    return key.replaceAll('_', ' ');
  };

  const openForm = () => {
    ws.setError('');
    if (!ws.measurementForm && selectedCustomerId) ws.setMeasurementCustomer(selectedCustomerId);
    ws.setMeasurementForm(!ws.measurementForm);
  };

  const [latest, ...history] = revisions;

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{ws.term('measurements', copy.measurements)}</Text>
          <Text style={styles.pageSubtitle}>{interpolate(copy.totalCount, String(ws.measurements.length))}</Text>
        </View>
        {ws.can('measurements:write') ? (
          <ActionButton title={`＋ ${copy.saveMeasurement}`} secondary={ws.measurementForm} onPress={openForm} />
        ) : null}
      </View>

      {/* Customer selector */}
      <View style={styles.chipWrap}>
        {ws.customers.map((c) => {
          const active = selectedCustomerId === c.id;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              android_ripple={{ color: palette.primarySoft }}
              onPress={() => { setSelectedCustomerId(c.id); setExpandedId(null); }}
              style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
            >
              <Text style={[styles.chipText, active && styles.chipTextSelected]}>{c.name}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* New revision form */}
      {ws.measurementForm && ws.can('measurements:write') ? (
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{copy.chooseCustomer}</Text>
          <View style={styles.chipWrap}>
            {ws.customers.map((customer) => {
              const active = ws.measurementCustomer === customer.id;
              return (
                <Pressable
                  key={customer.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  android_ripple={{ color: palette.primarySoft }}
                  onPress={() => ws.setMeasurementCustomer(customer.id)}
                  style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextSelected]}>{customer.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>{copy.chooseMeasurementTemplate}</Text>
          <View style={styles.chipWrap}>
            {ws.templates.map((template) => {
              const active = ws.measurementTemplate === template.id;
              return (
                <Pressable
                  key={template.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  android_ripple={{ color: palette.primarySoft }}
                  onPress={() => { ws.setMeasurementTemplate(template.id); ws.setMeasurementValues({}); }}
                  style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextSelected]}>{template.name}</Text>
                </Pressable>
              );
            })}
          </View>
          {ws.templates.length === 0 ? <Text style={styles.offlineHint}>{copy.noTemplates}</Text> : null}

          {ws.selectedTemplate?.fields.map((field) => (
            <Field
              key={field.key}
              label={`${field.label}${field.required ? ' *' : ''} (${field.unit})`}
              value={ws.measurementValues[field.key] ?? ''}
              onChangeText={(value) => ws.setMeasurementValues({ ...ws.measurementValues, [field.key]: value })}
              keyboardType="decimal-pad"
            />
          ))}
          <Field label={copy.notes} value={ws.measurementNotes} onChangeText={ws.setMeasurementNotes} multiline />
          <Text style={styles.offlineHint}>{copy.saved}</Text>
          <ActionButton
            title={copy.saveMeasurement}
            loading={ws.saving}
            loadingTitle={copy.loading}
            onPress={() => void ws.saveMeasurements()}
            disabled={ws.saving || !ws.selectedTemplate || !ws.measurementCustomer}
          />
          <View style={{ marginTop: 8 }}>
            <ActionButton title={copy.cancel} onPress={() => ws.setMeasurementForm(false)} secondary disabled={ws.saving} />
          </View>
        </View>
      ) : null}

      {!selectedCustomerId ? (
        <EmptyState title={copy.chooseCustomer} detail={copy.pickCustomerToView} />
      ) : !latest ? (
        <EmptyState title={copy.emptyMeasurements} />
      ) : (
        <>
          {/* Latest revision hero card */}
          <View style={[styles.card, styles.cardAccentPrimary]}>
            <View style={styles.listRow}>
              <Text style={styles.sectionTitle}>{copy.latestRevision}</Text>
              <View style={[styles.statusPill, styles.pillMint]}>
                <Text style={[styles.statusPillText, styles.pillMintText]}>{new Date(latest.measuredAt).toLocaleDateString()}</Text>
              </View>
            </View>
            <Text style={styles.listMeta}>{latest.templateName}</Text>
            <View style={[styles.splitRow, { marginTop: 12, flexWrap: 'wrap' }]}>
              {Object.entries(latest.values).slice(0, 8).map(([key, value]) => (
                <View key={key} style={{ minWidth: '45%', marginBottom: 10 }}>
                  <Text style={styles.fieldLabel}>{labelFor(key)}</Text>
                  <Text style={styles.listTitle}>{value}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* History with diff against the previous revision of the same garment */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>{copy.history}</Text>
            <Text style={styles.sectionLink}>{interpolate(copy.totalCount, String(revisions.length))}</Text>
          </View>
          {history.map((rev, index) => {
            const previous = history.slice(index + 1).find((item) => item.templateName === rev.templateName);
            const expanded = expandedId === rev.id;
            const changes = diffRows(rev, previous, labelFor);
            return (
              <View key={rev.id} style={[styles.listCard, { flexDirection: 'column', alignItems: 'stretch' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <IconDot tone="violet" name="measurements" />
                  <View style={styles.listMain}>
                    <Text style={styles.listTitle}>{new Date(rev.measuredAt).toLocaleDateString()} · {rev.templateName}</Text>
                    <Text style={styles.listMeta} numberOfLines={1}>
                      {Object.entries(rev.values).slice(0, 3).map(([k, v]) => `${labelFor(k)}: ${v}`).join(' · ')}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    android_ripple={{ color: palette.primarySoft }}
                    onPress={() => setExpandedId(expanded ? null : rev.id)}
                    style={({ pressed }) => [pressed && styles.pressed]}
                  >
                    <Text style={styles.customerAction}>{expanded ? copy.hideDiff : copy.viewDiff}</Text>
                  </Pressable>
                </View>
                {expanded ? (
                  <View style={{ marginTop: 10 }}>
                    {!previous ? (
                      <Text style={styles.listMeta}>{copy.diffNone}</Text>
                    ) : changes.length === 0 ? (
                      <Text style={styles.listMeta}>{copy.diffNone}</Text>
                    ) : changes.map(([label, before, after]) => (
                      <Text key={label} style={styles.listMeta}>
                        {label}: {before} → {after}
                      </Text>
                    ))}
                    {previous ? <Text style={styles.offlineHint}>{copy.previousRevision}: {new Date(previous.measuredAt).toLocaleDateString()}</Text> : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </>
      )}
    </>
  );
}
