/**
 * Orders screen — kanban with one column per configured workflow stage, an
 * order form, stage-transition buttons, and an inline payment form per order.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { formatCurrency } from '../local';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { Icon } from '../Icons';
import { ActionButton, EmptyState } from '../theme/primitives';
import { useWorkspace, resolveMobileWorkflowStage } from '../hooks/useWorkspace';
import { computeDashboardSummary } from '../data/analytics';
import { AreaChart } from '../components/AreaChart';
import { OrderForm } from '../components/OrderForm';
import { PaymentForm } from '../components/PaymentForm';

const FALLBACK_STAGES = [
  { key: 'CUTTING', label: 'Cutting' },
  { key: 'STITCHING', label: 'Stitching' },
  { key: 'FITTING', label: 'Fitting' },
] as const;

export function OrdersScreen({
  intent,
  onIntentHandled,
  onOpenCustomers,
}: {
  intent?: string | null;
  onIntentHandled: () => void;
  onOpenCustomers: () => void;
}) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;
  const [filter, setFilter] = useState<string>('all');

  // "New order" shortcut from the dashboard opens the form directly.
  useEffect(() => {
    if (intent === 'new-order') {
      if (ws.can('orders:write')) ws.setOrderForm(true);
      onIntentHandled();
    }
  }, [intent, onIntentHandled, ws]);

  const stages = useMemo(
    () => [...(ws.businessConfiguration?.workflow.stages ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [ws.businessConfiguration],
  );
  const stageMap: Record<string, string> = {};
  for (const stage of stages) stageMap[stage.key] = stage.label;
  const summary = computeDashboardSummary(ws.orders, stageMap);
  const currency = ws.businessConfiguration?.business.currency;

  const filterChips: Array<{ key: string; label: string }> = [
    { key: 'all', label: copy.paymentSegAll },
    ...stages.map((s) => ({ key: s.key, label: s.label })),
  ];
  const filtered = filter === 'all'
    ? ws.orders
    : ws.orders.filter((o) => resolveMobileWorkflowStage(stages, o)?.key === filter);

  // Columns: configured stages, or the fallback trio if no configuration is cached yet.
  const columns = stages.length
    ? stages.map((stage) => ({ key: stage.key, label: stage.label }))
    : FALLBACK_STAGES.map((stage) => ({ key: stage.key, label: stage.label }));
  const initialKey = stages.find((stage) => stage.isInitial)?.key;

  const openOrderPayment = ws.openOrderPayment;

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{ws.term('orders', copy.orders)}</Text>
          <Text style={styles.pageSubtitle}>{filtered.length} {ws.term('orders', copy.orders).toLowerCase()}</Text>
        </View>
        {ws.can('orders:write') ? (
          <ActionButton
            title={`＋ ${copy.newOrder}`}
            secondary={ws.orderForm}
            onPress={() => { ws.setError(''); ws.setOrderForm(!ws.orderForm); }}
          />
        ) : null}
      </View>

      {ws.orderForm && ws.can('orders:write') ? (
        <OrderForm onOpenCustomers={onOpenCustomers} />
      ) : null}

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

      {/* Kanban — one column per configured stage */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kanbanScroll}>
        {columns.map((column, index) => {
          const ordersInColumn = filtered.filter((order) => {
            const stage = resolveMobileWorkflowStage(stages, order);
            if (stage) return stage.key === column.key;
            return initialKey !== undefined ? column.key === initialKey : index === 0;
          });
          const accent = index % 3 === 0 ? 'cardAccentMint' : index % 3 === 1 ? 'cardAccentBlue' : 'cardAccentAmber';
          return (
            <View key={column.key} style={[styles.kanbanColumn, styles[accent]]}>
              <View style={styles.kanbanHeader}>
                <Text style={styles.kanbanTitle}>{column.label}</Text>
                <Text style={styles.kanbanCount}>{ordersInColumn.length}</Text>
              </View>
              {ordersInColumn.length === 0 ? (
                <Text style={styles.kanbanEmpty}>—</Text>
              ) : (
                ordersInColumn.slice(0, 6).map((order) => {
                  const currentStage = resolveMobileWorkflowStage(stages, order);
                  const outgoing = (ws.businessConfiguration?.workflow.transitions ?? [])
                    .filter((t) => t.fromStageId === currentStage?.id)
                    .map((t) => stages.find((s) => s.id === t.toStageId))
                    .filter((s): s is NonNullable<typeof s> => Boolean(s));
                  const synced = order.sync_state === 'synced';
                  const orderBusy = Boolean(ws.transitioningOrderKey?.startsWith(`${order.id}:`));
                  const paymentOpen = ws.paymentOrder?.id === order.id;
                  return (
                    <View key={order.id} style={[styles.card, { marginBottom: 8 }]}>
                      <View style={styles.orderTop}>
                        <View style={styles.listMain}>
                          <Text style={styles.listTitle} numberOfLines={2}>
                            {order.item_name ?? order.garment_name} · {order.customer_name}
                          </Text>
                          <Text style={styles.listMeta}>{stageMap[order.workflow_stage_key ?? order.status] ?? currentStage?.label ?? ''} · {order.promised_at.slice(0, 10)}</Text>
                          {!synced ? <Text style={styles.pendingLabel}>{copy.pending}</Text> : null}
                        </View>
                        <Text style={styles.listPrice}>{formatCurrency(order.total, currency)}</Text>
                      </View>

                      {ws.can('orders:transition') ? outgoing.map((target) => {
                        const transitionBusy = ws.transitioningOrderKey === `${order.id}:${target.key}`;
                        return (
                          <Pressable
                            key={target.id}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: orderBusy || !synced || ws.online !== true, busy: transitionBusy }}
                            android_ripple={{ color: palette.primarySoft }}
                            disabled={orderBusy || !synced || ws.online !== true}
                            onPress={() => void ws.transitionOrder(order, target.key)}
                            style={({ pressed }) => [
                              styles.nextStageBtn,
                              (orderBusy || !synced || ws.online !== true) && styles.disabled,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={styles.nextStageText}>
                              {transitionBusy ? copy.loading : `${copy.nextStage}: ${target.label}`}
                            </Text>
                            <Icon name="arrowRight" size={16} color={palette.primaryText} />
                          </Pressable>
                        );
                      }) : null}

                      {ws.can('payments:write') && !paymentOpen ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ disabled: ws.online !== true || !synced, busy: ws.openingPaymentOrderId === order.id }}
                          android_ripple={{ color: palette.primarySoft }}
                          disabled={ws.online !== true || !synced || ws.openingPaymentOrderId === order.id}
                          onPress={() => void openOrderPayment(order)}
                          style={({ pressed }) => [
                            styles.nextStageBtn,
                            (ws.online !== true || !synced) && styles.disabled,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.nextStageText}>
                            {ws.openingPaymentOrderId === order.id ? copy.loading : copy.recordPayment}
                          </Text>
                          <Icon name="wallet" size={16} color={palette.primaryText} />
                        </Pressable>
                      ) : null}

                      {paymentOpen && ws.can('payments:write') ? <PaymentForm /> : null}
                    </View>
                  );
                })
              )}
            </View>
          );
        })}
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={{ marginTop: 12 }}>
          <EmptyState title={copy.emptyOrders} />
        </View>
      ) : null}

      {/* Analytics sparkline */}
      <View style={[styles.chartCard, { marginTop: 16 }]}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartLabel}>{copy.last8weeks}</Text>
            <Text style={styles.chartValue}>
              {formatCurrency(summary.weeklyOrderValue.reduce((s, p) => s + p.value, 0).toFixed(2), currency)}
            </Text>
          </View>
          <View style={styles.chartPill}>
            <Text style={styles.chartPillText}>
              {summary.trendPercent >= 0 ? `+${summary.trendPercent}` : `${summary.trendPercent}`}%
            </Text>
          </View>
        </View>
        <AreaChart data={summary.weeklyOrderValue} currency={currency} copyKey={copy.totalCount} />
      </View>
    </>
  );
}
