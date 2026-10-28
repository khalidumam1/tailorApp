/**
 * Analytics — trend, pipeline and collections for the current shop.
 *
 * Range switching is a segmented control; every block is a card so the page
 * reads as a report rather than a list of charts.
 */
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { Card, DeltaPill, ProgressBar, Segmented } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';
import { computeDashboardSummary } from '../data/analytics';
import { loadPayments, summarizePayments } from '../data/payments';
import { AreaChart, BarList, ColumnChart } from '../components/Charts';
import { StackedBar } from '../components/StackedBar';
import { formatCurrency } from '../local';
import { interpolate } from '../i18n';

const RANGES = [
  { key: '1W', weeks: 1 },
  { key: '1M', weeks: 4 },
  { key: '8W', weeks: 8 },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

export function AnalyticsScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;
  const [range, setRange] = useState<RangeKey>('8W');
  const [collectedThisMonth, setCollectedThisMonth] = useState<number | null>(null);
  const canReadPayments = ws.can('payments:read') && ws.moduleEnabled('payments');

  useEffect(() => {
    let active = true;
    if (!ws.session || !canReadPayments) {
      setCollectedThisMonth(null);
      return () => { active = false; };
    }
    loadPayments(ws.session)
      .then((rows) => { if (active) setCollectedThisMonth(summarizePayments(rows).collectedThisMonth); })
      .catch(() => { if (active) setCollectedThisMonth(null); });
    return () => { active = false; };
  }, [ws.session, canReadPayments]);

  const stages = ws.businessConfiguration?.workflow.stages ?? [];
  const stageMap: Record<string, string> = {};
  for (const stage of stages) stageMap[stage.key] = stage.label;
  const summary = computeDashboardSummary(ws.orders, stageMap);

  const currency = ws.businessConfiguration?.business.currency ?? 'PKR';
  const weeks = RANGES.find((item) => item.key === range)?.weeks ?? 8;
  const series = summary.weeklyOrderValue.slice(-weeks);
  const orderValueTotal = series.reduce((sum, point) => sum + point.value, 0);
  const serverOutstanding = ws.dashboard.outstanding;
  const outstanding = serverOutstanding !== undefined && serverOutstanding !== null ? Math.max(Number(serverOutstanding), 0) : null;
  const collected = Math.max(collectedThisMonth ?? 0, 0);

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>{copy.analytics}</Text>
          <Text style={styles.pageSubtitle}>{copy.last8weeks}</Text>
        </View>
      </View>

      <Segmented<RangeKey>
        options={RANGES.map((item) => ({ key: item.key, label: item.key }))}
        value={range}
        onChange={setRange}
      />

      {/* Order value trend */}
      <Card>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.chartLabel}>{copy.orderValue}</Text>
            <Text style={styles.chartValue}>{formatCurrency(orderValueTotal.toFixed(2), currency)}</Text>
          </View>
          <DeltaPill value={summary.trendPercent} />
        </View>
        <AreaChart data={series} height={170} />
      </Card>

      {/* Pipeline */}
      <Card>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.chartLabel}>{copy.pipelineBreakdown}</Text>
            <Text style={styles.chartValue}>{interpolate(copy.totalCount, String(summary.totalActive))}</Text>
          </View>
        </View>
        {summary.pipelineBreakdown.length === 0 ? (
          <Text style={styles.emptyText}>—</Text>
        ) : (
          <View style={{ gap: 14 }}>
            {summary.pipelineBreakdown.map((row) => (
              <View key={row.stageKey}>
                <View style={styles.barLabelRow}>
                  <Text style={styles.barLabel} numberOfLines={1}>{row.stageLabel}</Text>
                  <Text style={styles.barValue}>
                    {row.count} · {Math.round(row.share * 100)}%
                  </Text>
                </View>
                <ProgressBar value={row.count} max={Math.max(1, ...summary.pipelineBreakdown.map((entry) => entry.count))} color={row.color} />
              </View>
            ))}
          </View>
        )}
      </Card>

      {/* Weekly order counts */}
      <Card>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.chartLabel}>{copy.totalCount}</Text>
            <Text style={styles.chartValue}>{String(summary.totalActive)}</Text>
          </View>
        </View>
        <ColumnChart data={summary.weeklyOrderValue.map((point) => ({ label: point.label, value: point.value }))} height={130} />
      </Card>

      {/* Collections vs outstanding */}
      {canReadPayments ? (
        <Card>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
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
                { label: copy.collectedToday, value: collected, color: palette.okFg, meta: formatCurrency(collected.toFixed(2), currency) },
                { label: copy.outstandingLabel, value: outstanding, color: palette.badFg, meta: formatCurrency(outstanding.toFixed(2), currency) },
              ]}
            />
          ) : null}
        </Card>
      ) : null}

      {/* Top items */}
      <Card>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
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
              color: palette.brand600,
            }))}
          />
        )}
      </Card>
    </>
  );
}
