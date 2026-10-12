/**
 * Orders screen — Payrio-style kanban with 3 stage columns and an analytics
 * sparkline at the bottom. Each column shows up to 3 order cards with
 * customer name, due date, total and a "Next stage" arrow button.
 */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { formatCurrency } from '../local';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { Icon, type IconName } from '../Icons';
import { ActionButton, EmptyState, IconDot, StatusPill } from '../theme/primitives';
import { useWorkspace, resolveMobileWorkflowStage } from '../hooks/useWorkspace';
import { computeDashboardSummary } from '../data/analytics';
import { AreaChart } from '../components/AreaChart';

const KANBAN_STAGES = [
  { key: 'CUTTING', labelFallback: 'Cutting' },
  { key: 'STITCHING', labelFallback: 'Stitching' },
  { key: 'FITTING', labelFallback: 'Fitting' },
] as const;

export function OrdersScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => { void ws.runSync(); }, [ws.runSync]);

  const stages = ws.businessConfiguration?.workflow.stages ?? [];
  const stageMap: Record<string, string> = {};
  for (const stage of stages) stageMap[stage.key] = stage.label;

  const filterChips: Array<{ key: string; label: string }> = [
    { key: 'all', label: copy.paymentSegAll },
    ...stages.map((s) => ({ key: s.key, label: s.label })),
  ];

  const summary = computeDashboardSummary(ws.orders, stageMap);
  const filtered = filter === 'all' ? ws.orders : ws.orders.filter((o) => (o.workflow_stage_key ?? o.status) === filter);

  // Group into kanban columns (use first 3 known stages as the columns).
  const kanbanStageKeys = KANBAN_STAGES.map((s) => s.key);

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{copy.orders}</Text>
          <Text style={styles.pageSubtitle}>{interpolateLocal(filtered.length)}</Text>
        </View>
        {ws.can('orders:write') ? (
          <ActionButton title={`＋ ${copy.newOrder}`} onPress={() => ws.setOrderForm(!ws.orderForm)} />
        ) : null}
      </View>

      {/* Filter chips */}
      <View style={styles.chipWrap}>
        {filterChips.map((chip) => {
          const active = filter === chip.key;
          return (
            <Pressable
              key={chip.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              android_ripple={{ color: palette.primarySoft }}
              onPress={() => setFilter(chip.key)}
              style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
            >
              <Text style={[styles.chipText, active && styles.chipTextSelected]}>{chip.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Kanban */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kanbanScroll}>
        {kanbanStageKeys.map((stageKey, index) => {
          const ordersInColumn = filtered.filter((o) => {
            const stage = resolveMobileWorkflowStage(stages, o);
            if (stage?.key) return stage.key === stageKey;
            // Fall back to the first 3 workflow stages by index for installs
            // that have not synced their labels yet.
            const orderIndex = stages.findIndex((s) => s.key === (o.workflow_stage_key ?? o.status));
            return orderIndex === index;
          });
          const accent = index === 0 ? 'cardAccentMint' : index === 1 ? 'cardAccentBlue' : 'cardAccentAmber';
          return (
            <View key={stageKey} style={[styles.kanbanColumn, styles[accent as 'cardAccentMint' | 'cardAccentBlue' | 'cardAccentAmber']]}>
              <View style={styles.kanbanHeader}>
                <Text style={styles.kanbanTitle}>{stageMap[stageKey] ?? KANBAN_STAGES[index].labelFallback}</Text>
                <Text style={styles.kanbanCount}>{ordersInColumn.length}</Text>
              </View>
              {ordersInColumn.length === 0 ? (
                <Text style={styles.kanbanEmpty}>—</Text>
              ) : (
                ordersInColumn.slice(0, 4).map((order) => {
                  const currentStage = resolveMobileWorkflowStage(stages, order);
                  const outgoing = ws.businessConfiguration?.workflow.transitions.filter(
                    (t) => t.fromStageId === currentStage?.id,
                  ) ?? [];
                  const nextStage = outgoing
                    .map((t) => stages.find((s) => s.id === t.toStageId))
                    .find((s) => s);
                  return (
                    <View key={order.id} style={[styles.card, { marginBottom: 8 }]}>
                      <View style={styles.orderTop}>
                        <View style={styles.listMain}>
                          <Text style={styles.listTitle} numberOfLines={1}>
                            {order.item_name ?? order.garment_name} · {order.customer_name}
                          </Text>
                          <Text style={styles.listMeta}>{order.promised_at.slice(0, 10)}</Text>
                          {order.sync_state !== 'synced' ? <Text style={styles.pendingLabel}>{copy.pending}</Text> : null}
                        </View>
                        <Text style={styles.listPrice}>{formatCurrency(order.total, ws.businessConfiguration?.business.currency)}</Text>
                      </View>
                      {nextStage && ws.can('orders:transition') ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ disabled: ws.transitioningOrderKey === `${order.id}:${nextStage.key}` || order.sync_state !== 'synced' || ws.online !== true }}
                          android_ripple={{ color: palette.primarySoft }}
                          onPress={() => void ws.transitionOrder(order, nextStage.key)}
                          style={({ pressed }) => [styles.nextStageBtn, pressed && styles.pressed]}
                        >
                          <Text style={styles.nextStageText}>
                            {copy.nextStage}: {nextStage.label}
                          </Text>
                          <Icon name="arrowRight" size={16} color={palette.primaryText} />
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Analytics sparkline */}
      <View style={[styles.chartCard, { marginTop: 16 }]}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartLabel}>{copy.last8weeks}</Text>
            <Text style={styles.chartValue}>
              {formatCurrency(summary.weeklyOrderValue.reduce((s, p) => s + p.value, 0).toFixed(2), ws.businessConfiguration?.business.currency)}
            </Text>
          </View>
          <View style={styles.chartPill}>
            <Text style={styles.chartPillText}>
              {summary.trendPercent >= 0 ? `+${summary.trendPercent}` : `${summary.trendPercent}`}%
            </Text>
          </View>
        </View>
        <AreaChart data={summary.weeklyOrderValue} currency={ws.businessConfiguration?.business.currency} copyKey={copy.totalCount} />
      </View>

      {filtered.length === 0 ? (
        <View style={{ marginTop: 12 }}>
          <EmptyState title={copy.emptyOrders} />
        </View>
      ) : null}
    </>
  );
}

function interpolateLocal(value: number): string {
  return `${value} ${'orders'.toLowerCase()}`;
}
