/**
 * Dashboard — clean, simple layout with hero card, quick actions, metrics, and recent activity.
 */
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatCurrency } from '../local';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { Icon, type IconName } from '../Icons';
import { IconDot, StatusPill, EmptyState } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';
import { computeDashboardSummary } from '../data/analytics';
import { interpolate } from '../i18n';
import { AreaChart } from '../components/AreaChart';
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

  const outstanding = String(ws.dashboard.outstanding ?? summary.totalOutstanding.toFixed(2));
  const collectedToday = String(ws.dashboard.collectedToday ?? summary.totalCollected.toFixed(2));
  const newOrdersCount = String(ws.dashboard.newOrders ?? summary.newOrders);
  const inProgressCount = String(ws.dashboard.inProgress ?? summary.inProgress);
  const dueTodayCount = String(ws.dashboard.dueToday ?? summary.dueToday);
  const overdueCount = String(ws.dashboard.overdue ?? summary.overdue);

  return (
    <>
      {ws.error ? <Text accessibilityRole="alert" style={styles.errorBanner}>{ws.error}</Text> : null}

      {/* Hero balance card */}
      {ws.can('payments:read') && ws.moduleEnabled('payments') ? (
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>{copy.totalBalance}</Text>
          <Text style={styles.heroSubLabel}>{copy.balanceSubtitle}</Text>
          <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
            {formatCurrency(outstanding, ws.businessConfiguration?.business.currency)}
          </Text>
          <View style={styles.heroRow}>
            <View style={styles.heroPill}>
              <Icon name="arrowUp" size={12} color={palette.success} />
              <Text style={styles.heroPillText}>
                {interpolate(copy.pct, summary.trendPercent >= 0 ? `+${summary.trendPercent}` : `${summary.trendPercent}`)} {copy.vLastMonth}
              </Text>
            </View>
            <Text style={styles.heroMeta}>
              {interpolate(copy.activeOrders, String(summary.totalActive))}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Quick action row */}
      <View style={styles.quickRow}>
        {([
          { icon: 'plus' as IconName, label: copy.newOrderAction, visible: ws.moduleEnabled('orders') && ws.can('orders:write'), disabled: !ws.can('orders:write'), onPress: () => onNavigate('orders', 'new-order') },
          { icon: 'wallet' as IconName, label: copy.recordPaymentAction, visible: ws.moduleEnabled('payments') && ws.can('payments:write'), disabled: !ws.can('payments:write'), onPress: () => onNavigate('payments', 'record-payment') },
          { icon: 'send' as IconName, label: copy.sendMessageAction, visible: ws.moduleEnabled('customers') && ws.can('customers:read'), disabled: !ws.can('customers:read'), onPress: () => onNavigate('customers') },
          { icon: 'chart' as IconName, label: copy.reportAction, visible: ws.moduleEnabled('orders') && ws.moduleEnabled('reports') && ws.can('orders:read'), disabled: false, onPress: () => onNavigate('analytics') },
        ]).filter((q) => q.visible).map((q) => (
          <Pressable
            key={q.label}
            accessibilityRole="button"
            accessibilityLabel={q.label}
            accessibilityState={{ disabled: q.disabled }}
            android_ripple={{ color: palette.primarySoft }}
            disabled={q.disabled}
            onPress={q.onPress}
            style={({ pressed }) => [styles.quickAction, q.disabled && styles.disabled, pressed && styles.pressed]}
          >
            <View style={styles.quickActionIcon}>
              <Icon name={q.icon} size={20} color={palette.primaryText} />
            </View>
            <Text style={styles.quickActionLabel}>{q.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Dashboard metrics use their own two-column grid. Reusing listCard here
          made all six cards shrink into tall, empty-looking white strips on
          narrow Android screens. */}
      <View style={styles.metricGrid}>
        {ws.businessConfiguration?.dashboardWidgets
          .filter((key) => ws.can('orders:read') && ws.moduleEnabled('orders')
            && (!['outstanding', 'collectedToday'].includes(key)
              || (ws.can('payments:read') && ws.moduleEnabled('payments'))))
          .map((key) => {
            const map: Record<string, [string, string, IconName]> = {
              newOrders: [newOrdersCount, copy.ordersToday, 'orders'],
              dueToday: [dueTodayCount, copy.dueToday, 'calendar'],
              inProgress: [inProgressCount, copy.inProgressLabel, 'arrowRight'],
              overdue: [overdueCount, copy.overdueLabel, 'alert'],
              outstanding: [formatCurrency(outstanding, ws.businessConfiguration?.business.currency), copy.outstandingLabel, 'wallet'],
              collectedToday: [formatCurrency(collectedToday, ws.businessConfiguration?.business.currency), copy.collectedToday, 'arrowUp'],
            };
            const value = map[key];
            if (!value) return null;
            return (
              <View
                key={key}
                accessible
                accessibilityLabel={`${value[1]}: ${value[0]}`}
                style={styles.metricCard}
              >
                <View style={styles.metricIcon}>
                  <Icon name={value[2]} size={18} color={palette.primaryText} />
                </View>
                <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value[0]}</Text>
                <Text style={styles.metricLabel} numberOfLines={2}>{value[1]}</Text>
              </View>
            );
          })}
      </View>

      {/* Money card */}
      {ws.can('payments:read') && ws.moduleEnabled('payments') ? (
        <View style={styles.moneyCard}>
          <View style={styles.moneyRow}>
            <Text style={styles.moneyLabel}>{copy.outstandingLabel}</Text>
            <Text style={styles.moneyValue}>{formatCurrency(outstanding, ws.businessConfiguration?.business.currency)}</Text>
          </View>
          <View style={styles.moneyRow}>
            <Text style={styles.moneyLabel}>{copy.collectedToday}</Text>
            <Text style={styles.moneyValue}>{formatCurrency(collectedToday, ws.businessConfiguration?.business.currency)}</Text>
          </View>
        </View>
      ) : null}

      {/* Order chart and recent feed */}
      {ws.can('orders:read') && ws.moduleEnabled('orders') ? (
        <>
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.chartLabel}>{copy.last8weeks}</Text>
              <Text style={styles.chartValue}>
                {formatCurrency(summary.weeklyOrderValue.reduce((s, p) => s + p.value, 0).toFixed(2), ws.businessConfiguration?.business.currency)}
              </Text>
            </View>
            <View style={styles.chartPill}>
              <Text style={styles.chartPillText}>
                {interpolate(copy.pct, summary.trendPercent >= 0 ? `+${summary.trendPercent}` : `${summary.trendPercent}`)}
              </Text>
            </View>
          </View>
          <AreaChart data={summary.weeklyOrderValue} currency={ws.businessConfiguration?.business.currency} copyKey={copy.totalCount} />
        </View>

        {/* Recent activity */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: 4 }}>
          <Text style={styles.sectionTitle}>{copy.recentActivity}</Text>
          <Pressable accessibilityRole="button" onPress={() => onNavigate('orders')} hitSlop={8}>
            <Text style={styles.sectionLink}>{copy.viewAll}</Text>
          </Pressable>
        </View>

        {ws.orders.length === 0 ? (
          <EmptyState title={copy.emptyOrders} />
        ) : (
          ws.orders.slice(0, 6).map((order) => {
            const stage = stageMapObj[order.workflow_stage_key ?? order.status] ?? order.workflow_stage_key ?? order.status;
            return (
              <Pressable key={order.id} accessibilityRole="button" onPress={() => onNavigate('orders')} android_ripple={{ color: palette.primarySoft }} style={styles.listCard}>
                <IconDot name="orders" />
                <View style={styles.listMain}>
                  <Text style={styles.listTitle} numberOfLines={1}>
                    {(order.item_name ?? order.garment_name) || '—'} · {order.customer_name}
                  </Text>
                  <Text style={styles.listMeta}>{stage} · {order.promised_at.slice(0, 10)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.listPrice}>{formatCurrency(order.total, ws.businessConfiguration?.business.currency)}</Text>
                </View>
              </Pressable>
            );
          })
        )}
        </>
      ) : null}
    </>
  );
}
