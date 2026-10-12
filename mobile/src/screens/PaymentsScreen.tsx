/**
 * Payments ledger — Payrio-style with a hero outstanding/collected card, a
 * segment control for All/Received/Reversal and a list of payment rows.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { formatCurrency } from '../local';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { Icon, type IconName } from '../Icons';
import { ActionButton, EmptyState, IconDot, StatusPill } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';
import { loadPayments, summarizePayments, type PaymentRow } from '../data/payments';
import { interpolate } from '../i18n';

type Segment = 'all' | 'received' | 'reversal';

export function PaymentsScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [segment, setSegment] = useState<Segment>('all');

  useEffect(() => {
    let active = true;
    if (!ws.session || ws.online !== true) {
      setRows([]);
      return () => { active = false; };
    }
    setLoading(true);
    void loadPayments(ws.session, ws.orders)
      .then((next) => { if (active) setRows(next); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ws.online, ws.orders, ws.session]);

  const summary = rows ? summarizePayments(rows) : { outstanding: 0, collectedToday: 0, count: 0 };
  const filtered = (rows ?? []).filter((r) => {
    if (segment === 'received') return r.kind === 'PAYMENT';
    if (segment === 'reversal') return r.kind === 'REVERSAL';
    return true;
  });

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{copy.paymentsLedger}</Text>
          <Text style={styles.pageSubtitle}>{interpolate(copy.totalCount, String(summary.count))}</Text>
        </View>
      </View>

      {/* Hero money card */}
      <View style={styles.moneyCard}>
        <View style={styles.moneyRow}>
          <Text style={styles.moneyLabel}>{copy.outstandingLabel}</Text>
          <Text style={styles.moneyValue}>
            {formatCurrency(summary.outstanding.toFixed(2), ws.businessConfiguration?.business.currency)}
          </Text>
        </View>
        <View style={styles.moneyRow}>
          <Text style={styles.moneyLabel}>{copy.collectedToday}</Text>
          <Text style={styles.moneyValue}>
            {formatCurrency(summary.collectedToday.toFixed(2), ws.businessConfiguration?.business.currency)}
          </Text>
        </View>
      </View>

      {/* Quick action row */}
      <View style={styles.quickRow}>
        {([
          { icon: 'wallet' as IconName, label: copy.recordPaymentBtn, onPress: () => ws.setOrderForm(true) },
          { icon: 'send' as IconName, label: copy.sendReceiptBtn, onPress: () => {} },
          { icon: 'download' as IconName, label: copy.exportPdfBtn, onPress: () => {} },
        ] as const).map((q) => (
          <Pressable
            key={q.label}
            accessibilityRole="button"
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

      {loading ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState title={copy.emptyPayments} />
      ) : (
        filtered.map((row) => (
          <View key={row.id} style={styles.listCard}>
            <IconDot tone={row.kind === 'REVERSAL' ? 'red' : 'mint'} name="wallet" />
            <View style={styles.listMain}>
              <View style={styles.listRow}>
                <Text style={styles.listTitle} numberOfLines={1}>{row.receiptNumber}</Text>
                {row.kind === 'REVERSAL' ? (
                  <StatusPill tone="red">{copy.failed}</StatusPill>
                ) : (
                  <StatusPill tone="mint">{copy.delivered}</StatusPill>
                )}
              </View>
              <Text style={styles.listMeta}>{row.customerName} · {row.method}</Text>
              <Text style={styles.listMeta}>{new Date(row.createdAt).toLocaleString()}</Text>
            </View>
            <Text style={[styles.listPrice, row.kind === 'REVERSAL' ? { color: palette.danger } : null]}>
              {row.kind === 'REVERSAL' ? '−' : '+'} {formatCurrency(row.amount.toFixed(2), ws.businessConfiguration?.business.currency)}
            </Text>
          </View>
        ))
      )}

      {ws.error ? <Text accessibilityRole="alert" style={styles.errorBanner}>{ws.error}</Text> : null}
    </>
  );
}
