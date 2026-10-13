/**
 * Analytics — order value over time (range chips change the window), the
 * pipeline breakdown, collections this month from the real payment ledger,
 * and the top items on recent orders.
 */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { useWorkspace } from '../hooks/useWorkspace';
import { computeDashboardSummary } from '../data/analytics';
import { loadPayments, summarizePayments } from '../data/payments';
import { AreaChart } from '../components/AreaChart';
import { BarList } from '../components/BarList';
import { StackedBar } from '../components/StackedBar';
import { formatCurrency } from '../local';
import { interpolate } from '../i18n';

const RANGES = [
  { key: '1W', weeks: 1 },
  { key: '1M', weeks: 4 },
  { key: '8W', weeks: 8 },
] as const;

export function AnalyticsScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('8W');
  const [collectedThisMonth, setCollectedThisMonth] = useState<number | null>(null);
  const canReadPayments = ws.can('payments:read');

  // Collections come from the recorded payment ledger (online only).
  useEffect(() => {
    let active = true;
    if (!ws.session || ws.online !== true || !canReadPayments) {
      setCollectedThisMonth(null);
      return () => { active = false; };
    }
    loadPayments(ws.session)
      .then((rows) => { if (active) setCollectedThisMonth(summarizePayments(rows).collectedThisMonth); })
      .catch(() => { if (active) setCollectedThisMonth(null); });
    return () => { active = false; };
  }, [ws.online, ws.session, canReadPayments, ws.syncState.last_successful_sync]);

  const stages = ws.businessConfiguration?.workflow.stages ?? [];
  const stageMap: Record<string, string> = {};
  for (const stage of stages) stageMap[stage.key] = stage.label;
  const summary = computeDashboardSummary(ws.orders, stageMap);

  const currency = ws.businessConfiguration?.business.currency ?? 'PKR';
  const weeks = RANGES.find((item) => item.key === range)?.weeks ?? 8;
  const series = summary.weeklyOrderValue.slice(-weeks);
  const orderValueTotal = series.reduce((s, p) => s + p.value, 0);
  const serverOutstanding = ws.dashboard.outstanding;
  const outstanding = serverOutstanding !== undefined && serverOutstanding !== null ? Math.max(Number(serverOutstanding), 0) : null;
  const collected = Math.max(collectedThisMonth ?? 0, 0);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{copy.analytics}</Text>
          <Text style={styles.pageSubtitle}>{copy.customizeWorkspace}</Text>
        </View>
      </View>

      {/* Order value area chart */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartLabel}>{range === '8W' ? copy.last8weeks : range === '1M' ? '1M' : '1W'}</Text>
            <Text style={styles.chartValue}>{formatCurrency(orderValueTotal.toFixed(2), currency)}</Text>
            <Text style={styles.listMeta}>{copy.orderValue}</Text>
          </View>
          <View style={styles.chartPill}>
            <Text style={styles.chartPillText}>
              {interpolate(copy.pct, summary.trendPercent >= 0 ? `+${summary.trendPercent}` : `${summary.trendPercent}`)} {copy.vLastMonth}
            </Text>
          </View>
        </View>
        <AreaChart data={series} currency={currency} copyKey={copy.totalCount} height={170} />
        <View style={styles.chipWrap}>
          {RANGES.map((item) => {
            const active = range === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                android_ripple={{ color: palette.primarySoft }}
                onPress={() => setRange(item.key)}
                style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
              >
                <Text style={[styles.chipText, active && styles.chipTextSelected]}>{item.key}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Pipeline breakdown */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartLabel}>{copy.pipelineBreakdown}</Text>
            <Text style={styles.listMeta}>{interpolate(copy.totalCount, String(summary.totalActive))}</Text>
          </View>
        </View>
        <BarList
          rows={summary.pipelineBreakdown.map((row) => ({
            label: row.stageLabel,
            value: row.count,
            meta: `${row.count}`,
            color: row.color,
          }))}
        />
      </View>

      {/* Collections this month (ledger) against outstanding (server total) */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartLabel}>{copy.collectionsThisMonth}</Text>
            <Text style={styles.chartValue}>
              {collectedThisMonth === null ? '—' : formatCurrency(collected.toFixed(2), currency)}
            </Text>
            {collectedThisMonth === null ? <Text style={styles.listMeta}>{copy.paymentsOnline}</Text> : null}
          </View>
        </View>
        {collectedThisMonth !== null && outstanding !== null ? (
          <StackedBar
            segments={[
              { label: copy.collectedToday, value: collected, color: palette.success, meta: formatCurrency(collected.toFixed(2), currency) },
              { label: copy.outstandingLabel, value: outstanding, color: palette.danger, meta: formatCurrency(outstanding.toFixed(2), currency) },
            ]}
          />
        ) : null}
      </View>

      {/* Top items */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartLabel}>{copy.topItems}</Text>
            <Text style={styles.listMeta}>{copy.byQuantity}</Text>
          </View>
        </View>
        {summary.topItems.length === 0 ? (
          <Text style={styles.emptyText}>—</Text>
        ) : (
          <BarList
            rows={summary.topItems.map((item) => ({
              label: item.itemName,
              value: item.count,
              meta: String(item.count),
              color: palette.primary,
            }))}
          />
        )}
      </View>
    </ScrollView>
  );
}
