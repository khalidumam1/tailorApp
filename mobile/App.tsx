import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  ApiError,
  apiRequest,
  clearSession,
  createSession,
  readSession,
  signIn,
  storeSession,
  type Session,
} from './src/api';
import {
  amountToMinorUnits,
  createClientId,
  formatPkr,
  openLocalDatabase,
  type LocalCustomer,
  type LocalOrder,
  type LocalTemplate,
} from './src/local';
import { getCopy, languageOptions, type Language } from './src/i18n';
import {
  loadCustomers,
  loadMeasurements,
  loadOrders,
  loadSyncState,
  loadTemplates,
  createPaymentAttempt,
  findPendingPaymentAttempt,
  saveCustomerOffline,
  saveMeasurementOffline,
  saveOrderOffline,
  synchronize,
  updatePaymentAttempt,
} from './src/sync';

type Page = 'home' | 'orders' | 'customers' | 'measurements' | 'notifications' | 'subscription' | 'settings';
type WhatsAppNotification = {
  id: string;
  kind: string;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'NOT_SENT';
  recipientPhone: string;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
};
type ShopOption = { id: string; name: string };
type SyncState = Awaited<ReturnType<typeof loadSyncState>>;
type SubscriptionPlan = { id: string; name: string; monthlyPrice: string; yearlyPrice: string };
type SubscriptionBilling = {
  subscription: {
    status: string;
    endsAt: string;
    complimentary: boolean;
    grandfathered: boolean;
    plan: { name: string };
  } | null;
  plans: SubscriptionPlan[];
  payments: Array<{
    id: string;
    status: string;
    plan: { name: string };
    cycle: string;
    amount: string;
    method: string;
    transactionReference: string;
    senderName: string;
    invoiceNumber: string | null;
    createdAt: string;
  }>;
  paymentInstructions: string;
  paymentMethods: string[];
  supportContact: string;
};

const LANGUAGE_KEY = 'tailorapp.language.v1';
const statusProgress = ['NEW', 'MEASUREMENT_CONFIRMED', 'CUTTING', 'STITCHING', 'FINISHING', 'READY_FOR_PICKUP', 'COLLECTED'];

function karachiDateInput(): string {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function DisplayStatus({ online, copy }: { online: boolean | null; copy: ReturnType<typeof getCopy> }) {
  return (
    <View style={[styles.connectionDot, online ? styles.onlineDot : styles.offlineDot]} accessibilityLabel={online ? copy.online : copy.offline} />
  );
}

function ActionButton({
  title, onPress, secondary = false, disabled = false,
}: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        secondary && styles.secondaryButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.actionText, secondary && styles.secondaryText]}>{title}</Text>
    </Pressable>
  );
}

