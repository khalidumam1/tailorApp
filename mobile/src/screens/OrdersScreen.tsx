/**
 * Orders screen — clean kanban with one column per configured workflow stage,
 * order form, stage-transition buttons, and WhatsApp order status updates.
 */
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { formatCurrency } from '../local';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { Icon } from '../Icons';
import { ActionButton, EmptyState } from '../theme/primitives';
import { useWorkspace, resolveMobileWorkflowStage } from '../hooks/useWorkspace';
import { computeDashboardSummary } from '../data/analytics';
import type { LocalOrder } from '../local';
import { normalizePhone } from '../data/messaging';

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
  const [showArchived, setShowArchived] = useState(false);
  const [archivedOrders, setArchivedOrders] = useState<LocalOrder[]>([]);
  useEffect(() => {
    if (!showArchived) return;
    let cancelled = false;
    ws.fetchArchivedOrders()
      .then((list) => { if (!cancelled) setArchivedOrders(list); })
      .catch(() => { /* fetchArchivedOrders surfaces the error in the workspace banner */ });
    return () => { cancelled = true; };
  }, [showArchived, ws.fetchArchivedOrders, ws.orders]);

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

      {/* Archived toggle */}
      <View style={styles.chipWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: showArchived }}
          android_ripple={{ color: palette.primarySoft }}
          onPress={() => setShowArchived((value) => !value)}
          style={({ pressed }) => [styles.chip, showArchived && styles.chipSelected, pressed && styles.chipPressed]}
        >
          <Text style={[styles.chipText, showArchived && styles.chipTextSelected]}>Archived</Text>
        </Pressable>
      </View>

      {showArchived ? (
        archivedOrders.length ? archivedOrders.map((order) => (
          <View key={order.id} style={[styles.listCard, styles.cardAccentPrimary, { flexDirection: 'column', alignItems: 'stretch' }]}>
            <Text style={styles.listTitle} numberOfLines={2}>{order.item_name ?? order.garment_name} · {order.customer_name}</Text>
            <Text style={styles.listMeta}>{order.promised_at.slice(0, 10)} · Archived</Text>
            {ws.can('orders:write') ? (
              <ActionButton
                title="Restore order"
                secondary
                loading={ws.saving}
                loadingTitle={copy.loading}
                disabled={ws.saving}
                onPress={() => void ws.restoreOrder(order).then(() => setArchivedOrders((current) => current.filter((entry) => entry.id !== order.id)))}
              />
            ) : null}
          </View>
        )) : <EmptyState title="No archived orders." />
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
          return (
            <View key={column.key} style={styles.kanbanColumn}>
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
                  const synced = true;
                  const orderBusy = Boolean(ws.transitioningOrderKey?.startsWith(`${order.id}:`));
                  const paymentOpen = ws.paymentOrder?.id === order.id;
                  return (
                    <View key={order.id} style={[styles.orderCard, { marginBottom: 8 }]}>
                      <View style={styles.orderTop}>
                        <View style={styles.listMain}>
                          <Text style={styles.listTitle} numberOfLines={2}>
                            {order.item_name ?? order.garment_name} · {order.customer_name}
                          </Text>
                          <Text style={styles.listMeta}>
                            {stageMap[order.workflow_stage_key ?? order.status] ?? currentStage?.label ?? ''} · {order.promised_at.slice(0, 10)}
                          </Text>
                        </View>
                        <Text style={styles.listPrice}>{formatCurrency(order.total, currency)}</Text>
                      </View>

                      {ws.can('orders:transition') ? outgoing.map((target) => {
                        const transitionBusy = ws.transitioningOrderKey === `${order.id}:${target.key}`;
                        return (
                          <Pressable
                            key={target.id}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: orderBusy, busy: transitionBusy }}
                            android_ripple={{ color: palette.primarySoft }}
                            disabled={orderBusy}
                            onPress={() => void ws.transitionOrder(order, target.key)}
                            style={({ pressed }) => [
                              styles.nextStageBtn,
                              (orderBusy) && styles.disabled,
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

                      {ws.can('payments:write') && ws.moduleEnabled('payments') && !paymentOpen ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ disabled: false, busy: ws.openingPaymentOrderId === order.id }}
                          android_ripple={{ color: palette.primarySoft }}
                          disabled={ws.openingPaymentOrderId === order.id}
                          onPress={() => void openOrderPayment(order)}
                          style={({ pressed }) => [
                            styles.nextStageBtn,
                            false && styles.disabled,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.nextStageText}>
                            {ws.openingPaymentOrderId === order.id ? copy.loading : copy.recordPayment}
                          </Text>
                          <Icon name="wallet" size={16} color={palette.primaryText} />
                        </Pressable>
                      ) : null}

                      {ws.can('orders:write') ? (
                        <Pressable
                          accessibilityRole="button"
                          android_ripple={{ color: palette.primarySoft }}
                          onPress={() => Alert.alert(
                            'Archive order',
                            'Archive this order? Its payment history and records are kept and the order can be restored at any time.',
                            [
                              { text: copy.cancel, style: 'cancel' },
                              { text: 'Archive', style: 'destructive', onPress: () => void ws.archiveOrder(order) },
                            ],
                          )}
                          style={({ pressed }) => [styles.nextStageBtn, pressed && styles.pressed]}
                        >
                          <Text style={styles.nextStageText}>Archive order</Text>
                        </Pressable>
                      ) : null}

                      {paymentOpen && ws.can('payments:write') && ws.moduleEnabled('payments') ? <PaymentForm /> : null}

                      {/* WhatsApp order status button */}
                      {ws.can('orders:read') && ws.moduleEnabled('customers') && (
                        <View style={{ marginTop: 10 }}>
                          <Pressable
                            accessibilityRole="button"
                          accessibilityState={{ disabled: false }}
                          android_ripple={{ color: palette.primarySoft }}
                          onPress={() => {
                          const customer = ws.customers.find(c => c.id === order.customer_id);
                          if (customer && customer.phone) {
                            const normalizedPhone = normalizePhone(customer.phone);
                            if (normalizedPhone) {
                              const stageLabel = resolveMobileWorkflowStage(stages, order)?.label ?? order.status;
                              const message = `Order ${order.order_number ?? order.id} is now ${stageLabel}.`;
                              void ws.sendWhatsAppMessage(normalizedPhone, message);
                            }
                          }
                          }}
                          style={({ pressed }) => [
                            styles.nextStageBtn,
                            false && styles.disabled,
                            pressed && styles.pressed
                          ]}
                          >
                            <Text style={styles.nextStageText}>
                              {copy.whatsappOrderStatus}
                            </Text>
                            <Icon name="chat" size={16} color={palette.primaryText} />
                          </Pressable>
                        </View>
                      )}
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
