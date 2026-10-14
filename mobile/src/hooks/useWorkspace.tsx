/**
 * Workspace hook + context.
 *
 * This file is the single source of truth for the signed-in user's data,
 * preferences, business configuration, sync state and form state. It is
 * extracted from the original `App.tsx` so that each screen can subscribe
 * via `useWorkspace()` instead of receiving 30+ props.
 *
 * The data flow, business logic, and API calls are identical to the
 * pre-refactor code. The only structural change is that the screen
 * components have moved out into `mobile/src/screens/*` and consume
 * the values below through the context.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type React from 'react';
import { Alert } from 'react-native';
import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import {
  ApiError,
  API_BASE_URL,
  apiRequest,
  clearSession,
  createSession,
  parseBusinessConfiguration,
  readSession,
  revokeSession,
  signIn,
  storeSession,
  subscribeToSessionExpired,
  type BusinessConfiguration,
  type Session,
} from '../api';
import {
  amountToMinorUnits,
  createClientId,
  openLocalDatabase,
  readBusinessConfigurationCache,
  writeBusinessConfigurationCache,
  type LocalCatalogItem,
  type LocalCustomer,
  type LocalOrder,
  type LocalTemplate,
} from '../local';
import {
  applyLocalOrderWorkflowTransition,
  createPaymentAttempt,
  findPendingPaymentAttempt,
  loadCatalogItems,
  loadCustomers,
  loadMeasurements,
  loadOrders,
  loadSyncState,
  loadTemplates,
  refreshCatalogItems,
  saveCatalogItemOffline,
  saveCustomerOffline,
  saveMeasurementOffline,
  saveOrderOffline,
  synchronize,
  updatePaymentAttempt,
} from '../sync';
import { getCopy, languageOptions, type Language } from '../i18n';
import { resolveBrandAssetUrl } from '../theme/branding';
import { useAppTheme } from '../theme/palette';

export type Page =
  | 'home'
  | 'orders'
  | 'catalog'
  | 'customers'
  | 'measurements'
  | 'notifications'
  | 'subscription'
  | 'settings'
  | 'business-settings'
  | 'payments'
  | 'analytics'
  | 'more'
  | 'activity';

export type WhatsAppNotification = {
  id: string;
  customerId: string | null;
  orderId: string | null;
  paymentId: string | null;
  recipientName: string | null;
  kind: string;
  status: 'QUEUED' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'NOT_SENT';
  recipientPhone: string;
  lastError: string | null;
  renderedMessage?: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
};

type ShopOption = { id: string; name: string };
export type BusinessRole = {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
  memberCount: number;
};
export type BusinessPermission = { key: string; description: string };
export type BusinessMember = {
  id: string;
  active: boolean;
  createdAt: string;
  user: { id: string; name: string; email: string; active: boolean };
  role: { id: string; name: string };
};
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
const THEME_KEY = 'tailorapp.theme.v1';
const BRANDING_CACHE_KEY = 'tailorapp.application-branding.v1';

export type WorkspaceContextValue = {
  copy: ReturnType<typeof getCopy>;
  rtl: boolean;
  language: Language;
  setLanguage: (next: Language) => Promise<void>;
  languageOptions: typeof languageOptions;

  branding: ReturnType<typeof useAppTheme>['branding'];
  themeMode: ReturnType<typeof useAppTheme>['themeMode'];
  palette: ReturnType<typeof useAppTheme>['palette'];

  // App lifecycle
  booting: boolean;
  localReady: boolean;
  bootError: string;
  bootAttempt: number;
  retryBoot: () => void;

  // Auth
  session: Session | null;
  online: boolean | null;

  // Workspace
  businessConfiguration: BusinessConfiguration | null;
  customers: LocalCustomer[];
  orders: LocalOrder[];
  catalogItems: LocalCatalogItem[];
  templates: LocalTemplate[];
  measurements: Array<{ id: string; customer_id: string; template_name: string; values_json: string; measured_at: string; sync_state: string }>;
  syncState: SyncState;
  syncError: string;
  syncing: boolean;
  dashboard: Record<string, unknown>;
  notificationHistory: WhatsAppNotification[];
  subscriptionBilling: SubscriptionBilling | null;

  // Form state
  error: string;
  setError: (next: string) => void;
  search: string;
  setSearch: (next: string) => void;
  customerForm: boolean;
  setCustomerForm: (next: boolean) => void;
  customerName: string;
  setCustomerName: (next: string) => void;
  customerPhone: string;
  setCustomerPhone: (next: string) => void;
  customerNotes: string;
  setCustomerNotes: (next: string) => void;
  customerCustomFields: Record<string, unknown>;
  setCustomerCustomFields: (next: Record<string, unknown>) => void;
  catalogForm: boolean;
  setCatalogForm: (next: boolean) => void;
  catalogName: string;
  setCatalogName: (next: string) => void;
  catalogDescription: string;
  setCatalogDescription: (next: string) => void;
  catalogTypeKey: string;
  setCatalogTypeKey: (next: string) => void;
  catalogSku: string;
  setCatalogSku: (next: string) => void;
  catalogUnit: string;
  setCatalogUnit: (next: string) => void;
  catalogUnitPrice: string;
  setCatalogUnitPrice: (next: string) => void;
  catalogCustomFields: Record<string, unknown>;
  setCatalogCustomFields: (next: Record<string, unknown>) => void;
  orderForm: boolean;
  setOrderForm: (next: boolean) => void;
  selectedCustomer: string;
  setSelectedCustomer: (next: string) => void;
  itemName: string;
  setItemName: (next: string) => void;
  orderItemTypeKey: string;
  setOrderItemTypeKey: (next: string) => void;
  orderCustomFields: Record<string, unknown>;
  setOrderCustomFields: (next: Record<string, unknown>) => void;
  orderItemCustomFields: Record<string, unknown>;
  setOrderItemCustomFields: (next: Record<string, unknown>) => void;
  quantity: string;
  setQuantity: (next: string) => void;
  unitPrice: string;
  setUnitPrice: (next: string) => void;
  dueDate: string;
  setDueDate: (next: string) => void;
  orderNotes: string;
  setOrderNotes: (next: string) => void;
  measurementForm: boolean;
  setMeasurementForm: (next: boolean) => void;
  measurementCustomer: string;
  setMeasurementCustomer: (next: string) => void;
  measurementTemplate: string;
  setMeasurementTemplate: (next: string) => void;
  measurementValues: Record<string, string>;
  setMeasurementValues: (next: Record<string, string>) => void;
  measurementNotes: string;
  setMeasurementNotes: (next: string) => void;
  paymentOrder: LocalOrder | null;
  paymentAmount: string;
  setPaymentAmount: (next: string) => void;
  paymentMethod: string;
  setPaymentMethod: (next: string) => void;
  paymentAttempt: { idempotency_key: string; amount: string; method: string } | null;
  saving: boolean;
  transitioningOrderKey: string | null;
  openingPaymentOrderId: string | null;
  togglingCatalogId: string | null;
  loadingNotifications: boolean;
  loadingSubscription: boolean;
  selectingShopId: string | null;

  // Subscription form
  subscriptionPlanId: string;
  setSubscriptionPlanId: (next: string) => void;
  subscriptionCycle: 'MONTHLY' | 'YEARLY';
  setSubscriptionCycle: (next: 'MONTHLY' | 'YEARLY') => void;
  subscriptionPayment: { transactionReference: string; senderName: string; amount: string; method: string; paymentDate: string };
  setSubscriptionPayment: (
    next:
      | { transactionReference: string; senderName: string; amount: string; method: string; paymentDate: string }
      | ((current: { transactionReference: string; senderName: string; amount: string; method: string; paymentDate: string }) => {
          transactionReference: string;
          senderName: string;
          amount: string;
          method: string;
          paymentDate: string;
        }),
  ) => void;

  // Computed helpers
  membership: string[];
  can: (permission: string) => boolean;
  term: (key: string, fallback: string) => string;
  moduleEnabled: (module: string) => boolean;
  paymentMethodOptions: string[];
  paymentMethodLabel: (method: string) => string;
  selectedCatalogTypeKey: string;
  visibleCatalogFields: BusinessConfiguration['fields'];
  selectedTemplate: LocalTemplate | undefined;
  currentItemType: BusinessConfiguration['itemTypes'][number] | undefined;
  orderItemFieldDefinitions: BusinessConfiguration['fields'];
  orderItemFields: BusinessConfiguration['fields'];
  orderFields: BusinessConfiguration['fields'];
  customerFields: BusinessConfiguration['fields'];
  catalogFields: BusinessConfiguration['fields'];
  stageLabel: (key: string) => string;

  // Actions
  erpRequest: <T = unknown>(route: string, options?: { method?: string; body?: unknown; idempotencyKey?: string }) => Promise<T>;
  handleSignIn: (businessId?: string) => Promise<void>;
  selectShop: (shop: ShopOption) => Promise<void>;
  handleSignOut: () => Promise<void>;
  changeLanguage: (next: Language) => Promise<void>;
  submitSubscriptionPayment: () => Promise<void>;
  saveCustomer: () => Promise<void>;
  saveOrder: () => Promise<void>;
  saveMeasurements: () => Promise<void>;
  saveCatalogItem: () => Promise<void>;
  toggleCatalogItem: (item: LocalCatalogItem) => Promise<void>;
  transitionOrder: (order: LocalOrder, targetStageKey?: string) => Promise<void>;
  openOrderPayment: (order: LocalOrder) => Promise<void>;
  recordPayment: () => Promise<void>;
  runSync: () => Promise<void>;
  refreshNotificationHistory: () => Promise<void>;
  refreshSubscriptionBilling: () => Promise<void>;
  cancelOrderPayment: () => void;
  saveBusinessConfiguration: (patch: Record<string, unknown>) => Promise<boolean>;
  fetchRoles: () => Promise<BusinessRole[]>;
  fetchBusinessPermissions: () => Promise<BusinessPermission[]>;
  fetchBusinessStaff: () => Promise<BusinessMember[]>;
  createBusinessRole: (input: { name: string; permissions: string[] }) => Promise<BusinessRole>;
  inviteStaffMember: (input: { name: string; email: string; initialPassword: string; roleId: string }) => Promise<BusinessMember>;

  // Auth-only
  email: string;
  setEmail: (next: string) => void;
  password: string;
  setPassword: (next: string) => void;
  authBusy: boolean;
  shopChoices: ShopOption[];
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function karachiDateInput(): string {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function mobileFieldVisible(
  field: BusinessConfiguration['fields'][number],
  itemTypeKey?: string,
): boolean {
  if (!field.visibility || typeof field.visibility !== 'object' || Array.isArray(field.visibility)) return true;
  const visibility = field.visibility as Record<string, unknown>;
  const types = visibility.itemTypes ?? visibility.itemTypeKeys ?? visibility.garmentTypes;
  if (!Array.isArray(types) || types.length === 0) return true;
  return Boolean(itemTypeKey && types.includes(itemTypeKey));
}

function mobileFieldOptions(field: BusinessConfiguration['fields'][number]): Array<{ key: string; label: string }> {
  if (!Array.isArray(field.options)) return [];
  return field.options.flatMap((option) => {
    if (typeof option === 'string') return [{ key: option, label: option }];
    if (option && typeof option === 'object' && !Array.isArray(option)
      && 'key' in option && typeof option.key === 'string') {
      return [{ key: option.key, label: 'label' in option && typeof option.label === 'string' ? option.label : option.key }];
    }
    return [];
  });
}

function fieldValueIsEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === ''
    || (Array.isArray(value) && value.length === 0);
}

function configuredFieldValues(
  fields: BusinessConfiguration['fields'],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = Object.hasOwn(values, field.key) ? values[field.key] : field.defaultValue;
    if (!fieldValueIsEmpty(value)) {
      result[field.key] = ['NUMBER', 'CURRENCY', 'MEASUREMENT'].includes(field.type)
        ? Number(value)
        : value;
    }
  }
  return result;
}

function validateConfiguredFields(
  fields: BusinessConfiguration['fields'],
  values: Record<string, unknown>,
): string | null {
  for (const field of fields) {
    const value = Object.hasOwn(values, field.key) ? values[field.key] : field.defaultValue;
    if (field.required && fieldValueIsEmpty(value)) return `${field.label} is required`;
    if (fieldValueIsEmpty(value)) continue;

    if (['NUMBER', 'CURRENCY', 'MEASUREMENT'].includes(field.type)) {
      const number = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(number)) return `${field.label} must be a valid number`;
    }
  }
  return null;
}

const MOBILE_STAGE_ALIASES: Record<string, string[]> = {
  FINISHING: ['FITTING'],
  FITTING: ['FINISHING'],
  READY_FOR_PICKUP: ['READY'],
  READY: ['READY_FOR_PICKUP'],
  COLLECTED: ['DELIVERED', 'COMPLETED'],
  DELIVERED: ['COLLECTED', 'COMPLETED'],
  COMPLETED: ['COLLECTED', 'DELIVERED'],
};

function resolveMobileWorkflowStage(
  stages: BusinessConfiguration['workflow']['stages'] | undefined,
  order: Pick<LocalOrder, 'workflow_stage_key' | 'status'>,
) {
  if (!stages?.length) return undefined;
  const candidateKeys = [order.workflow_stage_key, order.status].filter((key): key is string => Boolean(key));
  for (const key of candidateKeys) {
    const direct = stages.find((stage) => stage.key === key);
    if (direct) return direct;
    for (const alias of MOBILE_STAGE_ALIASES[key] ?? []) {
      const aliased = stages.find((stage) => stage.key === alias);
      if (aliased) return aliased;
    }
  }
  if (order.status === 'NEW') {
    return stages.find((stage) => stage.isInitial);
  }
  return undefined;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used inside a <WorkspaceProvider>');
  }
  return ctx;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { branding, themeMode, palette } = useAppTheme();

  const [language, setLanguageState] = useState<Language>('en');
  const copy = useMemo(() => getCopy(language), [language]);
  const rtl = language === 'ur';

  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const workspaceGeneration = useRef(0);
  const isCurrentWorkspace = useCallback((generation: number, businessId: string) =>
    workspaceGeneration.current === generation && sessionRef.current?.business.id === businessId, []);

  const [businessConfiguration, setBusinessConfiguration] = useState<BusinessConfiguration | null>(null);
  const [booting, setBooting] = useState(true);
  const [localReady, setLocalReady] = useState(false);
  const [bootError, setBootError] = useState('');
  const [bootAttempt, setBootAttempt] = useState(0);
  const [online, setOnline] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [error, setError] = useState('');
  const [shopChoices, setShopChoices] = useState<ShopOption[]>([]);
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string } | null>(null);
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [catalogItems, setCatalogItems] = useState<LocalCatalogItem[]>([]);
  const [templates, setTemplates] = useState<LocalTemplate[]>([]);
  const [measurements, setMeasurements] = useState<Array<{
    id: string; customer_id: string; template_name: string; values_json: string; measured_at: string; sync_state: string;
  }>>([]);
  const [syncState, setSyncState] = useState<SyncState>({
    pending: 0,
    attention: 0,
    next_retry_at: null,
    attention_details: [],
    last_successful_sync: null,
    last_error: null,
  });
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

  // Form state
  const [search, setSearch] = useState('');
  const [customerForm, setCustomerForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [customerCustomFields, setCustomerCustomFields] = useState<Record<string, unknown>>({});
  const [catalogForm, setCatalogForm] = useState(false);
  const [catalogName, setCatalogName] = useState('');
  const [catalogDescription, setCatalogDescription] = useState('');
  const [catalogTypeKey, setCatalogTypeKey] = useState('');
  const [catalogSku, setCatalogSku] = useState('');
  const [catalogUnit, setCatalogUnit] = useState('unit');
  const [catalogUnitPrice, setCatalogUnitPrice] = useState('');
  const [catalogCustomFields, setCatalogCustomFields] = useState<Record<string, unknown>>({});
  const [orderForm, setOrderForm] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [itemName, setItemName] = useState('');
  const [orderItemTypeKey, setOrderItemTypeKey] = useState('');
  const [orderCustomFields, setOrderCustomFields] = useState<Record<string, unknown>>({});
  const [orderItemCustomFields, setOrderItemCustomFields] = useState<Record<string, unknown>>({});
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
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentAttempt, setPaymentAttempt] = useState<{ idempotency_key: string; amount: string; method: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [transitioningOrderKey, setTransitioningOrderKey] = useState<string | null>(null);
  const [openingPaymentOrderId, setOpeningPaymentOrderId] = useState<string | null>(null);
  const [togglingCatalogId, setTogglingCatalogId] = useState<string | null>(null);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  const [selectingShopId, setSelectingShopId] = useState<string | null>(null);

  const updateSession = useCallback((nextSession: Session) => {
    const activeSession = sessionRef.current;
    if (!activeSession || activeSession.business.id !== nextSession.business.id
      || nextSession.accessExpiresAt < activeSession.accessExpiresAt) return;
    sessionRef.current = nextSession;
    setSession(nextSession);
    void storeSession(nextSession).catch((storageError: unknown) => {
      setSyncError(storageError instanceof Error ? storageError.message : copy.error);
    });
  }, [copy.error]);

  const erpRequest = useCallback(async <T,>(
    route: string,
    options: { method?: string; body?: unknown; idempotencyKey?: string } = {},
  ): Promise<T> => {
    const activeSession = sessionRef.current;
    if (!activeSession) throw new Error('Please sign in again.');
    if (!route.startsWith('/')) throw new Error('ERP API routes must be absolute versioned paths.');
    const response = await apiRequest<{ data: T }>(activeSession, `/api/v1${route}`, {
      method: options.method,
      body: options.body,
      headers: options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : undefined,
    }, updateSession);
    return response.data;
  }, [updateSession]);

  const resetWorkspaceData = useCallback(() => {
    workspaceGeneration.current += 1;
    setBusinessConfiguration(null);
    setCustomers([]);
    setOrders([]);
    setCatalogItems([]);
    setTemplates([]);
    setMeasurements([]);
    setSyncState({ pending: 0, attention: 0, next_retry_at: null, attention_details: [], last_successful_sync: null, last_error: null });
    setSyncError('');
    setSyncing(false);
    syncLock.current = false;
    setDashboard({});
    setNotificationHistory([]);
    setSubscriptionBilling(null);
    setSubscriptionPlanId('');
    setSubscriptionCycle('MONTHLY');
    setSubscriptionPayment({ transactionReference: '', senderName: '', amount: '', method: '', paymentDate: new Date().toISOString().slice(0, 10) });
    setCustomerForm(false);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerNotes('');
    setCustomerCustomFields({});
    setCatalogForm(false);
    setCatalogName('');
    setCatalogDescription('');
    setCatalogTypeKey('');
    setCatalogSku('');
    setCatalogUnit('unit');
    setCatalogUnitPrice('');
    setCatalogCustomFields({});
    setSearch('');
    setOrderForm(false);
    setSelectedCustomer('');
    setItemName('');
    setOrderItemTypeKey('');
    setOrderCustomFields({});
    setOrderItemCustomFields({});
    setQuantity('1');
    setUnitPrice('');
    setDueDate(karachiDateInput());
    setOrderNotes('');
    setMeasurementForm(false);
    setMeasurementCustomer('');
    setMeasurementTemplate('');
    setMeasurementValues({});
    setMeasurementNotes('');
    setPaymentOrder(null);
    setPaymentAmount('');
    setPaymentMethod('');
    setPaymentAttempt(null);
    setSaving(false);
    setTransitioningOrderKey(null);
    setOpeningPaymentOrderId(null);
    setTogglingCatalogId(null);
    setLoadingNotifications(false);
    setLoadingSubscription(false);
    setSelectingShopId(null);
    setError('');
  }, []);

  useEffect(() => {
    return subscribeToSessionExpired(() => {
      sessionRef.current = null;
      setSession(null);
      resetWorkspaceData();
      setPassword('');
      setShopChoices([]);
      setPendingCredentials(null);
      setError(copy.sessionExpired);
    });
  }, [copy.sessionExpired, resetWorkspaceData]);

  useEffect(() => {
    let active = true;
    if (!session) {
      setBusinessConfiguration(null);
      return () => { active = false; };
    }
    const loadConfiguration = async () => {
      const cached = await readBusinessConfigurationCache(session.business.id);
      if (cached) {
        const parsed = parseBusinessConfiguration(JSON.parse(cached) as unknown);
        if (parsed.business.id !== session.business.id) {
          throw new Error('Saved business configuration does not match the signed-in business');
        }
        const normalized = JSON.stringify(parsed);
        if (normalized !== cached) await writeBusinessConfigurationCache(session.business.id, normalized);
        if (active) setBusinessConfiguration(parsed);
      }
      if (online !== true) return;
      const response = await apiRequest<{ data: unknown }>(
        session,
        '/api/v1/business/configuration',
        {},
        updateSession,
      );
      const parsed = parseBusinessConfiguration(response.data);
      if (parsed.business.id !== session.business.id) {
        throw new Error('The server returned configuration for another business');
      }
      await writeBusinessConfigurationCache(session.business.id, JSON.stringify(parsed));
      if (active) setBusinessConfiguration(parsed);
    };
    void loadConfiguration().catch((configurationError: unknown) => {
      if (active) setSyncError(configurationError instanceof Error ? configurationError.message : copy.error);
    });
    return () => { active = false; };
  }, [copy.error, online, session?.accessToken, session?.business.id, updateSession]);

  const refreshNotificationHistory = useCallback(async () => {
    if (!session || online !== true || !session.permissions.includes('notifications:read')
      || sessionRef.current?.business.id !== session.business.id) return;
    const generation = workspaceGeneration.current;
    const businessId = session.business.id;
    setLoadingNotifications(true);
    setError('');
    try {
      const response = await apiRequest<{ data?: { items?: WhatsAppNotification[] } }>(
        session,
        '/api/v1/notifications?limit=50',
        {},
        updateSession,
      );
      if (isCurrentWorkspace(generation, businessId)) setNotificationHistory(response.data?.items ?? []);
    } catch (historyError) {
      if (isCurrentWorkspace(generation, businessId)) {
        setError(historyError instanceof Error ? historyError.message : copy.error);
      }
    } finally {
      if (isCurrentWorkspace(generation, businessId)) {
        setLoadingNotifications(false);
      }
    }
  }, [copy.error, online, session, updateSession, isCurrentWorkspace]);

  const refreshSubscriptionBilling = useCallback(async () => {
    if (!session || online !== true || !session.permissions.includes('subscriptions:read')
      || sessionRef.current?.business.id !== session.business.id) return;
    const generation = workspaceGeneration.current;
    const businessId = session.business.id;
    setLoadingSubscription(true);
    setError('');
    try {
      const response = await apiRequest<{ data?: SubscriptionBilling }>(
        session,
        '/api/v1/subscriptions',
        {},
        updateSession,
      );
      if (!isCurrentWorkspace(generation, businessId)) return;
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
      if (isCurrentWorkspace(generation, businessId)) {
        setError(billingError instanceof Error ? billingError.message : copy.error);
      }
    } finally {
      if (isCurrentWorkspace(generation, businessId)) {
        setLoadingSubscription(false);
      }
    }
  }, [copy.error, online, session, subscriptionPayment.method, subscriptionPlanId, updateSession, isCurrentWorkspace]);

  const refreshLocal = useCallback(async (businessId: string) => {
    const generation = workspaceGeneration.current;
    if (sessionRef.current?.business.id !== businessId) return;
    const [nextCustomers, nextOrders, nextCatalogItems, nextTemplates, nextMeasurements, nextSyncState] = await Promise.all([
      loadCustomers(businessId),
      loadOrders(businessId),
      loadCatalogItems(businessId),
      loadTemplates(businessId),
      loadMeasurements(businessId),
      loadSyncState(businessId),
    ]);
    if (!isCurrentWorkspace(generation, businessId)) return;
    setCustomers(nextCustomers);
    setOrders(nextOrders);
    setCatalogItems(nextCatalogItems);
    setTemplates(nextTemplates);
    setMeasurements(nextMeasurements);
    setSyncState(nextSyncState);
  }, [isCurrentWorkspace]);

  const runSync = useCallback(async () => {
    if (!session || online !== true || syncLock.current
      || sessionRef.current?.business.id !== session.business.id) return;
    const generation = workspaceGeneration.current;
    const businessId = session.business.id;
    syncLock.current = true;
    setSyncing(true);
    setSyncError('');
    try {
      await synchronize(
        session,
        updateSession,
        businessConfiguration?.enabledModules.includes('catalog') === true,
      );
      if (!isCurrentWorkspace(generation, businessId)) return;
      await refreshLocal(businessId);
      if (!isCurrentWorkspace(generation, businessId)) return;
      if (session.permissions.includes('orders:read')
        && businessConfiguration?.enabledModules.includes('orders') === true) {
        const result = await apiRequest<{ data: Record<string, unknown> }>(
          session,
          '/api/v1/reports/dashboard',
          {},
          updateSession,
        );
        if (isCurrentWorkspace(generation, businessId)) setDashboard(result.data);
      } else if (isCurrentWorkspace(generation, businessId)) {
        setDashboard({});
      }
    } catch (syncFailure) {
      if (isCurrentWorkspace(generation, businessId)) {
        setSyncError(syncFailure instanceof Error ? syncFailure.message : copy.syncError);
      }
    } finally {
      if (isCurrentWorkspace(generation, businessId)) {
        syncLock.current = false;
        setSyncing(false);
        await refreshLocal(businessId).catch(() => undefined);
      }
    }
  }, [businessConfiguration?.enabledModules, session, online, updateSession, refreshLocal, copy.syncError, isCurrentWorkspace]);

  // Boot
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
      sessionRef.current = savedSession;
      setSession(savedSession);
      if (savedLanguage === 'en' || savedLanguage === 'ur' || savedLanguage === 'ur-roman') {
        setLanguageState(savedLanguage);
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
    if (!session) return;
    const generation = workspaceGeneration.current;
    const businessId = session.business.id;
    void refreshLocal(businessId).catch((loadError: unknown) => {
      if (isCurrentWorkspace(generation, businessId)) {
        setSyncError(loadError instanceof Error ? loadError.message : copy.error);
      }
    });
  }, [session?.business.id, refreshLocal, copy.error, isCurrentWorkspace]);

  useEffect(() => {
    if (!session || online !== true) return;
    void runSync();
  }, [session?.business.id, online, runSync]);

  useEffect(() => {
    if (!session || online !== true || syncState.pending === 0) return undefined;
    const dueAt = syncState.next_retry_at ?? Date.now();
    const delay = Math.max(1_000, Math.min(60_000, dueAt - Date.now()));
    const timeout = setTimeout(() => { void runSync(); }, delay);
    return () => clearTimeout(timeout);
  }, [online, runSync, session?.business.id, syncState.next_retry_at, syncState.pending]);

  // Catalog refresh on page entry
  useEffect(() => {
    if (!session || online !== true
      || !businessConfiguration?.enabledModules.includes('catalog')) return;
    void refreshCatalogItems(session, session.business.id, updateSession)
      .then(setCatalogItems)
      .catch((catalogError: unknown) => {
        setError(catalogError instanceof Error ? catalogError.message : copy.error);
      });
  }, [businessConfiguration?.enabledModules, copy.error, online, session, updateSession]);

  // Auth actions
  const handleSignIn = useCallback(async (businessId?: string) => {
    setAuthBusy(true);
    setError('');
    try {
      const result = await signIn(email.trim(), password, businessId);
      if (result.requiresBusinessSelection) {
        setPendingCredentials({ email: email.trim(), password });
        setShopChoices(result.businesses);
        return;
      }
      if (result.requiresScopeSelection) {
        throw new Error('This account needs a business membership before it can use the business app.');
      }
      const nextSession = await createSession(result);
      resetWorkspaceData();
      sessionRef.current = nextSession;
      setSession(nextSession);
      setPassword('');
      setShopChoices([]);
      setPendingCredentials(null);
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : copy.error);
    } finally {
      setAuthBusy(false);
    }
  }, [copy.error, email, password, resetWorkspaceData]);

  const selectShop = useCallback(async (shop: ShopOption) => {
    if (!pendingCredentials) return;
    setAuthBusy(true);
    setSelectingShopId(shop.id);
    setError('');
    try {
      const result = await signIn(pendingCredentials.email, pendingCredentials.password, shop.id);
      if (result.requiresBusinessSelection) {
        setShopChoices(result.businesses);
        setError('Choose one of the available workspaces.');
        return;
      }
      if (result.requiresScopeSelection) {
        throw new Error('This account needs a business membership before it can use the business app.');
      }
      const nextSession = await createSession(result);
      resetWorkspaceData();
      sessionRef.current = nextSession;
      setSession(nextSession);
      setPassword('');
      setShopChoices([]);
      setPendingCredentials(null);
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : copy.error);
    } finally {
      setSelectingShopId(null);
      setAuthBusy(false);
    }
  }, [copy.error, pendingCredentials, resetWorkspaceData]);

  const handleSignOut = useCallback(async () => {
    const endingSession = session;
    const revocation = endingSession && online === true
      ? revokeSession(endingSession.refreshToken)
      : null;
    sessionRef.current = null;
    resetWorkspaceData();
    setSession(null);
    setPassword('');
    setShopChoices([]);
    setPendingCredentials(null);
    await clearSession().catch(() => undefined);
    if (revocation) {
      try {
        await revocation;
      } catch {
        Alert.alert(copy.signOut, copy.syncError);
      }
    }
  }, [copy.signOut, copy.syncError, online, resetWorkspaceData, session]);

  const changeLanguage = useCallback(async (next: Language) => {
    await SecureStore.setItemAsync(LANGUAGE_KEY, next);
    setLanguageState(next);
  }, []);

  const submitSubscriptionPayment = useCallback(async () => {
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
  }, [copy.error, copy.pendingAdminReview, copy.submitForReview, refreshSubscriptionBilling, session, subscriptionCycle, subscriptionPayment, subscriptionPlanId, updateSession]);

  const saveCustomer = useCallback(async () => {
    if (!session) return;
    const customerFields = (businessConfiguration?.fields ?? []).filter((field) =>
      field.module === 'customers' && ['customer', 'customer-create'].includes(field.screen))
      .sort((left, right) => left.sortOrder - right.sortOrder);
    const fieldError = validateConfiguredFields(customerFields, customerCustomFields);
    if (fieldError) {
      setError(fieldError);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveCustomerOffline({
        businessId: session.business.id,
        name: customerName,
        phone: customerPhone,
        notes: customerNotes,
        customFields: configuredFieldValues(customerFields, customerCustomFields),
      });
      await refreshLocal(session.business.id);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerNotes('');
      setCustomerCustomFields({});
      setCustomerForm(false);
      if (online === true) void runSync();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : copy.error);
    } finally {
      setSaving(false);
    }
  }, [businessConfiguration, copy.error, customerCustomFields, customerName, customerNotes, customerPhone, online, refreshLocal, runSync, session]);

  const saveOrder = useCallback(async () => {
    if (!session) return;
    if (!businessConfiguration?.itemTypes.length) {
      setError('Business item types are missing from the cached configuration.');
      return;
    }
    const currentItemType = businessConfiguration.itemTypes.find((item) => item.key === orderItemTypeKey)
      ?? businessConfiguration.itemTypes[0];
    const initialStage = businessConfiguration.workflow.stages.find((stage) => stage.isInitial);
    if (!initialStage) {
      setError('The cached business workflow has no initial stage.');
      return;
    }
    const customer = customers.find((item) => item.id === selectedCustomer);
    if (!customer) {
      setError(copy.chooseCustomer);
      return;
    }
    const orderItemFieldDefinitions = (businessConfiguration.fields ?? []).filter((field) =>
      field.module === 'orders'
      && ['order-item', 'item'].includes(field.screen)
      && mobileFieldVisible(field, currentItemType.key))
      .sort((left, right) => left.sortOrder - right.sortOrder);
    const orderFields = (businessConfiguration.fields ?? []).filter((field) =>
      field.module === 'orders' && ['order', 'job'].includes(field.screen))
      .sort((left, right) => left.sortOrder - right.sortOrder);

    const itemFieldValues = { ...orderItemCustomFields };
    for (const field of orderItemFieldDefinitions) {
      if (field.key === 'item_name' || field.key === 'garment_name') itemFieldValues[field.key] = itemName.trim();
      if (field.key === 'quantity') itemFieldValues[field.key] = Number(quantity);
    }
    const fieldError = validateConfiguredFields(orderItemFieldDefinitions, itemFieldValues)
      ?? validateConfiguredFields(orderFields, orderCustomFields);
    if (fieldError) {
      setError(fieldError);
      return;
    }
    setSaving(true);
    setError('');
    try {
      amountToMinorUnits(unitPrice);
      await saveOrderOffline({
        businessId: session.business.id,
        customer,
        itemName,
        itemTypeKey: currentItemType.key,
        orderCustomFields: configuredFieldValues(orderFields, orderCustomFields),
        itemCustomFields: configuredFieldValues(orderItemFieldDefinitions, itemFieldValues),
        initialStageKey: initialStage.key,
        quantity: Number(quantity),
        unitPrice,
        promisedAt: dueDate,
        notes: orderNotes,
      });
      await refreshLocal(session.business.id);
      setOrderForm(false);
      setItemName('');
      setOrderCustomFields({});
      setOrderItemCustomFields({});
      setQuantity('1');
      setUnitPrice('');
      setOrderNotes('');
      if (online === true) void runSync();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : copy.error);
    } finally {
      setSaving(false);
    }
  }, [businessConfiguration, copy.chooseCustomer, copy.error, customers, dueDate, itemName, online, orderCustomFields, orderItemCustomFields, orderItemTypeKey, orderNotes, quantity, refreshLocal, runSync, selectedCustomer, session, unitPrice]);

  const saveMeasurements = useCallback(async () => {
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
  }, [copy.chooseCustomer, copy.error, customers, measurementCustomer, measurementNotes, measurementTemplate, measurementValues, online, refreshLocal, runSync, session, templates]);

  const saveCatalogItem = useCallback(async () => {
    if (!session || !businessConfiguration) return;
    const typeKey = catalogTypeKey || businessConfiguration.itemTypes[0]?.key;
    if (!typeKey) {
      setError('Configure an item type before adding catalog entries.');
      return;
    }
    const catalogFields = (businessConfiguration.fields ?? []).filter((field) =>
      field.module === 'catalog' && ['item', 'catalog-item'].includes(field.screen))
      .sort((left, right) => left.sortOrder - right.sortOrder);
    const visibleCatalogFields = catalogFields.filter((field) => mobileFieldVisible(field, typeKey));
    const fieldError = validateConfiguredFields(visibleCatalogFields, catalogCustomFields);
    if (fieldError) {
      setError(fieldError);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveCatalogItemOffline({
        businessId: session.business.id,
        typeKey,
        name: catalogName,
        description: catalogDescription,
        sku: catalogSku,
        unit: catalogUnit,
        unitPrice: catalogUnitPrice,
        sortOrder: catalogItems.length,
        customFields: configuredFieldValues(visibleCatalogFields, catalogCustomFields),
      });
      await refreshLocal(session.business.id);
      setCatalogName('');
      setCatalogDescription('');
      setCatalogSku('');
      setCatalogUnitPrice('');
      setCatalogCustomFields({});
      setCatalogForm(false);
      if (online === true) void runSync();
    } catch (catalogError) {
      setError(catalogError instanceof Error ? catalogError.message : copy.error);
    } finally {
      setSaving(false);
    }
  }, [businessConfiguration, catalogCustomFields, catalogDescription, catalogItems.length, catalogName, catalogSku, catalogTypeKey, catalogUnit, catalogUnitPrice, copy.error, online, refreshLocal, runSync, session]);

  const toggleCatalogItem = useCallback(async (item: LocalCatalogItem) => {
    if (!session) return;
    setSaving(true);
    setTogglingCatalogId(item.id);
    setError('');
    try {
      await apiRequest(session, `/api/v1/catalog/${item.id}`, {
        method: 'PATCH',
        body: { version: item.version, active: !item.active },
      }, updateSession);
      const refreshed = await refreshCatalogItems(session, session.business.id, updateSession);
      setCatalogItems(refreshed);
    } catch (catalogError) {
      setError(catalogError instanceof Error ? catalogError.message : copy.error);
    } finally {
      setTogglingCatalogId(null);
      setSaving(false);
    }
  }, [copy.error, session, updateSession]);

  const transitionOrder = useCallback(async (order: LocalOrder, targetStageKey?: string) => {
    if (!session || online !== true || order.sync_state !== 'synced') {
      setError(copy.paymentOnline);
      return;
    }
    const stages = businessConfiguration?.workflow.stages ?? [];
    const fromStage = resolveMobileWorkflowStage(stages, order);
    const transition = businessConfiguration?.workflow.transitions.find((item) =>
      item.fromStageId === fromStage?.id
      && (!targetStageKey || stages.find((stage) => stage.id === item.toStageId)?.key === targetStageKey));
    const nextStage = stages.find((stage) => stage.id === transition?.toStageId)
      ?? (targetStageKey ? stages.find((stage) => stage.key === targetStageKey) : undefined);
    if (!nextStage) return;
    const transitionKey = `${order.id}:${nextStage.key}`;
    setTransitioningOrderKey(transitionKey);
    setError('');
    try {
      const response = await apiRequest<{
        data?: {
          workflowStageKey?: string | null;
          status?: string;
          version?: number;
          updatedAt?: string;
        };
      }>(session, `/api/v1/orders/${order.id}/workflow`, {
        method: 'POST',
        body: { toStageKey: nextStage.key, version: order.version },
      }, updateSession);
      await applyLocalOrderWorkflowTransition({
        businessId: session.business.id,
        orderId: order.id,
        workflowStageKey: response.data?.workflowStageKey ?? nextStage.key,
        status: response.data?.status,
        version: typeof response.data?.version === 'number' ? response.data.version : order.version + 1,
        updatedAt: response.data?.updatedAt,
      });
      await refreshLocal(session.business.id);
      await runSync();
    } catch (transitionError) {
      setError(transitionError instanceof Error ? transitionError.message : copy.error);
    } finally {
      setTransitioningOrderKey(null);
    }
  }, [businessConfiguration, copy.error, copy.paymentOnline, online, refreshLocal, runSync, session, updateSession]);

  const openOrderPayment = useCallback(async (order: LocalOrder) => {
    if (!session || online !== true || order.sync_state !== 'synced') {
      setError(copy.paymentOnline);
      return;
    }
    setOpeningPaymentOrderId(order.id);
    setError('');
    try {
      const paymentMethodOptions = businessConfiguration?.paymentMethods ?? [];
      const existing = await findPendingPaymentAttempt(session.business.id, order.id);
      setPaymentOrder(order);
      setPaymentAttempt(existing ?? null);
      setPaymentAmount(existing?.amount ?? '');
      setPaymentMethod(existing?.method ?? paymentMethodOptions[0] ?? '');
    } finally {
      setOpeningPaymentOrderId(null);
    }
  }, [businessConfiguration, copy.paymentOnline, online, session]);

  const recordPayment = useCallback(async () => {
    if (!session || !paymentOrder || online !== true || paymentOrder.sync_state !== 'synced') {
      setError(copy.paymentOnline);
      return;
    }
    const paymentMethodOptions = businessConfiguration?.paymentMethods ?? [];
    let amount: string;
    try {
      if (paymentAttempt && (paymentAmount !== paymentAttempt.amount || paymentMethod !== paymentAttempt.method)) {
        throw new Error(copy.paymentUnconfirmed);
      }
      const selectedMethod = paymentAttempt?.method ?? paymentMethod;
      if (!selectedMethod || (!paymentAttempt && !paymentMethodOptions.includes(selectedMethod))) {
        throw new Error('Select a configured payment method before recording payment.');
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
  }, [businessConfiguration, copy.error, copy.orders, copy.paymentOnline, copy.paymentUnconfirmed, copy.saved, online, paymentAmount, paymentAttempt, paymentMethod, paymentOrder, runSync, session, updateSession]);

  // Page-conditional data loaders (the original App.tsx called these inside
  // useEffects that depended on `page`). We expose them so screens can call
  // them on mount.
  const loadNotificationsOnEntry = useCallback(() => { void refreshNotificationHistory(); }, [refreshNotificationHistory]);
  const loadSubscriptionOnEntry = useCallback(() => { void refreshSubscriptionBilling(); }, [refreshSubscriptionBilling]);

  // Re-export the conditional loaders onto the context as part of the
  // memoised value. The screen files call these from their own useEffect.
  void loadNotificationsOnEntry;
  void loadSubscriptionOnEntry;

  const cancelOrderPayment = useCallback(() => {
    setPaymentOrder(null);
    setPaymentAttempt(null);
    setPaymentAmount('');
    setPaymentMethod('');
    setError('');
  }, []);

  // Saves business settings through the configuration API. The server checks
  // the configuration version, so the payload always carries the version that
  // was loaded; on success the fresh configuration replaces the cached one.
  const saveBusinessConfiguration = useCallback(async (patch: Record<string, unknown>): Promise<boolean> => {
    if (!session || online !== true || !businessConfiguration) {
      setError(copy.settingsOnline);
      return false;
    }
    setSaving(true);
    setError('');
    try {
      await apiRequest(session, '/api/v1/business/configuration', {
        method: 'PUT',
        body: { version: businessConfiguration.version, ...patch },
      }, updateSession);
      const response = await apiRequest<{ data: unknown }>(session, '/api/v1/business/configuration', {}, updateSession);
      const parsed = parseBusinessConfiguration(response.data);
      await writeBusinessConfigurationCache(session.business.id, JSON.stringify(parsed));
      setBusinessConfiguration(parsed);
      return true;
    } catch (saveFailure) {
      setError(saveFailure instanceof Error ? saveFailure.message : copy.error);
      return false;
    } finally {
      setSaving(false);
    }
  }, [businessConfiguration, copy.error, copy.settingsOnline, online, session, updateSession]);

  const fetchRoles = useCallback(async (): Promise<BusinessRole[]> => {
    if (!session || online !== true) throw new Error(copy.settingsOnline);
    const response = await apiRequest<{ data?: { items?: BusinessRole[] } }>(session, '/api/v1/business/roles', {}, updateSession);
    return (response.data?.items ?? []).filter((role) => role.name !== 'Owner');
  }, [copy.settingsOnline, online, session, updateSession]);

  const fetchBusinessPermissions = useCallback(async (): Promise<BusinessPermission[]> => {
    if (!session || online !== true) throw new Error(copy.settingsOnline);
    const response = await apiRequest<{ data?: { items?: BusinessPermission[] } }>(session, '/api/v1/business/permissions', {}, updateSession);
    return response.data?.items ?? [];
  }, [copy.settingsOnline, online, session, updateSession]);

  const fetchBusinessStaff = useCallback(async (): Promise<BusinessMember[]> => {
    if (!session || online !== true) throw new Error(copy.settingsOnline);
    const response = await apiRequest<{ data?: { items?: BusinessMember[] } }>(session, '/api/v1/business/staff', {}, updateSession);
    return response.data?.items ?? [];
  }, [copy.settingsOnline, online, session, updateSession]);

  const createBusinessRole = useCallback(async (input: { name: string; permissions: string[] }): Promise<BusinessRole> => {
    if (!session || online !== true) throw new Error(copy.settingsOnline);
    setSaving(true);
    setError('');
    try {
      const response = await apiRequest<{ data?: BusinessRole }>(session, '/api/v1/business/roles', {
        method: 'POST',
        body: { name: input.name.trim(), permissions: [...new Set(input.permissions)] },
      }, updateSession);
      if (!response.data) throw new Error(copy.error);
      return response.data;
    } finally {
      setSaving(false);
    }
  }, [copy.error, copy.settingsOnline, online, session, updateSession]);

  const inviteStaffMember = useCallback(async (input: { name: string; email: string; initialPassword: string; roleId: string }): Promise<BusinessMember> => {
    if (!session || online !== true) throw new Error(copy.settingsOnline);
    setSaving(true);
    setError('');
    try {
      const response = await apiRequest<{ data?: BusinessMember }>(session, '/api/v1/business/staff', {
        method: 'POST',
        body: {
          ...input,
          name: input.name.trim(),
          email: input.email.trim().toLowerCase(),
        },
      }, updateSession);
      if (!response.data) throw new Error(copy.error);
      return response.data;
    } finally {
      setSaving(false);
    }
  }, [copy.error, copy.settingsOnline, online, session, updateSession]);

  // Helpers
  const membership = session?.permissions ?? [];
  const can = (permission: string) => membership.includes(permission);
  const term = (key: string, fallback: string) => businessConfiguration?.terminology[key] ?? fallback;
  const moduleEnabled = (module: string) => Boolean(businessConfiguration?.enabledModules.includes(module));
  const paymentMethodOptions = businessConfiguration?.paymentMethods ?? [];
  const paymentMethodLabel = (method: string) => {
    const defaultMethods = ['CASH', 'BANK', 'DIGITAL'];
    const index = defaultMethods.indexOf(method);
    return index >= 0 ? copy.paymentMethods[index] : method.replaceAll('_', ' ').toLocaleLowerCase()
      .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
  };
  const currentItemType = businessConfiguration?.itemTypes.find((item) => item.key === orderItemTypeKey)
    ?? businessConfiguration?.itemTypes[0];
  const orderItemFieldDefinitions = (businessConfiguration?.fields ?? []).filter((field) =>
    field.module === 'orders'
    && ['order-item', 'item'].includes(field.screen)
    && mobileFieldVisible(field, currentItemType?.key))
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const orderItemFields = orderItemFieldDefinitions
    .filter((field) => !['item_name', 'garment_name', 'quantity'].includes(field.key));
  const orderFields = (businessConfiguration?.fields ?? []).filter((field) =>
    field.module === 'orders' && ['order', 'job'].includes(field.screen))
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const customerFields = (businessConfiguration?.fields ?? []).filter((field) =>
    field.module === 'customers' && ['customer', 'customer-create'].includes(field.screen))
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const catalogFields = (businessConfiguration?.fields ?? []).filter((field) =>
    field.module === 'catalog' && ['item', 'catalog-item'].includes(field.screen))
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const selectedCatalogTypeKey = catalogTypeKey || (businessConfiguration?.itemTypes[0]?.key ?? '');
  const visibleCatalogFields = catalogFields.filter((field) => mobileFieldVisible(field, selectedCatalogTypeKey));
  const selectedTemplate = templates.find((item) => item.id === measurementTemplate);
  const stageLabel = (key: string) => businessConfiguration?.workflow.stages
    .find((stage) => stage.key === key)?.label ?? key.replaceAll('_', ' ');

  const retryBoot = useCallback(() => setBootAttempt((attempt) => attempt + 1), []);

  const value: WorkspaceContextValue = useMemo(() => ({
    copy,
    rtl,
    language,
    setLanguage: changeLanguage,
    languageOptions,
    branding,
    themeMode,
    palette,
    booting,
    localReady,
    bootError,
    bootAttempt,
    retryBoot,
    session,
    online,
    businessConfiguration,
    customers,
    orders,
    catalogItems,
    templates,
    measurements,
    syncState,
    syncError,
    syncing,
    dashboard,
    notificationHistory,
    subscriptionBilling,
    error,
    setError,
    search,
    setSearch,
    customerForm,
    setCustomerForm,
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
    customerNotes,
    setCustomerNotes,
    customerCustomFields,
    setCustomerCustomFields,
    catalogForm,
    setCatalogForm,
    catalogName,
    setCatalogName,
    catalogDescription,
    setCatalogDescription,
    catalogTypeKey,
    setCatalogTypeKey,
    catalogSku,
    setCatalogSku,
    catalogUnit,
    setCatalogUnit,
    catalogUnitPrice,
    setCatalogUnitPrice,
    catalogCustomFields,
    setCatalogCustomFields,
    orderForm,
    setOrderForm,
    selectedCustomer,
    setSelectedCustomer,
    itemName,
    setItemName,
    orderItemTypeKey,
    setOrderItemTypeKey,
    orderCustomFields,
    setOrderCustomFields,
    orderItemCustomFields,
    setOrderItemCustomFields,
    quantity,
    setQuantity,
    unitPrice,
    setUnitPrice,
    dueDate,
    setDueDate,
    orderNotes,
    setOrderNotes,
    measurementForm,
    setMeasurementForm,
    measurementCustomer,
    setMeasurementCustomer,
    measurementTemplate,
    setMeasurementTemplate,
    measurementValues,
    setMeasurementValues,
    measurementNotes,
    setMeasurementNotes,
    paymentOrder,
    paymentAmount,
    setPaymentAmount,
    paymentMethod,
    setPaymentMethod,
    paymentAttempt,
    saving,
    transitioningOrderKey,
    openingPaymentOrderId,
    togglingCatalogId,
    loadingNotifications,
    loadingSubscription,
    selectingShopId,
    subscriptionPlanId,
    setSubscriptionPlanId,
    subscriptionCycle,
    setSubscriptionCycle,
    subscriptionPayment,
    setSubscriptionPayment,
    membership,
    can,
    term,
    moduleEnabled,
    paymentMethodOptions,
    paymentMethodLabel,
    selectedCatalogTypeKey,
    visibleCatalogFields,
    selectedTemplate,
    currentItemType,
    orderItemFieldDefinitions,
    orderItemFields,
    orderFields,
    customerFields,
    catalogFields,
    stageLabel,
    erpRequest,
    handleSignIn,
    selectShop,
    handleSignOut,
    changeLanguage,
    submitSubscriptionPayment,
    saveCustomer,
    saveOrder,
    saveMeasurements,
    saveCatalogItem,
    toggleCatalogItem,
    transitionOrder,
    openOrderPayment,
    recordPayment,
    runSync,
    refreshNotificationHistory,
    refreshSubscriptionBilling,
    cancelOrderPayment,
    saveBusinessConfiguration,
    fetchRoles,
    fetchBusinessPermissions,
    fetchBusinessStaff,
    createBusinessRole,
    inviteStaffMember,
    email,
    setEmail,
    password,
    setPassword,
    authBusy,
    shopChoices,
  }), [
    copy, rtl, language, changeLanguage, languageOptions, branding, themeMode, palette,
    booting, localReady, bootError, bootAttempt, retryBoot, session, online,
    businessConfiguration, customers, orders, catalogItems, templates, measurements,
    syncState, syncError, syncing, dashboard, notificationHistory, subscriptionBilling,
    error, search, customerForm, customerName, customerPhone, customerNotes, customerCustomFields,
    catalogForm, catalogName, catalogDescription, catalogTypeKey, catalogSku, catalogUnit,
    catalogUnitPrice, catalogCustomFields, orderForm, selectedCustomer, itemName,
    orderItemTypeKey, orderCustomFields, orderItemCustomFields, quantity, unitPrice,
    dueDate, orderNotes, measurementForm, measurementCustomer, measurementTemplate,
    measurementValues, measurementNotes, paymentOrder, paymentAmount, paymentMethod,
    paymentAttempt, saving, transitioningOrderKey, openingPaymentOrderId, togglingCatalogId,
    loadingNotifications, loadingSubscription, selectingShopId, subscriptionPlanId,
    subscriptionCycle, subscriptionPayment, membership, can, term, moduleEnabled,
    paymentMethodOptions, paymentMethodLabel, selectedCatalogTypeKey, visibleCatalogFields,
    selectedTemplate, currentItemType, orderItemFieldDefinitions, orderItemFields, orderFields,
    customerFields, catalogFields, stageLabel, erpRequest, handleSignIn, selectShop, handleSignOut,
    changeLanguage, submitSubscriptionPayment, saveCustomer, saveOrder, saveMeasurements,
    saveCatalogItem, toggleCatalogItem, transitionOrder, openOrderPayment, recordPayment,
    runSync, refreshNotificationHistory, refreshSubscriptionBilling, email, password,
    authBusy, shopChoices, cancelOrderPayment, saveBusinessConfiguration, fetchRoles,
    fetchBusinessPermissions, fetchBusinessStaff, createBusinessRole, inviteStaffMember,
  ]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

// Re-export commonly used helpers so screen files don't need to know the
// internal naming.
export { resolveMobileWorkflowStage, mobileFieldVisible, mobileFieldOptions, validateConfiguredFields, configuredFieldValues, fieldValueIsEmpty, karachiDateInput, API_BASE_URL };
