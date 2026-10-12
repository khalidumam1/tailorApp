/**
 * Dashboard — Payrio-style hero card, quick action row, recent activity.
 * Mirrors the web's `dashboard` view but renders as a single-column mobile
 * screen with a hero balance card and a list of recent activity.
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

export function DashboardScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;

  // Refresh the dashboard payload (and trigger a sync) on entry.
  useEffect(() => {
    void ws.runSync();
  }, [ws.runSync]);

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

  const syncStateLabel = ws.syncing
    ? copy.syncing
    : ws.syncState.pending > 0
      ? `${ws.syncState.pending} ${copy.pending}`
      : copy.lastSync;
  const lastSyncLabel = ws.syncState.last_successful_sync
    ? new Date(ws.syncState.last_successful_sync).toLocaleString()
    : copy.never;

  return (
    <>
      <View style={styles.syncCard}>
        <View style={styles.syncCopy}>
          <Text style={styles.syncTitle}>{syncStateLabel}</Text>
          <Text style={styles.syncMeta}>{lastSyncLabel}</Text>
          {ws.syncError || ws.syncState.attention > 0 ? (
            <Text style={styles.errorText}>{ws.syncError || `${ws.syncState.attention} ${copy.attention}`}</Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: ws.syncing || ws.online !== true, busy: ws.syncing }}
          android_ripple={{ color: palette.primarySoft }}
          disabled={ws.syncing || ws.online !== true}
          onPress={() => void ws.runSync()}
          style={({ pressed }) => [styles.chip, (ws.syncing || ws.online !== true) && styles.disabled, pressed && styles.chipPressed]}
        >
          <Text style={styles.chipTextSelected}>{ws.syncing ? copy.syncing : copy.retry}</Text>
        </Pressable>
      </View>

      {ws.error ? <Text accessibilityRole="alert" style={styles.errorBanner}>{ws.error}</Text> : null}

      {/* Hero balance card */}
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

      {/* Quick action row */}
      <View style={styles.quickRow}>
        {([
          { icon: 'plus' as IconName, label: copy.newOrderAction, onPress: () => {} },
          { icon: 'wallet' as IconName, label: copy.recordPaymentAction, onPress: () => {} },
          { icon: 'send' as IconName, label: copy.sendMessageAction, onPress: () => {} },
          { icon: 'chart' as IconName, label: copy.reportAction, onPress: () => {} },
        ] as const).map((q) => (
          <Pressable
            key={q.label}
            accessibilityRole="button"
            accessibilityLabel={q.label}
            android_ripple={{ color: palette.primarySoft }}
            onPress={q.onPress}
            style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
          >
            <View style={styles.quickActionIcon}>
              <Icon name={q.icon} size={20} color={palette.primaryText} />
            </View>
            <Text style={styles.quickActionLabel}>{q.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Metric cards */}
      <View style={styles.chipWrap}>
        {ws.businessConfiguration?.dashboardWidgets
          .filter((key) => ws.can('orders:read') || key === 'newOrders')
          .map((key) => {
            const map: Record<string, [string, string]> = {
              newOrders: [newOrdersCount, copy.ordersToday],
              dueToday: [dueTodayCount, copy.dueToday],
              inProgress: [inProgressCount, copy.inProgressLabel],
              overdue: [overdueCount, copy.overdueLabel],
              outstanding: [formatCurrency(outstanding, ws.businessConfiguration?.business.currency), copy.outstandingLabel],
              collectedToday: [formatCurrency(collectedToday, ws.businessConfiguration?.business.currency), copy.collectedToday],
            };
            const value = map[key];
            if (!value) return null;
            return (
              <View key={key} style={styles.listCard}>
                <View style={styles.listMain}>
                  <Text style={styles.listPrice}>{value[0]}</Text>
                  <Text style={styles.listMeta}>{value[1]}</Text>
                </View>
              </View>
            );
          })}
      </View>

      {/* Money card (collected / outstanding) */}
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

      {/* Order value mini-chart */}
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
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{copy.recentActivity}</Text>
        <Text style={styles.sectionLink}>{copy.viewAll}</Text>
      </View>

      {ws.orders.length === 0 ? (
        <EmptyState title={copy.emptyOrders} />
      ) : (
        ws.orders.slice(0, 6).map((order) => {
          const stage = stageMapObj[order.workflow_stage_key ?? order.status] ?? order.workflow_stage_key ?? order.status;
          return (
            <View key={order.id} style={styles.listCard}>
              <IconDot tone={order.sync_state === 'synced' ? 'mint' : 'amber'} name="orders" />
              <View style={styles.listMain}>
                <Text style={styles.listTitle} numberOfLines={1}>
                  {(order.item_name ?? order.garment_name) || '—'} · {order.customer_name}
                </Text>
                <Text style={styles.listMeta}>{stage} · {order.promised_at.slice(0, 10)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.listPrice}>{formatCurrency(order.total, ws.businessConfiguration?.business.currency)}</Text>
                {order.sync_state !== 'synced' ? <StatusPill tone="amber">{copy.pending}</StatusPill> : null}
              </View>
            </View>
          );
        })
      )}

      {/* Sync up-to-date pill */}
      <View style={[styles.syncCard, { marginTop: 12 }]}>
        <Icon name="check" size={20} color={palette.success} />
        <View style={styles.syncCopy}>
          <Text style={styles.syncTitle}>{copy.syncUpToDate}</Text>
          <Text style={styles.syncMeta}>{lastSyncLabel}</Text>
        </View>
      </View>
    </>
  );
}
