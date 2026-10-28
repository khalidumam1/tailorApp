/**
 * Dashboard — the shop's morning read.
 *
 * Order of information follows how a tailor actually scans it: money owed
 * (hero), the four things that need action today (KPI tiles), how the last two
 * months moved (trend), where the work is stuck (pipeline), then the newest
 * orders. Every tile that can show a trend does.
 */
import { Pressable, Text, View } from 'react-native';
import { formatCurrency } from '../local';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { Icon, type IconName } from '../Icons';
import { Avatar, Card, DeltaPill, Section, StatCard, StatusPill, type Tone } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';
import { computeDashboardSummary } from '../data/analytics';
import { interpolate } from '../i18n';
import { AreaChart, BarList, DonutChart, Sparkline } from '../components/Charts';
import type { Navigate } from '../navigation';

export function DashboardScreen({ onNavigate }: { onNavigate: Navigate }) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;

  const stages = ws.businessConfiguration?.workflow.stages ?? [];
  const stageMapObj: Record<string, string> = {};
  for (const stage of stages) stageMapObj[stage.key] = stage.label;

  const summary = computeDashboardSummary(ws.orders, stageMapObj);
  const currency = ws.businessConfiguration?.business.currency;

  const outstanding = String(ws.dashboard.outstanding ?? summary.totalOutstanding.toFixed(2));
  const collectedToday = String(ws.dashboard.collectedToday ?? summary.totalCollected.toFixed(2));
  const newOrdersCount = String(ws.dashboard.newOrders ?? summary.newOrders);
  const inProgressCount = String(ws.dashboard.inProgress ?? summary.inProgress);
  const dueTodayCount = String(ws.dashboard.dueToday ?? summary.dueToday);
  const overdueCount = String(ws.dashboard.overdue ?? summary.overdue);

  const weeklyValues = summary.weeklyOrderValue.map((point) => point.value);
  const weeklyTotal = weeklyValues.reduce((sum, value) => sum + value, 0);
  const money = (value: string) => formatCurrency(value, currency);

  const widgets: Record<string, { value: string; label: string; icon: IconName; tone: Tone; delta?: number; spark?: number[] }> = {
    newOrders: { value: newOrdersCount, label: copy.ordersToday, icon: 'orders', tone: 'brand' },
    dueToday: { value: dueTodayCount, label: copy.dueToday, icon: 'calendar', tone: 'amber' },
    inProgress: { value: inProgressCount, label: copy.inProgressLabel, icon: 'arrowRight', tone: 'info' },
    overdue: { value: overdueCount, label: copy.overdueLabel, icon: 'alert', tone: 'red' },
    outstanding: { value: money(outstanding), label: copy.outstandingLabel, icon: 'wallet', tone: 'mint', delta: summary.trendPercent, spark: weeklyValues },
    collectedToday: { value: money(collectedToday), label: copy.collectedToday, icon: 'arrowUp', tone: 'mint', spark: weeklyValues },
  };

  const showMoney = ws.can('payments:read') && ws.moduleEnabled('payments');
  const showOrders = ws.can('orders:read') && ws.moduleEnabled('orders');

  return (
    <>
      {ws.error ? <Text accessibilityRole="alert" style={styles.errorBanner}>{ws.error}</Text> : null}

      {/* Outstanding balance — the number the shop cares about most. */}
      {showMoney ? (
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>{copy.totalBalance}</Text>
          <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
            {money(outstanding)}
          </Text>
          <Text style={styles.heroSubLabel}>{copy.balanceSubtitle}</Text>
          <View style={styles.heroSpark}>
            <Sparkline data={weeklyValues} height={34} color="#ffffff" />
          </View>
          <View style={styles.heroRow}>
            <DeltaPill value={summary.trendPercent} inverted />
            <Text style={styles.heroMeta}>{interpolate(copy.activeOrders, String(summary.totalActive))}</Text>
          </View>
        </View>
      ) : null}

      {/* Quick actions */}
      <View style={styles.quickRow}>
        {([
          { icon: 'plus' as IconName, label: copy.newOrderAction, visible: showOrders && ws.can('orders:write'), disabled: !ws.can('orders:write'), onPress: () => onNavigate('orders', 'new-order') },
          { icon: 'wallet' as IconName, label: copy.recordPaymentAction, visible: showMoney && ws.can('payments:write'), disabled: !ws.can('payments:write'), onPress: () => onNavigate('payments', 'record-payment') },
          { icon: 'send' as IconName, label: copy.sendMessageAction, visible: ws.moduleEnabled('customers') && ws.can('customers:read'), disabled: !ws.can('customers:read'), onPress: () => onNavigate('customers') },
          { icon: 'chart' as IconName, label: copy.reportAction, visible: showOrders && ws.moduleEnabled('reports'), disabled: false, onPress: () => onNavigate('analytics') },
        ]).filter((q) => q.visible).map((q) => (
          <Pressable
            key={q.label}
            accessibilityRole="button"
            accessibilityLabel={q.label}
            accessibilityState={{ disabled: q.disabled }}
            android_ripple={{ color: palette.brand50 }}
            disabled={q.disabled}
            onPress={q.onPress}
            style={({ pressed }) => [styles.quickAction, q.disabled && styles.disabled, pressed && styles.pressed]}
          >
            <View style={styles.quickActionIcon}>
              <Icon name={q.icon} size={19} color={palette.brand700} />
            </View>
            <Text style={styles.quickActionLabel}>{q.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* KPI tiles configured for this business */}
      <View style={styles.metricGrid}>
        {(ws.businessConfiguration?.dashboardWidgets ?? [])
          .filter((key) => showOrders && (widgets[key]
            ? !['outstanding', 'collectedToday'].includes(key) || showMoney
            : false))
          .map((key) => {
            const widget = widgets[key];
            return (
              <StatCard
                key={key}
                label={widget.label}
                value={widget.value}
                icon={widget.icon}
                tone={widget.tone}
                delta={widget.delta ?? null}
                spark={widget.spark}
              />
            );
          })}
      </View>

      {/* Order value trend */}
      {showOrders ? (
        <Card>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.chartLabel}>{copy.last8weeks}</Text>
              <Text style={styles.chartValue}>{money(weeklyTotal.toFixed(2))}</Text>
            </View>
            <DeltaPill value={summary.trendPercent} />
          </View>
          <AreaChart data={summary.weeklyOrderValue} height={148} />
        </Card>
      ) : null}

      {/* Pipeline breakdown */}
      {showOrders && summary.pipelineBreakdown.length > 0 ? (
        <Card>
          <Text style={styles.cardTitle}>{copy.pipelineBreakdown}</Text>
          <Text style={styles.cardSubtitle}>{interpolate(copy.activeOrders, String(summary.totalActive))}</Text>
          <View style={{ marginTop: 14 }}>
            <DonutChart
              segments={summary.pipelineBreakdown.map((row) => ({ label: row.stageLabel, value: row.count, color: row.color }))}
              centerValue={String(summary.totalActive)}
              centerLabel={copy.orders}
            />
          </View>
        </Card>
      ) : null}

      {/* Top items */}
      {showOrders && summary.topItems.length > 0 ? (
        <Card>
          <Text style={styles.cardTitle}>{copy.topItems}</Text>
          <View style={{ marginTop: 12 }}>
            <BarList
              rows={summary.topItems.map((row) => ({ label: row.itemName, value: row.count, meta: String(row.count) }))}
            />
          </View>
        </Card>
      ) : null}

      {/* Recent orders */}
      {showOrders ? (
        <Section title={copy.recentActivity} actionLabel={copy.viewAll} onAction={() => onNavigate('orders')}>
          {ws.orders.length === 0 ? (
            <Card style={{ padding: 24, alignItems: 'center' }}>
              <Text style={styles.emptyText}>{copy.emptyOrders}</Text>
            </Card>
          ) : (
            ws.orders.slice(0, 5).map((order) => {
              const stageKey = order.workflow_stage_key ?? order.status;
              const stage = stageMapObj[stageKey] ?? stageKey;
              const overdue = new Date(order.promised_at).getTime() < new Date().setHours(0, 0, 0, 0);
              return (
                <Pressable
                  key={order.id}
                  accessibilityRole="button"
                  onPress={() => onNavigate('orders')}
                  android_ripple={{ color: palette.brand50 }}
                  style={styles.listCard}
                >
                  <Avatar name={order.customer_name} />
                  <View style={styles.listMain}>
                    <Text style={styles.listTitle} numberOfLines={1}>
                      {(order.item_name ?? order.garment_name) || '—'}
                    </Text>
                    <Text style={styles.listMeta} numberOfLines={1}>{order.customer_name}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={styles.listPrice}>{formatCurrency(order.total, currency)}</Text>
                    <StatusPill tone={overdue ? 'red' : 'muted'}>{stage}</StatusPill>
                  </View>
                </Pressable>
              );
            })
          )}
        </Section>
      ) : null}
    </>
  );
}
