/**
 * Payments ledger — hero balance card, quick actions (record payment, send
 * receipt, share list), a segment control, and the real payment ledger.
 * Recording a payment opens an order picker and the inline payment form.
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Share, Text, View } from 'react-native';
import { formatCurrency } from '../local';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { Icon, type IconName } from '../Icons';
import { ActionButton, EmptyState, IconDot, StatusPill, openExternal } from '../theme/primitives';
import { useWorkspace, sendWhatsAppMessage } from '../hooks/useWorkspace';
import { loadPayments, summarizePayments, type PaymentRow } from '../data/payments';
import { receiptMessage, whatsappUrl, normalizePhone } from '../data/messaging';
import { interpolate } from '../i18n';
import { PaymentForm } from '../components/PaymentForm';

type Segment = 'all' | 'received' | 'reversal';

export function PaymentsScreen({
  intent,
  onIntentHandled,
}: {
  intent?: string | null;
  onIntentHandled: () => void;
}) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;
  const currency = ws.businessConfiguration?.business.currency;
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [segment, setSegment] = useState<Segment>('all');
  const [pickerOpen, setPickerOpen] = useState(false);

  const canRecord = ws.can('payments:write') && ws.moduleEnabled('payments');
  const canReadLedger = ws.can('payments:read') && ws.moduleEnabled('payments');

  useEffect(() => {
    if (intent === 'record-payment') {
      setPickerOpen(true);
      onIntentHandled();
    }
  }, [intent, onIntentHandled]);

  // Reload the ledger when online and after each sync (a payment triggers a sync).
  useEffect(() => {
    let active = true;
    if (!ws.session || ws.online !== true || !canReadLedger) {
      setRows(null);
      return () => { active = false; };
    }
    setLoading(true);
    setLoadError('');
    loadPayments(ws.session)
      .then((next) => { if (active) setRows(next); })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : copy.error); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ws.online, ws.session, canReadLedger, ws.syncState.last_successful_sync, copy.error]);

  const ledger = rows ?? [];
  const ledgerSummary = summarizePayments(ledger);
  // Server totals (all-time outstanding, today's collections) when available;
  // otherwise the figures come from the loaded ledger, or are shown as unknown.
  const serverOutstanding = ws.dashboard.outstanding;
  const serverCollectedToday = ws.dashboard.collectedToday;
  const outstandingText = serverOutstanding !== undefined && serverOutstanding !== null
    ? formatCurrency(String(serverOutstanding), currency) : '—';
  const collectedTodayText = serverCollectedToday !== undefined && serverCollectedToday !== null
    ? formatCurrency(String(serverCollectedToday), currency)
    : rows ? formatCurrency(ledgerSummary.collectedToday.toFixed(2), currency) : '—';

  const filtered = ledger.filter((row) => {
    if (segment === 'received') return row.kind === 'PAYMENT';
    if (segment === 'reversal') return row.kind === 'REVERSAL';
    return true;
  });

  // Orders that can take a payment: synced orders, newest first.
  const payableOrders = useMemo(
    () => ws.orders
      .filter((order) => order.sync_state === 'synced' && Number(order.total) > 0)
      .sort((a, b) => b.promised_at.localeCompare(a.promised_at)),
    [ws.orders],
  );

   const sendReceipt = async (row: PaymentRow) => {
     const phone = row.customerPhone ?? ws.customers.find((c) => c.id === row.customerId)?.phone ?? null;
     if (!phone) {
       Alert.alert(copy.sendReceiptBtn, copy.noPhoneNumber);
       return;
     }
     const normalizedPhone = normalizePhone(phone);
     if (!normalizedPhone) {
       Alert.alert(copy.sendReceiptBtn, copy.invalidNumber);
       return;
     }
     
     const message = receiptMessage({
       businessName: ws.session?.business.name ?? '',
       receiptLabel: copy.receipt,
       receiptNumber: row.receiptNumber,
       amount: formatCurrency(row.amount.toFixed(2), currency),
       date: new Date(row.createdAt).toLocaleDateString(),
       customerName: row.customerName,
     });
     
     try {
       await sendWhatsAppMessage(normalizedPhone, message, null);
       // Optionally show a success message
       // Alert.alert(copy.sendReceiptBtn, copy.whatsappReceiptSent);
     } catch (error) {
       Alert.alert(copy.sendReceiptBtn, copy.error);
     }
   };

   const sendLatestReceipt = async () => {
     const latest = ledger.find((row) => row.kind === 'PAYMENT');
     if (!latest) {
       Alert.alert(copy.sendReceiptBtn, copy.noPaymentsToSend);
       return;
     }
     await sendReceipt(latest);
   };

  const shareList = () => {
    const lines = filtered.map((row) => `${row.receiptNumber} · ${row.customerName} · ${row.kind === 'REVERSAL' ? '-' : '+'}${formatCurrency(row.amount.toFixed(2), currency)} · ${new Date(row.createdAt).toLocaleDateString()}`);
    const message = [
      `${copy.paymentsLedger} — ${ws.session?.business.name ?? ''}`,
      `${copy.collectedToday}: ${collectedTodayText}`,
      `${copy.outstandingLabel}: ${outstandingText}`,
      '',
      ...lines,
    ].join('\n');
    void Share.share({ message }).catch(() => Alert.alert(copy.error));
  };

  const quickActions: Array<{ icon: IconName; label: string; onPress: () => void; disabled?: boolean }> = [
    {
      icon: 'wallet',
      label: copy.recordPaymentBtn,
      onPress: () => { ws.setError(''); setPickerOpen((open) => !open); },
      disabled: !canRecord,
    },
    { icon: 'send', label: copy.sendReceiptBtn, onPress: sendLatestReceipt, disabled: ledger.length === 0 },
    { icon: 'download', label: copy.shareList, onPress: shareList, disabled: ledger.length === 0 },
  ];

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{copy.paymentsLedger}</Text>
          <Text style={styles.pageSubtitle}>{interpolate(copy.totalCount, String(ledgerSummary.count))}</Text>
        </View>
      </View>

      {/* Hero money card */}
      <View style={styles.moneyCard}>
        <View style={styles.moneyRow}>
          <Text style={styles.moneyLabel}>{copy.outstandingLabel}</Text>
          <Text style={styles.moneyValue}>{outstandingText}</Text>
        </View>
        <View style={styles.moneyRow}>
          <Text style={styles.moneyLabel}>{copy.collectedToday}</Text>
          <Text style={styles.moneyValue}>{collectedTodayText}</Text>
        </View>
      </View>

      {/* Quick action row */}
      <View style={styles.quickRow}>
        {quickActions.map((action) => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityState={{ disabled: Boolean(action.disabled) }}
            android_ripple={{ color: palette.primarySoft }}
            disabled={action.disabled}
            onPress={action.onPress}
            style={({ pressed }) => [styles.quickAction, action.disabled && styles.disabled, pressed && styles.pressed]}
          >
            <View style={styles.quickActionIcon}>
              <Icon name={action.icon} size={20} color={palette.primaryText} />
            </View>
            <Text style={styles.quickActionLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Record payment: order picker, then the inline form */}
      {pickerOpen && canRecord ? (
        <View style={[styles.card, styles.cardAccentMint]}>
          {ws.paymentOrder ? (
            <PaymentForm />
          ) : (
            <>
              <Text style={styles.sectionTitle}>{copy.pickOrderForPayment}</Text>
              {ws.online !== true ? (
                <Text style={styles.errorText}>{copy.paymentOnline}</Text>
              ) : payableOrders.length === 0 ? (
                <Text style={styles.listMeta}>{copy.noPayableOrders}</Text>
              ) : (
                payableOrders.slice(0, 30).map((order) => (
                  <Pressable
                    key={order.id}
                    accessibilityRole="button"
                    accessibilityState={{ busy: ws.openingPaymentOrderId === order.id }}
                    android_ripple={{ color: palette.primarySoft }}
                    disabled={ws.openingPaymentOrderId === order.id}
                    onPress={() => void ws.openOrderPayment(order)}
                    style={({ pressed }) => [styles.listCard, pressed && styles.pressed]}
                  >
                    <View style={styles.listMain}>
                      <Text style={styles.listTitle} numberOfLines={1}>{order.item_name ?? order.garment_name} · {order.customer_name}</Text>
                      <Text style={styles.listMeta}>{order.promised_at.slice(0, 10)}</Text>
                    </View>
                    <Text style={styles.listPrice}>{formatCurrency(order.total, currency)}</Text>
                  </Pressable>
                ))
              )}
              <View style={{ marginTop: 8 }}>
                <ActionButton title={copy.cancel} onPress={() => setPickerOpen(false)} secondary />
              </View>
            </>
          )}
        </View>
      ) : null}

      {/* Segment control */}
      <View style={styles.chipWrap}>
        {([
          { key: 'all' as const, label: copy.paymentSegAll },
          { key: 'received' as const, label: copy.paymentSegReceived },
          { key: 'reversal' as const, label: copy.paymentSegReversal },
        ]).map((seg) => {
          const active = segment === seg.key;
          return (
            <Pressable
              key={seg.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              android_ripple={{ color: palette.primarySoft }}
              onPress={() => setSegment(seg.key)}
              style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
            >
              <Text style={[styles.chipText, active && styles.chipTextSelected]}>{seg.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {ws.online !== true ? (
        <EmptyState title={copy.paymentsOnline} />
      ) : loading ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : loadError ? (
        <Text accessibilityRole="alert" style={styles.errorText}>{loadError}</Text>
      ) : filtered.length === 0 ? (
        <EmptyState title={copy.emptyPayments} />
      ) : (
        filtered.map((row) => {
          const phone = row.customerPhone ?? ws.customers.find((c) => c.id === row.customerId)?.phone ?? null;
          return (
            <View key={row.id} style={styles.listCard}>
              <IconDot tone={row.kind === 'REVERSAL' ? 'red' : 'mint'} name="wallet" />
              <View style={styles.listMain}>
                <View style={styles.listRow}>
                  <Text style={styles.listTitle} numberOfLines={1}>{row.receiptNumber}</Text>
                  {row.kind === 'REVERSAL' ? (
                    <StatusPill tone="red">{copy.paymentSegReversal}</StatusPill>
                  ) : (
                    <StatusPill tone="mint">{copy.delivered}</StatusPill>
                  )}
                </View>
                <Text style={styles.listMeta}>{row.customerName} · {row.method}</Text>
                <Text style={styles.listMeta}>{new Date(row.createdAt).toLocaleString()}</Text>
                {phone ? (
                  <Pressable
                    accessibilityRole="button"
                    android_ripple={{ color: palette.primarySoft }}
                    onPress={() => sendReceipt(row)}
                    style={({ pressed }) => [styles.customerActions, pressed && styles.pressed]}
                  >
                    <Text style={styles.customerAction}>{copy.sendReceiptBtn}</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={[styles.listPrice, row.kind === 'REVERSAL' ? { color: palette.danger } : null]}>
                {row.kind === 'REVERSAL' ? '−' : '+'} {formatCurrency(row.amount.toFixed(2), currency)}
              </Text>
            </View>
          );
        })
      )}
    </>
  );
}
