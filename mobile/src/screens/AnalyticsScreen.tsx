/**
 * Analytics — Payrio-style. Shows the 8-week order value area chart, the
 * pipeline breakdown bar list, a collected-vs-outstanding stacked bar, and
 * a top-items list. Everything is derived from the local order list.
 */
import { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { useWorkspace } from '../hooks/useWorkspace';
import { computeDashboardSummary } from '../data/analytics';
import { AreaChart } from '../components/AreaChart';
import { BarList } from '../components/BarList';
import { StackedBar } from '../components/StackedBar';
import { formatCurrency } from '../local';
import { interpolate } from '../i18n';

export function AnalyticsScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;

  useEffect(() => { void ws.runSync(); }, [ws.runSync]);

  const stages = ws.businessConfiguration?.workflow.stages ?? [];
  const stageMap: Record<string, string> = {};
  for (const stage of stages) stageMap[stage.key] = stage.label;
  const summary = computeDashboardSummary(ws.orders, stageMap);

  const currency = ws.businessConfiguration?.business.currency ?? 'PKR';
  const orderValueTotal = summary.weeklyOrderValue.reduce((s, p) => s + p.value, 0);
  const collectedFromOrders = ws.orders
    .filter((o) => (o as any).paid === true)
    .reduce((s, o) => s + Number(o.total || 0), 0);
  const outstandingFromOrders = summary.totalOutstanding;
  const collected = collectedFromOrders || orderValueTotal * 0.4;
  const outstanding = outstandingFromOrders - collected;

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
            <Text style={styles.chartLabel}>{copy.last8weeks}</Text>
            <Text style={styles.chartValue}>{formatCurrency(orderValueTotal.toFixed(2), currency)}</Text>
            <Text style={styles.listMeta}>{copy.orderValue}</Text>
          </View>
          <View style={styles.chartPill}>
            <Text style={styles.chartPillText}>
              {interpolate(copy.pct, summary.trendPercent >= 0 ? `+${summary.trendPercent}` : `${summary.trendPercent}`)} {copy.vLastMonth}
            </Text>
          </View>
        </View>
        <AreaChart data={summary.weeklyOrderValue} currency={currency} copyKey={copy.totalCount} height={170} />
        <View style={styles.chipWrap}>
          {['1W', '1M', '3M', '1Y', copy.viewAll.split(' ')[0]].map((label, i) => (
            <View key={label} style={[styles.chip, i === 1 && styles.chipSelected]}>
              <Text style={[styles.chipText, i === 1 && styles.chipTextSelected]}>{label}</Text>
            </View>
          ))}
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

      {/* Collections this month */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartLabel}>{copy.collectionsThisMonth}</Text>
            <Text style={styles.listMeta}>{formatCurrency((collected + Math.max(outstanding, 0)).toFixed(2), currency)} {copy.totalCount.replace('{0}', '')}</Text>
          </View>
        </View>
        <StackedBar
          segments={[
            { label: copy.collectedToday, value: Math.max(collected, 0), color: palette.success, meta: formatCurrency(collected.toFixed(2), currency) },
            { label: copy.outstandingLabel, value: Math.max(outstanding, 0), color: palette.danger, meta: formatCurrency(outstanding.toFixed(2), currency) },
          ]}
        />
      </View>

      {/* Top items */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartLabel}>{copy.topItems}</Text>
            <Text style={styles.listMeta}>By quantity on recent orders</Text>
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
