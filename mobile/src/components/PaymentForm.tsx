/**
 * Inline payment form for one synced order. It reuses the workspace payment
 * flow (idempotent attempt -> POST /api/v1/payments/orders/:id). Payments are
 * online-only; the retry path keeps the same idempotency key and amount.
 */
import { Pressable, Text, View } from 'react-native';
import { formatCurrency } from '../local';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { ActionButton, Field } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';

export function PaymentForm() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;
  const order = ws.paymentOrder;
  if (!order) return null;
  const locked = Boolean(ws.paymentAttempt);
  const currency = ws.businessConfiguration?.business.currency;

  return (
    <View style={[styles.card, styles.cardAccentMint]}>
      <Text style={styles.sectionTitle}>{copy.recordPayment}</Text>
      <Text style={styles.listMeta}>
        {order.customer_name} · {formatCurrency(order.total, currency)}
      </Text>
      <Field
        label={copy.paymentAmount}
        value={ws.paymentAmount}
        onChangeText={ws.setPaymentAmount}
        keyboardType="decimal-pad"
        editable={!locked}
      />
      <Text style={styles.fieldLabel}>{copy.paymentMethod}</Text>
      <View style={styles.chipWrap}>
        {ws.paymentMethodOptions.map((method) => {
          const active = (ws.paymentAttempt?.method ?? ws.paymentMethod) === method;
          return (
            <Pressable
              key={method}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: locked }}
              android_ripple={{ color: palette.primarySoft }}
              disabled={locked}
              onPress={() => ws.setPaymentMethod(method)}
              style={({ pressed }) => [
                styles.chip,
                active && styles.chipSelected,
                locked && styles.disabled,
                pressed && !locked && styles.chipPressed,
              ]}
            >
              <Text style={[styles.chipText, active && styles.chipTextSelected]}>{ws.paymentMethodLabel(method)}</Text>
            </Pressable>
          );
        })}
      </View>
      {locked ? <Text style={styles.offlineHint}>{copy.paymentUnconfirmed}</Text> : null}
      <View style={{ marginTop: 8 }}>
        <ActionButton
          title={locked ? copy.retry : copy.recordPayment}
          loading={ws.saving}
          loadingTitle={copy.loading}
          onPress={() => void ws.recordPayment()}
          disabled={ws.saving}
        />
      </View>
      <View style={{ marginTop: 8 }}>
        <ActionButton title={copy.cancel} onPress={ws.cancelOrderPayment} secondary disabled={ws.saving} />
      </View>
    </View>
  );
}
