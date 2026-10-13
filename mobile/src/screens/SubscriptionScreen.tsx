/**
 * Subscription & billing — Payrio-style with a hero current-plan card, a
 * horizontal scroll of plan comparison cards and a payment history list.
 */
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { ActionButton, EmptyState, Field, StatusPill } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';
import { formatCurrency } from '../local';
import { interpolate } from '../i18n';

export function SubscriptionScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;

  useEffect(() => { void ws.refreshSubscriptionBilling(); }, [ws.refreshSubscriptionBilling]);

  const billing = ws.subscriptionBilling;
  const currentPlan = billing?.subscription;
  const plans = billing?.plans ?? [];
  const cycle = ws.subscriptionCycle;
  // Plan options and the renewal form are revealed by "Manage plan" (or upgrade),
  // and always shown when there is no current plan to manage.
  const [showManage, setShowManage] = useState(false);
  const plansVisible = showManage || !currentPlan;
  const currency = ws.businessConfiguration?.business.currency;

  // The billing API returns no PDF link for the mobile app, so the invoice
  // details are shared as text (the receipt PDF needs the web app).
  const shareInvoice = () => {
    const latest = billing?.payments.find((payment) => payment.invoiceNumber) ?? billing?.payments[0];
    if (!latest) {
      Alert.alert(copy.shareInvoice, copy.noSubscriptionPayments);
      return;
    }
    const message = [
      ws.session?.business.name ?? '',
      `${copy.receipt}: ${latest.invoiceNumber ?? '—'}`,
      `${latest.plan.name} · ${latest.status}`,
      `${formatCurrency(latest.amount, currency)} · ${latest.method} · ${new Date(latest.createdAt).toLocaleDateString()}`,
      `${latest.transactionReference} · ${latest.senderName}`,
    ].join('\n');
    void Share.share({ message }).catch(() => Alert.alert(copy.error));
  };

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{copy.subscriptionTitle}</Text>
          <Text style={styles.pageSubtitle}>{copy.paymentInstructions}</Text>
        </View>
      </View>

      {/* Hero current plan card */}
      {currentPlan ? (
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>{copy.currentPlan}</Text>
          <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
            {currentPlan.plan.name}
          </Text>
          <Text style={styles.heroSubLabel}>
            {currentPlan.status} · {copy.subscriptionValidTo} {new Date(currentPlan.endsAt).toLocaleDateString()}
          </Text>
          <View style={styles.heroRow}>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>
                {currentPlan.grandfathered ? 'Legacy' : currentPlan.complimentary ? copy.plan : 'Active'}
              </Text>
            </View>
            <Text style={styles.heroMeta}>{ws.term('orders', copy.orders)}: {ws.orders.length}</Text>
          </View>

          <View style={styles.customerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: plansVisible }}
              android_ripple={{ color: palette.primarySoft }}
              onPress={() => setShowManage((open) => !open)}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Text style={styles.customerAction}>{copy.managePlan}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              android_ripple={{ color: palette.primarySoft }}
              onPress={shareInvoice}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Text style={styles.customerAction}>{copy.shareInvoice}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.moneyCard}>
          <Text style={styles.moneyLabel}>{copy.noSubscription}</Text>
        </View>
      )}

      {/* Payment instructions */}
      {billing?.paymentInstructions ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{copy.paymentInstructions}</Text>
          <Text style={styles.listMeta}>{billing.paymentInstructions}</Text>
          {billing.supportContact ? <Text style={styles.listMeta}>{billing.supportContact}</Text> : null}
        </View>
      ) : null}

      {/* Plan comparison row */}
      {plansVisible && plans.length > 0 ? (
        <>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>{copy.changePlan}</Text>
            <View style={styles.connection}>
              <Text style={styles.connectionText}>{cycle === 'MONTHLY' ? copy.monthly : copy.yearly}</Text>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kanbanScroll}>
            {plans.map((plan) => {
              const isCurrent = currentPlan?.plan.name === plan.name;
              const price = cycle === 'MONTHLY' ? plan.monthlyPrice : plan.yearlyPrice;
              return (
                <View key={plan.id} style={[styles.planCard, isCurrent && styles.planCardActive]}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planPrice}>{formatCurrency(price, ws.businessConfiguration?.business.currency)}</Text>
                  <Text style={styles.planMeta}>{cycle === 'MONTHLY' ? '/ month' : '/ year'}</Text>
                  {isCurrent ? (
                    <View style={[styles.statusPill, styles.pillMint, { marginTop: 8, alignSelf: 'flex-start' }]}>
                      <Text style={[styles.statusPillText, styles.pillMintText]}>{copy.currentPlanPill}</Text>
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        ws.setSubscriptionPlanId(plan.id);
                        ws.setSubscriptionPayment((current) => ({ ...current, amount: price }));
                        setShowManage(true);
                      }}
                      style={({ pressed }) => [styles.chip, { marginTop: 10, alignSelf: 'flex-start' }, pressed && styles.chipPressed]}
                    >
                      <Text style={styles.chipTextSelected}>{copy.upgrade}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      {/* Payment history */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{copy.subscriptionHistory}</Text>
      </View>
      {billing?.payments.length ? (
        billing.payments.map((payment) => (
          <View key={payment.id} style={styles.listCard}>
            <View style={styles.listMain}>
              <Text style={styles.listTitle}>{payment.plan.name} · {payment.status}</Text>
              <Text style={styles.listMeta}>{formatCurrency(payment.amount, ws.businessConfiguration?.business.currency)} · {payment.method} · {new Date(payment.createdAt).toLocaleDateString()}</Text>
              <Text style={styles.listMeta}>{payment.transactionReference} · {payment.senderName}</Text>
              {payment.invoiceNumber ? <Text style={styles.syncBadge}>{copy.receipt}: {payment.invoiceNumber}</Text> : null}
            </View>
          </View>
        ))
      ) : (
        <EmptyState title={copy.noSubscriptionPayments} />
      )}

      {ws.can('subscriptions:manage') && plans.length && plansVisible ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{copy.requestRenewal}</Text>
          <Text style={styles.fieldLabel}>{copy.plan}</Text>
          <View style={styles.chipWrap}>
            {plans.map((plan) => {
              const active = ws.subscriptionPlanId === plan.id;
              return (
                <Pressable
                  key={plan.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  android_ripple={{ color: palette.primarySoft }}
                  onPress={() => {
                    ws.setSubscriptionPlanId(plan.id);
                    ws.setSubscriptionPayment((current) => ({ ...current, amount: cycle === 'MONTHLY' ? plan.monthlyPrice : plan.yearlyPrice }));
                  }}
                  style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextSelected]}>{plan.name}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.fieldLabel}>{copy.billingCycle}</Text>
          <View style={styles.chipWrap}>
            {(['MONTHLY', 'YEARLY'] as const).map((c) => {
              const active = cycle === c;
              return (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  android_ripple={{ color: palette.primarySoft }}
                  onPress={() => {
                    ws.setSubscriptionCycle(c);
                    const selected = plans.find((p) => p.id === ws.subscriptionPlanId);
                    ws.setSubscriptionPayment((current) => ({
                      ...current,
                      amount: selected ? (c === 'MONTHLY' ? selected.monthlyPrice : selected.yearlyPrice) : '',
                    }));
                  }}
                  style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextSelected]}>{c === 'MONTHLY' ? copy.monthly : copy.yearly}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.fieldLabel}>{copy.paymentMethod}</Text>
          <View style={styles.chipWrap}>
            {(billing?.paymentMethods ?? []).map((method) => {
              const active = ws.subscriptionPayment.method === method;
              return (
                <Pressable
                  key={method}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  android_ripple={{ color: palette.primarySoft }}
                  onPress={() => ws.setSubscriptionPayment((current) => ({ ...current, method }))}
                  style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextSelected]}>{method}</Text>
                </Pressable>
              );
            })}
          </View>
          <Field label={copy.subscriptionAmount} value={ws.subscriptionPayment.amount} onChangeText={(amount) => ws.setSubscriptionPayment((current) => ({ ...current, amount }))} keyboardType="decimal-pad" />
          <Field label={copy.transactionReference} value={ws.subscriptionPayment.transactionReference} onChangeText={(transactionReference) => ws.setSubscriptionPayment((current) => ({ ...current, transactionReference }))} />
          <Field label={copy.senderName} value={ws.subscriptionPayment.senderName} onChangeText={(senderName) => ws.setSubscriptionPayment((current) => ({ ...current, senderName }))} />
          <Field label={copy.paymentDate} value={ws.subscriptionPayment.paymentDate} onChangeText={(paymentDate) => ws.setSubscriptionPayment((current) => ({ ...current, paymentDate }))} />
          <Text style={styles.offlineHint}>{copy.pendingAdminReview}</Text>
          <ActionButton
            title={copy.submitForReview}
            loading={ws.saving}
            loadingTitle={copy.loading}
            onPress={() => void ws.submitSubscriptionPayment()}
            disabled={ws.saving || !ws.subscriptionPlanId || !ws.subscriptionPayment.method || Number(ws.subscriptionPayment.amount) <= 0 || !ws.subscriptionPayment.transactionReference || !ws.subscriptionPayment.senderName || !ws.subscriptionPayment.paymentDate}
          />
        </View>
      ) : null}

      {ws.error ? <Text accessibilityRole="alert" style={styles.errorBanner}>{ws.error}</Text> : null}
    </>
  );
}