function Field({
  label, value, onChangeText, placeholder, keyboardType, multiline, secureTextEntry,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad' | 'decimal-pad';
  multiline?: boolean;
  secureTextEntry?: boolean;
  editable?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        autoCorrect={false}
        keyboardType={keyboardType}
        editable={editable}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor="#91A19A"
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline && styles.multiline]}
        value={value}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const [language, setLanguage] = useState<Language>('en');
  const copy = useMemo(() => getCopy(language), [language]);
  const rtl = language === 'ur';
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [localReady, setLocalReady] = useState(false);
  const [bootError, setBootError] = useState('');
  const [bootAttempt, setBootAttempt] = useState(0);
  const [online, setOnline] = useState<boolean | null>(null);
  const [page, setPage] = useState<Page>('home');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [error, setError] = useState('');
  const [shopChoices, setShopChoices] = useState<ShopOption[]>([]);
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string } | null>(null);
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [templates, setTemplates] = useState<LocalTemplate[]>([]);
  const [measurements, setMeasurements] = useState<Array<{
    id: string; customer_id: string; template_name: string; values_json: string; measured_at: string; sync_state: string;
  }>>([]);
  const [syncState, setSyncState] = useState<SyncState>({ pending: 0, attention: 0, last_successful_sync: null, last_error: null });
  const [syncError, setSyncError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const syncLock = useRef(false);
  const [dashboard, setDashboard] = useState<Record<string, unknown>>({});
  const [notificationHistory, setNotificationHistory] = useState<WhatsAppNotification[]>([]);
  const [subscriptionBilling, setSubscriptionBilling] = useState<SubscriptionBilling | null>(null);
  const [subscriptionPlanId, setSubscriptionPlanId] = useState('');
  const [subscriptionCycle, setSubscriptionCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [subscriptionPayment, setSubscriptionPayment] = useState({
    transactionReference: '',
    senderName: '',
    amount: '',
    method: '',
    paymentDate: new Date().toISOString().slice(0, 10),
  });

  const [customerForm, setCustomerForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [search, setSearch] = useState('');
  const [orderForm, setOrderForm] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [garmentName, setGarmentName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [dueDate, setDueDate] = useState(karachiDateInput);
  const [orderNotes, setOrderNotes] = useState('');
  const [measurementForm, setMeasurementForm] = useState(false);
  const [measurementCustomer, setMeasurementCustomer] = useState('');
  const [measurementTemplate, setMeasurementTemplate] = useState('');
  const [measurementValues, setMeasurementValues] = useState<Record<string, string>>({});
  const [measurementNotes, setMeasurementNotes] = useState('');
  const [paymentOrder, setPaymentOrder] = useState<LocalOrder | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK' | 'DIGITAL'>('CASH');
  const [paymentAttempt, setPaymentAttempt] = useState<{ idempotency_key: string; amount: string; method: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const updateSession = useCallback((nextSession: Session) => {
    setSession(nextSession);
    void storeSession(nextSession).catch((storageError: unknown) => {
      setSyncError(storageError instanceof Error ? storageError.message : copy.error);
    });
  }, [copy.error]);

  const refreshNotificationHistory = useCallback(async () => {
    if (!session || online !== true || !session.permissions.includes('notifications:read')) return;
    try {
      const response = await apiRequest<{ data?: { items?: WhatsAppNotification[] } }>(
        session,
        '/api/v1/notifications?limit=50',
        {},
        updateSession,
      );
      setNotificationHistory(response.data?.items ?? []);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : copy.error);
    }
  }, [copy.error, online, session, updateSession]);

  useEffect(() => {
    if (page === 'notifications') void refreshNotificationHistory();
  }, [page, refreshNotificationHistory]);

  const refreshSubscriptionBilling = useCallback(async () => {
    if (!session || online !== true || !session.permissions.includes('subscriptions:read')) return;
    try {
      const response = await apiRequest<{ data?: SubscriptionBilling }>(
        session,
        '/api/v1/subscriptions',
        {},
        updateSession,
      );
      if (!response.data) throw new Error('Subscription details are unavailable.');
      setSubscriptionBilling(response.data);
      if (!subscriptionPlanId && response.data.plans[0]) {
        setSubscriptionPlanId(response.data.plans[0].id);
        setSubscriptionPayment((current) => ({
          ...current,
          amount: response.data?.plans[0]?.monthlyPrice ?? '',
          method: current.method || response.data?.paymentMethods[0] || '',
        }));
      } else if (!subscriptionPayment.method && response.data.paymentMethods[0]) {
        setSubscriptionPayment((current) => ({ ...current, method: response.data?.paymentMethods[0] ?? '' }));
      }
    } catch (billingError) {
      setError(billingError instanceof Error ? billingError.message : copy.error);
    }
  }, [copy.error, online, session, subscriptionPayment.method, subscriptionPlanId, updateSession]);

  useEffect(() => {
    if (page === 'subscription') void refreshSubscriptionBilling();
  }, [page, refreshSubscriptionBilling]);

  const refreshLocal = useCallback(async (businessId: string) => {
    const [nextCustomers, nextOrders, nextTemplates, nextMeasurements, nextSyncState] = await Promise.all([
      loadCustomers(businessId),
      loadOrders(businessId),
      loadTemplates(businessId),
      loadMeasurements(businessId),
      loadSyncState(businessId),
    ]);
    setCustomers(nextCustomers);
    setOrders(nextOrders);
    setTemplates(nextTemplates);
    setMeasurements(nextMeasurements);
    setSyncState(nextSyncState);
  }, []);

  useEffect(() => {
    let mounted = true;
    setBooting(true);
    setBootError('');
    const timeout = setTimeout(() => {
      if (mounted) {
        setBootError(copy.startupTimeout);
        setBooting(false);
      }
    }, 15_000);
    Promise.all([
      openLocalDatabase(),
      readSession(),
      SecureStore.getItemAsync(LANGUAGE_KEY),
    ]).then(([, savedSession, savedLanguage]) => {
      if (!mounted) return;
      setLocalReady(true);
      setSession(savedSession);
      if (savedLanguage === 'en' || savedLanguage === 'ur' || savedLanguage === 'ur-roman') {
        setLanguage(savedLanguage);
      }
    }).catch((bootError: unknown) => {
      if (mounted) setBootError(bootError instanceof Error ? bootError.message : copy.error);
    }).finally(() => {
      clearTimeout(timeout);
      if (mounted) setBooting(false);
    });
    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, [bootAttempt, copy.error, copy.startupTimeout]);

  useEffect(() => {
    let mounted = true;
    Network.getNetworkStateAsync().then((state) => {
      if (mounted) setOnline(state.isConnected === true && state.isInternetReachable !== false);
    }).catch(() => {
      if (mounted) setOnline(null);
    });
    const subscription = Network.addNetworkStateListener((state) => {
      setOnline(state.isConnected === true && state.isInternetReachable !== false);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (session) void refreshLocal(session.business.id).catch((loadError: unknown) => {
      setSyncError(loadError instanceof Error ? loadError.message : copy.error);
    });
  }, [session?.business.id, refreshLocal, copy.error]);

  const runSync = useCallback(async () => {
    if (!session || online !== true || syncLock.current) return;
    syncLock.current = true;
    setSyncing(true);
    setSyncError('');
    try {
      await synchronize(session, updateSession);
      await refreshLocal(session.business.id);
      if (session.permissions.includes('orders:read')) {
        const result = await apiRequest<{ data: Record<string, unknown> }>(
          session,
          '/api/v1/reports/dashboard',
          {},
          updateSession,
        );
        setDashboard(result.data);
      } else {
        setDashboard({});
      }
    } catch (syncFailure) {
      setSyncError(syncFailure instanceof Error ? syncFailure.message : copy.syncError);
    } finally {
      syncLock.current = false;
      setSyncing(false);
      await refreshLocal(session.business.id).catch(() => undefined);
    }
  }, [session, online, updateSession, refreshLocal, copy.syncError]);

  useEffect(() => {
    if (!session || online !== true) return;
    void runSync();
  }, [session?.business.id, online, runSync]);

  const membership = session?.permissions ?? [];
  const can = (permission: string) => membership.includes(permission);
  const pages: Array<{ id: Page; label: string }> = [
    { id: 'home', label: copy.home },
    ...(can('orders:read') ? [{ id: 'orders' as const, label: copy.orders }] : []),
    ...(can('customers:read') ? [{ id: 'customers' as const, label: copy.customers }] : []),
    ...(can('measurements:read') ? [{ id: 'measurements' as const, label: copy.measurements }] : []),
    ...(can('notifications:read') ? [{ id: 'notifications' as const, label: copy.notifications }] : []),
    ...(can('subscriptions:read') ? [{ id: 'subscription' as const, label: copy.subscription }] : []),
    { id: 'settings', label: copy.settings },
  ];

  const handleSignIn = async (businessId?: string) => {
    setAuthBusy(true);
    setError('');
    try {
      const result = await signIn(email.trim(), password, businessId);
      const shops = Array.isArray(result.businesses) ? result.businesses as ShopOption[] : [];
      if (result.requiresBusinessSelection === true) {
        setPendingCredentials({ email: email.trim(), password });
        setShopChoices(shops);
        return;
      }
      if (result.requiresScopeSelection === true) {
        throw new Error('This account needs a business membership before it can use the tailor app.');
      }
      const nextSession = await createSession(result);
      setNotificationHistory([]);
      setSession(nextSession);
      setPassword('');
      setShopChoices([]);
      setPendingCredentials(null);
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : copy.error);
    } finally {
      setAuthBusy(false);
    }
  };

  const selectShop = async (shop: ShopOption) => {
    if (!pendingCredentials) return;
    setAuthBusy(true);
    setError('');
    try {
      const result = await signIn(pendingCredentials.email, pendingCredentials.password, shop.id);
      const nextSession = await createSession(result);
      setNotificationHistory([]);
      setSession(nextSession);
      setPassword('');
      setShopChoices([]);
      setPendingCredentials(null);
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : copy.error);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (session && online === true) {
      try {
        await apiRequest(session, '/api/v1/auth/logout', {
          method: 'POST',
          body: { refreshToken: session.refreshToken },
        });
      } catch {
        Alert.alert(copy.signOut, copy.syncError);
      }
    }
    await clearSession();
    setNotificationHistory([]);
    setSession(null);
    setPage('home');
  };

  const changeLanguage = async (next: Language) => {
    await SecureStore.setItemAsync(LANGUAGE_KEY, next);
    setLanguage(next);
  };

  const submitSubscriptionPayment = async () => {
    if (!session || !subscriptionPlanId) return;
    setSaving(true);
    setError('');
    try {
      const response = await apiRequest<{ data?: unknown }>(
        session,
        '/api/v1/subscriptions/payments',
        {
          method: 'POST',
          body: {
            planId: subscriptionPlanId,
            cycle: subscriptionCycle,
            ...subscriptionPayment,
          },
        },
        updateSession,
      );
      if (!response.data) throw new Error(copy.error);
      setSubscriptionPayment((current) => ({ ...current, transactionReference: '', senderName: '' }));
      await refreshSubscriptionBilling();
      Alert.alert(copy.submitForReview, copy.pendingAdminReview);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : copy.error);
    } finally {
      setSaving(false);
    }
  };

  const saveCustomer = async () => {
    if (!session) return;
    setSaving(true);
    setError('');
    try {
      await saveCustomerOffline({
        businessId: session.business.id,
        name: customerName,
        phone: customerPhone,
        notes: customerNotes,
      });
      await refreshLocal(session.business.id);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerNotes('');
      setCustomerForm(false);
      if (online === true) void runSync();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : copy.error);
    } finally {
      setSaving(false);
    }
  };

  const saveOrder = async () => {
    if (!session) return;
    const customer = customers.find((item) => item.id === selectedCustomer);
    if (!customer) {
      setError(copy.chooseCustomer);
      return;
    }
    setSaving(true);
    setError('');
    try {
      amountToMinorUnits(unitPrice);
      await saveOrderOffline({
        businessId: session.business.id,
        customer,
        garmentName,
        quantity: Number(quantity),
        unitPrice,
        promisedAt: dueDate,
        notes: orderNotes,
      });
      await refreshLocal(session.business.id);
      setOrderForm(false);
      setGarmentName('');
      setQuantity('1');
      setUnitPrice('');
      setOrderNotes('');
      if (online === true) void runSync();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : copy.error);
    } finally {
      setSaving(false);
    }
  };

  const saveMeasurements = async () => {
    if (!session) return;
    const customer = customers.find((item) => item.id === measurementCustomer);
    const template = templates.find((item) => item.id === measurementTemplate);
    if (!customer || !template) {
      setError(copy.chooseCustomer);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveMeasurementOffline({
        businessId: session.business.id,
        customer,
        template,
        values: measurementValues,
        notes: measurementNotes,
      });
      await refreshLocal(session.business.id);
      setMeasurementForm(false);
      setMeasurementValues({});
      setMeasurementNotes('');
      if (online === true) void runSync();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : copy.error);
    } finally {
      setSaving(false);
    }
  };

  const transitionOrder = async (order: LocalOrder) => {
    if (!session || online !== true || order.sync_state !== 'synced') {
      setError(copy.paymentOnline);
      return;
    }
    const index = statusProgress.indexOf(order.status);
    const nextStatus = statusProgress[index + 1];
    if (!nextStatus) return;
    try {
      await apiRequest(session, `/api/v1/orders/${order.id}/status`, {
        method: 'POST',
        body: { toStatus: nextStatus, version: order.version },
      }, updateSession);
      await runSync();
    } catch (transitionError) {
      setError(transitionError instanceof Error ? transitionError.message : copy.error);
    }
  };

  const openOrderPayment = async (order: LocalOrder) => {
    if (!session || !can('payments:write') || online !== true || order.sync_state !== 'synced') {
      setError(copy.paymentOnline);
      return;
    }
    const existing = await findPendingPaymentAttempt(session.business.id, order.id);
    setPaymentOrder(order);
    setPaymentAttempt(existing ?? null);
    setPaymentAmount(existing?.amount ?? '');
    setPaymentMethod((existing?.method as 'CASH' | 'BANK' | 'DIGITAL') ?? 'CASH');
    setError('');
  };

  const recordPayment = async () => {
    if (!session || !paymentOrder || online !== true || paymentOrder.sync_state !== 'synced') {
      setError(copy.paymentOnline);
      return;
    }
    let amount: string;
    try {
      if (paymentAttempt && (paymentAmount !== paymentAttempt.amount || paymentMethod !== paymentAttempt.method)) {
        throw new Error(copy.paymentUnconfirmed);
      }
      amountToMinorUnits(paymentAmount);
      amount = paymentAmount;
      if (amountToMinorUnits(amount) <= 0n) throw new Error(copy.error);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : copy.error);
      return;
    }
    setSaving(true);
    const key = paymentAttempt?.idempotency_key ?? createClientId();
    const method = paymentAttempt?.method ?? paymentMethod;
    try {
      if (!paymentAttempt) {
        await createPaymentAttempt({
          idempotencyKey: key,
          businessId: session.business.id,
          orderId: paymentOrder.id,
          amount,
          method,
        });
        setPaymentAttempt({ idempotency_key: key, amount, method });
      }
      await apiRequest(session, `/api/v1/payments/orders/${paymentOrder.id}`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: { amount, method },
      }, updateSession);
      await updatePaymentAttempt(key, 'confirmed', null);
      Alert.alert(copy.orders, copy.saved);
      setPaymentOrder(null);
      setPaymentAttempt(null);
      setPaymentAmount('');
      await runSync();
    } catch (paymentError) {
      const message = paymentError instanceof Error ? paymentError.message : copy.error;
      if (paymentError instanceof ApiError && paymentError.status >= 400
        && paymentError.status < 500 && paymentError.status !== 401) {
        await updatePaymentAttempt(key, 'rejected', message);
        setPaymentAttempt(null);
      } else {
        await updatePaymentAttempt(key, 'pending', message);
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (booting) {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar style="dark" />
        <ActivityIndicator color="#116B55" size="large" />
        <Text style={styles.subtitle}>{copy.loading}</Text>
      </SafeAreaView>
    );
  }

  if (!localReady) {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar style="dark" />
        <Text style={styles.heading}>{copy.startupFailed}</Text>
        <Text accessibilityRole="alert" style={styles.errorText}>
          {bootError || copy.error}
        </Text>
        <ActionButton
          title={copy.retry}
          onPress={() => setBootAttempt((attempt) => attempt + 1)}
        />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={[styles.safe, rtl && styles.rtlLayout]}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.grow}>
          <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
            <View style={styles.languageRow}>
              {languageOptions.map((option) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: language === option.id }}
                  key={option.id}
                  onPress={() => void changeLanguage(option.id)}
                  style={[styles.languageChip, language === option.id && styles.languageChipSelected]}
                >
                  <Text style={styles.languageChipText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.brandMark}><Text style={styles.brandLetter}>D</Text></View>
            <Text style={styles.brandName}>{copy.app}</Text>
            <Text style={styles.tagline}>{copy.tagline}</Text>
            <View style={styles.card}>
              <Text style={styles.heading}>{shopChoices.length ? copy.chooseShop : copy.signInTitle}</Text>
              {shopChoices.length ? shopChoices.map((shop) => (
                <ActionButton key={shop.id} title={shop.name} onPress={() => void selectShop(shop)} disabled={authBusy} secondary />
              )) : (
                <>
                  <Field label={copy.email} value={email} onChangeText={setEmail} keyboardType="email-address" />
                  <Field label={copy.password} value={password} onChangeText={setPassword} secureTextEntry />
                  <Text style={styles.serverNote}>tailorapp.on.shiper.app</Text>
                  {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
                  <ActionButton title={authBusy ? copy.loading : copy.signIn} onPress={() => void handleSignIn()} disabled={authBusy || !email.trim() || !password} />
                </>
              )}
              {shopChoices.length && error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
              {authBusy ? <ActivityIndicator color="#116B55" style={styles.spinner} /> : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const filteredCustomers = customers.filter((customer) => {
    const query = search.trim().toLocaleLowerCase();
    return !query || customer.name.toLocaleLowerCase().includes(query) || customer.phone.includes(query);
  });
  const selectedTemplate = templates.find((item) => item.id === measurementTemplate);
  const dueOrders = orders.filter((order) => !['COLLECTED', 'CANCELLED'].includes(order.status));

  return (
    <SafeAreaView style={[styles.safe, rtl && styles.rtlLayout]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.brandName}>{copy.app}</Text>
          <Text style={styles.shopName}>{session.business.name}</Text>
        </View>
        <View style={styles.connection}>
          <DisplayStatus online={online} copy={copy} />
          <Text style={styles.connectionText}>{online === true ? copy.online : copy.offline}</Text>
        </View>
      </View>

      <View style={styles.workspace}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.syncCard}>
          <View style={styles.syncCopy}>
            <Text style={styles.syncTitle}>{syncing ? copy.syncing : syncState.pending ? `${syncState.pending} ${copy.pending}` : copy.lastSync}</Text>
            <Text style={styles.syncMeta}>
              {syncState.last_successful_sync
                ? new Date(syncState.last_successful_sync).toLocaleString()
                : copy.never}
            </Text>
            {syncError || syncState.attention > 0 ? (
              <Text style={styles.syncError}>{syncError || `${syncState.attention} ${copy.attention}`}</Text>
            ) : null}
          </View>
          <Pressable accessibilityRole="button" disabled={syncing || online !== true} onPress={() => void runSync()} style={styles.syncButton}>
            <Text style={styles.syncButtonText}>{syncing ? '…' : copy.retry}</Text>
          </Pressable>
        </View>

        {error ? <Text accessibilityRole="alert" style={styles.errorBanner}>{error}</Text> : null}

        {page === 'home' ? (
          <>
            <Text style={styles.pageTitle}>{copy.welcome}</Text>
            <View style={styles.metricsGrid}>
              {[
                [copy.dashboardNew, String(dashboard.newOrders ?? orders.filter((item) => item.status === 'NEW').length)],
                [copy.inProgress, String(dashboard.inProgress ?? orders.filter((item) => ['CUTTING', 'STITCHING', 'FINISHING'].includes(item.status)).length)],
                [copy.due, String(dashboard.dueToday ?? 0)],
                [copy.overdue, String(dashboard.overdue ?? 0)],
              ].map(([label, value]) => (
                <View key={label} style={styles.metricCard}>
                  <Text style={styles.metricValue}>{value}</Text>
                  <Text style={styles.metricLabel}>{label}</Text>
                </View>
              ))}
            </View>
            {can('payments:read') ? (
              <View style={styles.moneyCard}>
                <View style={styles.moneyRow}>
                  <Text style={styles.moneyLabel}>{copy.outstanding}</Text>
                  <Text style={styles.moneyValue}>{formatPkr(String(dashboard.outstanding ?? '0.00'))}</Text>
                </View>
                <View style={styles.moneyRow}>
                  <Text style={styles.moneyLabel}>{copy.collected}</Text>
                  <Text style={styles.moneyValue}>{formatPkr(String(dashboard.collectedToday ?? '0.00'))}</Text>
                </View>
              </View>
            ) : null}
            <Text style={styles.sectionTitle}>{copy.orders}</Text>
            {orders.slice(0, 3).map((order) => (
              <View key={order.id} style={styles.listCard}>
                <View style={styles.listMain}>
                  <Text style={styles.listTitle}>{order.garment_name} · {order.customer_name}</Text>
                  <Text style={styles.listMeta}>{order.status.replaceAll('_', ' ')} · {order.promised_at.slice(0, 10)}</Text>
                </View>
                <Text style={styles.listPrice}>{formatPkr(order.total)}</Text>
              </View>
            ))}
          </>
        ) : null}

        {page === 'customers' ? (
          <>
            <View style={styles.pageHeadingRow}>
              <View><Text style={styles.pageTitle}>{copy.customers}</Text><Text style={styles.subtitle}>{customers.length} {copy.customers.toLocaleLowerCase()}</Text></View>
              {can('customers:write') ? <ActionButton title={`＋ ${copy.addCustomer}`} onPress={() => { setError(''); setCustomerForm(!customerForm); }} /> : null}
            </View>
            <Field label={copy.search} value={search} onChangeText={setSearch} />
            {customerForm ? (
              <View style={styles.card}>
                <Field label={copy.customerName} value={customerName} onChangeText={setCustomerName} />
                <Field label={copy.phone} value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad" />
                <Field label={copy.notes} value={customerNotes} onChangeText={setCustomerNotes} multiline />
                <Text style={styles.offlineHint}>{copy.saved}</Text>
                <ActionButton title={saving ? '…' : copy.save} onPress={() => void saveCustomer()} disabled={saving} />
              </View>
            ) : null}
            {filteredCustomers.length ? filteredCustomers.map((customer) => (
              <View key={customer.id} style={styles.listCard}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{customer.name.slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.listMain}>
                  <Text style={styles.listTitle}>{customer.name}</Text>
                  <Text style={styles.listMeta}>{customer.phone}</Text>
                </View>
                <Text style={styles.syncBadge}>{customer.sync_state === 'synced' ? '✓' : '↑'}</Text>
              </View>
            )) : <View style={styles.emptyCard}><Text style={styles.emptyText}>{copy.emptyCustomers}</Text></View>}
          </>
        ) : null}

        {page === 'orders' ? (
          <>
            <View style={styles.pageHeadingRow}>
              <View><Text style={styles.pageTitle}>{copy.orders}</Text><Text style={styles.subtitle}>{orders.length} {copy.orders.toLocaleLowerCase()}</Text></View>
              {can('orders:write') ? <ActionButton title={`＋ ${copy.newOrder}`} onPress={() => { setError(''); setOrderForm(!orderForm); }} /> : null}
            </View>
            {orderForm ? (
              <View style={styles.card}>
                <Text style={styles.fieldLabel}>{copy.chooseCustomer}</Text>
                <View style={styles.chipWrap}>
                  {customers.map((customer) => (
                    <Pressable key={customer.id} onPress={() => setSelectedCustomer(customer.id)} style={[styles.chip, selectedCustomer === customer.id && styles.chipSelected]}>
                      <Text style={[styles.chipText, selectedCustomer === customer.id && styles.chipTextSelected]}>{customer.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Field label={copy.garment} value={garmentName} onChangeText={setGarmentName} />
                <View style={styles.twoFields}>
                  <View style={styles.halfField}><Field label={copy.quantity} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" /></View>
                  <View style={styles.halfField}><Field label={copy.unitPrice} value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" /></View>
                </View>
                <Field label={copy.dueDate} value={dueDate} onChangeText={setDueDate} />
                <Field label={copy.notes} value={orderNotes} onChangeText={setOrderNotes} multiline />
                <Text style={styles.offlineHint}>{copy.saved}</Text>
                <ActionButton title={saving ? '…' : copy.saveOrder} onPress={() => void saveOrder()} disabled={saving || customers.length === 0} />
              </View>
            ) : null}
            {orders.length ? orders.map((order) => {
              const index = statusProgress.indexOf(order.status);
              const next = statusProgress[index + 1];
              return (
                <View key={order.id} style={styles.orderCard}>
                  <View style={styles.orderTop}>
                    <View style={styles.listMain}>
                      <Text style={styles.listTitle}>{order.garment_name} · {order.customer_name}</Text>
                      <Text style={styles.listMeta}>{order.status.replaceAll('_', ' ')} · {order.promised_at.slice(0, 10)}</Text>
                    </View>
                    <Text style={styles.listPrice}>{formatPkr(order.total)}</Text>
                  </View>
                  {order.sync_state !== 'synced' ? <Text style={styles.pendingLabel}>{copy.pending}</Text> : null}
                  {next && can('orders:transition') ? <ActionButton title={`${copy.nextStage}: ${next.replaceAll('_', ' ')}`} onPress={() => void transitionOrder(order)} secondary disabled={online !== true || order.sync_state !== 'synced'} /> : null}
                  {can('payments:write') ? (
                    paymentOrder?.id === order.id ? (
                      <View style={styles.paymentForm}>
                        <Field
                          label={copy.paymentAmount}
                          value={paymentAmount}
                          onChangeText={setPaymentAmount}
                          keyboardType="decimal-pad"
                          editable={!paymentAttempt}
                        />
                        <View style={styles.chipWrap}>
                          {(['CASH', 'BANK', 'DIGITAL'] as const).map((method, index) => (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ selected: method === paymentMethod, disabled: Boolean(paymentAttempt) }}
                              disabled={Boolean(paymentAttempt)}
                              key={method}
                              onPress={() => setPaymentMethod(method)}
                              style={[styles.chip, paymentMethod === method && styles.chipSelected]}
                            >
                              <Text style={[styles.chipText, paymentMethod === method && styles.chipTextSelected]}>{copy.paymentMethods[index]}</Text>
                            </Pressable>
                          ))}
                        </View>
                        {paymentAttempt ? <Text style={styles.offlineHint}>{copy.paymentUnconfirmed}</Text> : null}
                        <ActionButton title={saving ? '…' : paymentAttempt ? copy.retry : copy.recordPayment} onPress={() => void recordPayment()} disabled={saving || online !== true} />
                        <ActionButton title={copy.cancel} onPress={() => { setPaymentOrder(null); setPaymentAttempt(null); }} secondary disabled={saving} />
                      </View>
                    ) : (
                      <ActionButton title={copy.recordPayment} onPress={() => void openOrderPayment(order)} secondary disabled={online !== true || order.sync_state !== 'synced'} />
                    )
                  ) : null}
                </View>
              );
            }) : <View style={styles.emptyCard}><Text style={styles.emptyText}>{copy.emptyOrders}</Text></View>}
          </>
        ) : null}

        {page === 'measurements' ? (
          <>
            <View style={styles.pageHeadingRow}>
              <View><Text style={styles.pageTitle}>{copy.measurements}</Text><Text style={styles.subtitle}>{measurements.length} revisions</Text></View>
              {can('measurements:write') ? <ActionButton title={`＋ ${copy.saveMeasurement}`} onPress={() => { setError(''); setMeasurementForm(!measurementForm); }} /> : null}
            </View>
            {measurementForm ? (
              <View style={styles.card}>
                <Text style={styles.fieldLabel}>{copy.chooseCustomer}</Text>
                <View style={styles.chipWrap}>
                  {customers.map((customer) => (
                    <Pressable key={customer.id} onPress={() => setMeasurementCustomer(customer.id)} style={[styles.chip, measurementCustomer === customer.id && styles.chipSelected]}>
                      <Text style={[styles.chipText, measurementCustomer === customer.id && styles.chipTextSelected]}>{customer.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>{copy.chooseGarment}</Text>
                <View style={styles.chipWrap}>
                  {templates.map((template) => (
                    <Pressable key={template.id} onPress={() => { setMeasurementTemplate(template.id); setMeasurementValues({}); }} style={[styles.chip, measurementTemplate === template.id && styles.chipSelected]}>
                      <Text style={[styles.chipText, measurementTemplate === template.id && styles.chipTextSelected]}>{template.name}</Text>
                    </Pressable>
                  ))}
                </View>
                {!templates.length ? <Text style={styles.offlineHint}>{copy.noTemplates}</Text> : null}
                {selectedTemplate?.fields.map((field) => (
                  <Field
                    key={field.key}
                    label={`${field.label}${field.required ? ' *' : ''} (${field.unit})`}
                    value={measurementValues[field.key] ?? ''}
                    onChangeText={(value) => setMeasurementValues((current) => ({ ...current, [field.key]: value }))}
                    keyboardType="decimal-pad"
                  />
                ))}
                <Field label={copy.notes} value={measurementNotes} onChangeText={setMeasurementNotes} multiline />
                <ActionButton title={saving ? '…' : copy.saveMeasurement} onPress={() => void saveMeasurements()} disabled={saving || !selectedTemplate} />
              </View>
            ) : null}

            {measurements.length ? measurements.map((record) => {
              const customer = customers.find((item) => item.id === record.customer_id);
              return (
                <View key={record.id} style={styles.listCard}>
                  <View style={styles.listMain}>
                    <Text style={styles.listTitle}>{customer?.name ?? '—'} · {record.template_name}</Text>
                    <Text style={styles.listMeta}>{new Date(record.measured_at).toLocaleDateString()}</Text>
                    <Text style={styles.listMeta}>{Object.entries(JSON.parse(record.values_json) as Record<string, string>).map(([key, value]) => `${key}: ${value}`).join(' · ')}</Text>
                  </View>
                </View>
              );
            }) : <View style={styles.emptyCard}><Text style={styles.emptyText}>{copy.emptyMeasurements}</Text></View>}
          </>
        ) : null}

        {page === 'notifications' ? (
          <>
            <Text style={styles.pageTitle}>{copy.notificationHistory}</Text>
            {online !== true ? (
              <View style={styles.emptyCard}><Text style={styles.emptyText}>{copy.notificationsOnline}</Text></View>
            ) : notificationHistory.length ? notificationHistory.map((notification) => {
              const statusLabel = {
                QUEUED: copy.queued,
                SENT: copy.sent,
                DELIVERED: copy.delivered,
                READ: copy.read,
                FAILED: copy.failed,
                NOT_SENT: copy.notSent,
              }[notification.status];
              return (
                <View key={notification.id} style={styles.listCard}>
                  <View style={styles.listMain}>
                    <Text style={styles.listTitle}>{notification.kind.replaceAll('_', ' ').toLowerCase()}</Text>
                    <Text style={styles.listMeta}>{notification.recipientPhone || '—'} · {new Date(notification.createdAt).toLocaleString()}</Text>
                    {notification.lastError ? <Text style={styles.syncError}>{notification.lastError}</Text> : null}
                  </View>
                  <Text style={styles.syncBadge}>{statusLabel}</Text>
                </View>
              );
            }) : (
              <View style={styles.emptyCard}><Text style={styles.emptyText}>{copy.emptyNotifications}</Text></View>
            )}
            {online === true ? <ActionButton title={copy.retry} onPress={() => void refreshNotificationHistory()} secondary /> : null}
            <Text style={styles.offlineHint}>{copy.sent} confirms Meta accepted the message. {copy.delivered} and {copy.read.toLowerCase()} require verified status callbacks.</Text>
          </>
        ) : null}

        {page === 'subscription' ? (
          <>
            <Text style={styles.pageTitle}>{copy.subscriptionTitle}</Text>
            {online !== true ? (
              <View style={styles.emptyCard}><Text style={styles.emptyText}>{copy.subscriptionOnline}</Text></View>
            ) : subscriptionBilling ? (
              <>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>{copy.currentPlan}</Text>
                  {subscriptionBilling.subscription ? (
                    <>
                      <Text style={styles.listTitle}>{subscriptionBilling.subscription.plan.name}{subscriptionBilling.subscription.grandfathered ? ' · Legacy access' : subscriptionBilling.subscription.complimentary ? ' · Complimentary' : ''}</Text>
                      <Text style={styles.listMeta}>{subscriptionBilling.subscription.status} · {copy.subscriptionValidTo}: {new Date(subscriptionBilling.subscription.endsAt).toLocaleDateString()}</Text>
                    </>
                  ) : <Text style={styles.listMeta}>{copy.noSubscription}</Text>}
                </View>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>{copy.paymentInstructions}</Text>
                  <Text style={styles.listMeta}>{subscriptionBilling.paymentInstructions || copy.subscriptionOnline}</Text>
                  {subscriptionBilling.supportContact ? <Text style={styles.listMeta}>{subscriptionBilling.supportContact}</Text> : null}
                </View>
                {can('subscriptions:manage') && subscriptionBilling.plans.length ? (
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>{copy.requestRenewal}</Text>
                    <Text style={styles.fieldLabel}>{copy.plan}</Text>
                    <View style={styles.chipWrap}>
                      {subscriptionBilling.plans.map((plan) => (
                        <Pressable
                          key={plan.id}
                          onPress={() => {
                            setSubscriptionPlanId(plan.id);
                            setSubscriptionPayment((current) => ({
                              ...current,
                              amount: subscriptionCycle === 'MONTHLY' ? plan.monthlyPrice : plan.yearlyPrice,
                            }));
                          }}
                          style={[styles.chip, subscriptionPlanId === plan.id && styles.chipSelected]}
                        >
                          <Text style={[styles.chipText, subscriptionPlanId === plan.id && styles.chipTextSelected]}>{plan.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={styles.fieldLabel}>{copy.billingCycle}</Text>
                    <View style={styles.chipWrap}>
                      {(['MONTHLY', 'YEARLY'] as const).map((cycle) => (
                        <Pressable
                          key={cycle}
                          onPress={() => {
                            setSubscriptionCycle(cycle);
                            const selected = subscriptionBilling.plans.find((plan) => plan.id === subscriptionPlanId);
                            setSubscriptionPayment((current) => ({
                              ...current,
                              amount: selected ? (cycle === 'MONTHLY' ? selected.monthlyPrice : selected.yearlyPrice) : '',
                            }));
                          }}
                          style={[styles.chip, subscriptionCycle === cycle && styles.chipSelected]}
                        >
                          <Text style={[styles.chipText, subscriptionCycle === cycle && styles.chipTextSelected]}>{cycle === 'MONTHLY' ? copy.monthly : copy.yearly}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={styles.fieldLabel}>{copy.paymentMethod}</Text>
                    <View style={styles.chipWrap}>
                      {subscriptionBilling.paymentMethods.map((method) => (
                        <Pressable key={method} onPress={() => setSubscriptionPayment((current) => ({ ...current, method }))} style={[styles.chip, subscriptionPayment.method === method && styles.chipSelected]}>
                          <Text style={[styles.chipText, subscriptionPayment.method === method && styles.chipTextSelected]}>{method}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Field label={copy.subscriptionAmount} value={subscriptionPayment.amount} onChangeText={(amount) => setSubscriptionPayment((current) => ({ ...current, amount }))} keyboardType="decimal-pad" />
                    <Field label={copy.transactionReference} value={subscriptionPayment.transactionReference} onChangeText={(transactionReference) => setSubscriptionPayment((current) => ({ ...current, transactionReference }))} />
                    <Field label={copy.senderName} value={subscriptionPayment.senderName} onChangeText={(senderName) => setSubscriptionPayment((current) => ({ ...current, senderName }))} />
                    <Field label={copy.paymentDate} value={subscriptionPayment.paymentDate} onChangeText={(paymentDate) => setSubscriptionPayment((current) => ({ ...current, paymentDate }))} />
                    <Text style={styles.offlineHint}>{copy.pendingAdminReview}</Text>
                    <ActionButton
                      title={saving ? '…' : copy.submitForReview}
                      onPress={() => void submitSubscriptionPayment()}
                      disabled={saving || !subscriptionPlanId || !subscriptionPayment.method || Number(subscriptionPayment.amount) <= 0 || !subscriptionPayment.transactionReference || !subscriptionPayment.senderName || !subscriptionPayment.paymentDate}
                    />
                  </View>
                ) : null}
                <Text style={styles.sectionTitle}>{copy.subscriptionHistory}</Text>
                {subscriptionBilling.payments.length ? subscriptionBilling.payments.map((payment) => (
                  <View key={payment.id} style={styles.listCard}>
                    <View style={styles.listMain}>
                      <Text style={styles.listTitle}>{payment.plan.name} · {payment.status}</Text>
                      <Text style={styles.listMeta}>{formatPkr(payment.amount)} · {payment.method} · {new Date(payment.createdAt).toLocaleDateString()}</Text>
                      <Text style={styles.listMeta}>{payment.transactionReference} · {payment.senderName}</Text>
                      {payment.invoiceNumber ? <Text style={styles.syncBadge}>{copy.receipt}: {payment.invoiceNumber}</Text> : null}
                    </View>
                  </View>
                )) : <View style={styles.emptyCard}><Text style={styles.emptyText}>{copy.noSubscriptionPayments}</Text></View>}
              </>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>{copy.subscriptionOnline}</Text>
                {online === true ? <ActionButton title={copy.retry} onPress={() => void refreshSubscriptionBilling()} secondary /> : null}
              </View>
            )}
          </>
        ) : null}

        {page === 'settings' ? (
          <>
            <Text style={styles.pageTitle}>{copy.settings}</Text>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{copy.language}</Text>
              {languageOptions.map((option) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: language === option.id }}
                  key={option.id}
                  onPress={() => void changeLanguage(option.id)}
                  style={styles.languageRow}
                >
                  <Text style={styles.listTitle}>{option.label}</Text>
                  <Text style={styles.radio}>{language === option.id ? '●' : '○'}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{session.business.name}</Text>
              <Text style={styles.listMeta}>{session.user.name} · {session.user.email}</Text>
              <ActionButton title={copy.signOut} onPress={() => void handleSignOut()} secondary />
            </View>
          </>
        ) : null}
        </ScrollView>

        <View style={styles.tabBar}>
          {pages.map((item) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: page === item.id }}
              key={item.id}
              onPress={() => { setPage(item.id); setError(''); }}
              style={styles.tab}
            >
              <View style={[styles.tabMark, page === item.id && styles.tabMarkActive]} />
              <Text numberOfLines={1} style={[styles.tabLabel, page === item.id && styles.tabLabelActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  workspace: { flex: 1, minHeight: 0, backgroundColor: '#F4F7F5' },
  rtlLayout: { direction: 'rtl' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F7F5' },
  authContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: 18, paddingBottom: 30 },
  header: { minHeight: 68, paddingHorizontal: 18, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E9EFEB' },
  headerCopy: { flex: 1 },
  brandMark: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#116B55', marginBottom: 13 },
  brandLetter: { color: '#FFFFFF', fontSize: 25, fontWeight: '900' },
  brandName: { color: '#116B55', fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },
  tagline: { color: '#71827A', fontSize: 13, marginTop: 5, marginBottom: 27 },
  shopName: { color: '#75857D', fontSize: 11, marginTop: 2 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#F2F6F3', borderRadius: 18 },
  connectionDot: { width: 8, height: 8, borderRadius: 4 },
  onlineDot: { backgroundColor: '#27A56D' },
  offlineDot: { backgroundColor: '#D28B38' },
  connectionText: { color: '#52665C', fontSize: 11, fontWeight: '700' },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 },
  syncCard: { backgroundColor: '#EAF3EE', borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  syncCopy: { flex: 1, paddingRight: 8 },
  syncTitle: { color: '#245A45', fontSize: 12, fontWeight: '800' },
  syncMeta: { color: '#75877D', fontSize: 10, marginTop: 4 },
  syncError: { color: '#A54334', fontSize: 10, marginTop: 4 },
  syncButton: { backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 },
  syncButtonText: { color: '#176B54', fontSize: 11, fontWeight: '800' },
  pageTitle: { color: '#17342B', fontSize: 25, fontWeight: '900', marginBottom: 14 },
  subtitle: { color: '#798A81', fontSize: 12, marginTop: -8, marginBottom: 14 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 },
  metricCard: { width: '48%', flexGrow: 1, minHeight: 88, borderRadius: 16, padding: 15, backgroundColor: '#FFFFFF', borderColor: '#E7EEEA', borderWidth: 1 },
  metricValue: { color: '#176B54', fontSize: 25, fontWeight: '900' },
  metricLabel: { color: '#728279', fontSize: 11, marginTop: 5 },
  moneyCard: { backgroundColor: '#173F33', borderRadius: 16, padding: 16, marginBottom: 23 },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  moneyLabel: { color: '#C4D9CE', fontSize: 12 },
  moneyValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  sectionTitle: { color: '#233A31', fontSize: 15, fontWeight: '800', marginTop: 6, marginBottom: 11 },
  pageHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 17, borderWidth: 1, borderColor: '#E5ECE7', marginBottom: 14 },
  paymentForm: { borderTopWidth: 1, borderTopColor: '#E7EEEA', marginTop: 9, paddingTop: 10 },
  heading: { color: '#17342B', fontSize: 19, fontWeight: '800', marginBottom: 14 },
  field: { marginBottom: 12 },
  fieldLabel: { color: '#53675D', fontSize: 11, fontWeight: '800', marginBottom: 6 },
  input: { minHeight: 46, borderRadius: 11, borderWidth: 1, borderColor: '#DCE6DF', paddingHorizontal: 12, color: '#1C342A', fontSize: 14, backgroundColor: '#FFFFFF' },
  multiline: { minHeight: 76, textAlignVertical: 'top', paddingTop: 11 },
  actionButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#176B54', paddingHorizontal: 14, paddingVertical: 10, marginTop: 5 },
  actionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  secondaryButton: { backgroundColor: '#EDF4EF', borderWidth: 1, borderColor: '#DCEAE0' },
  secondaryText: { color: '#176B54' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  spinner: { marginTop: 10 },
  errorText: { color: '#A33E32', fontSize: 12, lineHeight: 17, marginTop: 8 },
  errorBanner: { color: '#9F3A30', backgroundColor: '#FCEDEA', borderRadius: 10, padding: 11, fontSize: 12, marginBottom: 13 },
  serverNote: { color: '#84938C', fontSize: 10, marginTop: 2 },
  offlineHint: { color: '#778980', fontSize: 11, lineHeight: 16, marginBottom: 7 },
  listCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EEEA', borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 11 },
  orderCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EEEA', borderRadius: 16, padding: 14, marginBottom: 10 },
  orderTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 7 },
  listMain: { flex: 1 },
  listTitle: { color: '#263C32', fontSize: 13, fontWeight: '800' },
  listMeta: { color: '#839088', fontSize: 10, marginTop: 4 },
  listPrice: { color: '#176B54', fontSize: 12, fontWeight: '900' },
  avatar: { height: 38, width: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#E5F0E9' },
  avatarText: { color: '#176B54', fontSize: 15, fontWeight: '900' },
  syncBadge: { color: '#7C9A89', fontWeight: '900' },
  pendingLabel: { color: '#A66D24', fontSize: 10, fontWeight: '700', marginBottom: 4 },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 15, padding: 22, borderWidth: 1, borderColor: '#E8EEEA' },
  emptyText: { color: '#74847B', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  chip: { borderWidth: 1, borderColor: '#DCE6DF', borderRadius: 18, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: '#FFFFFF' },
  chipSelected: { backgroundColor: '#E7F2EB', borderColor: '#95BFA9' },
  chipText: { color: '#62746A', fontSize: 11, fontWeight: '700' },
  chipTextSelected: { color: '#176B54' },
  twoFields: { flexDirection: 'row', gap: 10 },
  halfField: { flex: 1 },
  languageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  languageChip: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: '#E3EBE5' },
  languageChipSelected: { backgroundColor: '#E7F2EB', borderColor: '#9ABFA9' },
  languageChipText: { color: '#456155', fontSize: 10, fontWeight: '700' },
  radio: { color: '#176B54', fontSize: 17 },
  tabBar: { minHeight: 62, paddingTop: 4, paddingBottom: 4, paddingHorizontal: 4, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E7EDE9' },
  tab: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tabMark: { width: 18, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
  tabMarkActive: { backgroundColor: '#176B54' },
  tabLabel: { color: '#89968F', fontSize: 9, fontWeight: '700' },
  tabLabelActive: { color: '#176B54' },
});
