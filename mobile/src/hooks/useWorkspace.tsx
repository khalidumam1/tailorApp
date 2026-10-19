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
import { Alert, Linking } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  ApiError,
  API_BASE_URL,
  apiDownloadRequest,
  apiRequest,
  clearSession,
  createSession,
  parseBusinessConfiguration,
  revokeSession,
  signIn,
  storeSession,
  subscribeToSessionExpired,
  type BusinessConfiguration,
  type Session,
} from '../api';
import { normalizePhone } from '../data/phone';
import { businessConfigurationCacheKey } from '../data/storage-keys';
import { whatsappUrl } from '../data/messaging';
import {
  attemptFor,
  orderPaymentMethodOptions,
  buildCatalogRequest,
  buildOrderRequest,
  fetchAllPages,
  mapRemoteCatalogItem,
  mapRemoteCustomer,
  mapRemoteOrder,
  safeParseCache,
  subscriptionAmountFor,
  type IdempotentAttempt,
  type RemoteCustomer,
  type RemoteOrder,
} from '../data/erp-mapping';
import { getCopy, languageOptions, type Language } from '../i18n';
import { resolveBrandAssetUrl } from '../theme/branding';
import { useAppTheme } from '../theme/palette';
import { amountToMinorUnits, createClientId, type LocalCatalogItem, type LocalCustomer, type LocalOrder, type LocalTemplate } from '../local';

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
export type AlterationTask = {
  id: string;
  orderId: string;
  description: string;
  status: 'OPEN' | 'DONE';
  dueAt: string | null;
  createdAt: string;
};

export type BusinessMember = {
  id: string;
  active: boolean;
  createdAt: string;
  user: { id: string; name: string; email: string; active: boolean };
  role: { id: string; name: string };
};
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
  session: Session | null;

  // Workspace
  businessConfiguration: BusinessConfiguration | null;
  customers: LocalCustomer[];
  orders: LocalOrder[];
  catalogItems: LocalCatalogItem[];
  templates: LocalTemplate[];
  measurements: Array<{ id: string; customer_id: string; template_name: string; values_json: string; measured_at: string }>;
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
  sendWhatsAppMessage: (recipientPhone: string, message: string) => Promise<void>;
  openOrderPayment: (order: LocalOrder) => Promise<void>;

  recordPayment: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  loadCustomerMeasurements: (customerId: string) => Promise<void>;
  refreshNotificationHistory: () => Promise<void>;
  refreshSubscriptionBilling: () => Promise<void>;
  cancelOrderPayment: () => void;
  saveBusinessConfiguration: (patch: Record<string, unknown>) => Promise<boolean>;
  completePasswordChange: (currentPassword: string, newPassword: string) => Promise<void>;
  resetStaffPassword: (membershipId: string, newPassword: string) => Promise<void>;
  archiveCustomer: (customer: LocalCustomer) => Promise<void>;
  restoreCustomer: (customer: LocalCustomer) => Promise<void>;
  fetchArchivedCustomers: () => Promise<LocalCustomer[]>;
  archiveOrder: (order: LocalOrder) => Promise<void>;
  restoreOrder: (order: LocalOrder) => Promise<void>;
  fetchArchivedOrders: () => Promise<LocalOrder[]>;
  fetchAlterations: (orderId: string) => Promise<AlterationTask[]>;
  createAlteration: (orderId: string, description: string) => Promise<AlterationTask>;
  setAlterationStatus: (orderId: string, alterationId: string, status: 'OPEN' | 'DONE') => Promise<AlterationTask>;
  downloadServerExport: (kind: 'customers' | 'orders' | 'payments' | 'ledger', options?: { archived?: boolean }) => Promise<{ bytes: Uint8Array; filename: string; mimeType: string }>;
  downloadOrderInvoice: (order: LocalOrder) => Promise<{ bytes: Uint8Array; filename: string; mimeType: string }>;
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
  const orderAttemptRef = useRef<IdempotentAttempt | null>(null);
  const paymentAttemptRef = useRef<IdempotentAttempt | null>(null);
  const workspaceGeneration = useRef(0);
  const isCurrentWorkspace = useCallback((generation: number, businessId: string) =>
    workspaceGeneration.current === generation && sessionRef.current?.business.id === businessId, []);

  const [businessConfiguration, setBusinessConfiguration] = useState<BusinessConfiguration | null>(null);
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
    id: string; customer_id: string; template_name: string; values_json: string; measured_at: string;
  }>>([]);
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
      setError(storageError instanceof Error ? storageError.message : copy.error);
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
    orderAttemptRef.current = null;
    paymentAttemptRef.current = null;
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
      const cacheKey = businessConfigurationCacheKey(session.business.id);
      // A corrupt or outdated cache entry is ignored so the network copy can still load.
      const cached = safeParseCache(await SecureStore.getItemAsync(cacheKey), parseBusinessConfiguration);
      if (cached && cached.business.id === session.business.id && active) {
        setBusinessConfiguration(cached);
      }
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
      await SecureStore.setItemAsync(cacheKey, JSON.stringify(parsed));
      if (active) setBusinessConfiguration(parsed);
    };
    void loadConfiguration().catch((configurationError: unknown) => {
      if (active) setError(configurationError instanceof Error ? configurationError.message : copy.error);
    });
    return () => { active = false; };
    }, [copy.error, session?.accessToken, session?.business.id, updateSession]);

  const refreshNotificationHistory = useCallback(async () => {
    if (!session || !session.permissions.includes('notifications:read')
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
  }, [copy.error, session, updateSession, isCurrentWorkspace]);

  const refreshSubscriptionBilling = useCallback(async () => {
    if (!session || !session.permissions.includes('subscriptions:read')
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
  }, [copy.error, session, subscriptionPayment.method, subscriptionPlanId, updateSession, isCurrentWorkspace]);

  const loadCustomerMeasurements = useCallback(async (customerId: string) => {
    if (!session || !customerId) return;
    const generation = workspaceGeneration.current;
    const businessId = session.business.id;
    const response = await erpRequest<{
      items: Array<{
        garmentTemplate: { name: string };
        revisions: Array<{ id: string; values: Record<string, unknown>; measuredAt: string }>;
      }>;
    }>(`/measurements/customers/${customerId}`);
    if (!isCurrentWorkspace(generation, businessId)) return;
    const records = response.items.flatMap((profile) => profile.revisions.map((revision) => ({
      id: revision.id,
      customer_id: customerId,
      template_name: profile.garmentTemplate.name,
      values_json: JSON.stringify(revision.values),
      measured_at: revision.measuredAt,
    })));
    setMeasurements((current) => [
      ...current.filter((record) => record.customer_id !== customerId),
      ...records,
    ]);
  }, [erpRequest, session, isCurrentWorkspace]);

  const loadAllCatalogItems = useCallback(() => fetchAllPages<LocalCatalogItem>(async (cursor) => {
    const result = await erpRequest<{ items: LocalCatalogItem[]; nextCursor?: string | null }>(
      `/catalog?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
    return { items: result.items.map(mapRemoteCatalogItem), nextCursor: result.nextCursor };
  }), [erpRequest]);

  const refreshWorkspace = useCallback(async () => {
    if (!session) return;
    const generation = workspaceGeneration.current;
    const businessId = session.business.id;
    const permissions = new Set(session.permissions);
    const modules = new Set(businessConfiguration?.enabledModules ?? []);
    // Each list is only requested when the role may read it and the module is enabled.
    // Otherwise the server answers 403 and the user sees an error on every sign-in.
    const canLoad = (permission: string, module: string) =>
      permissions.has(permission) && modules.has(module);
    if (!businessConfiguration) return;
    try {
      const customersAllowed = canLoad('customers:read', 'customers');
      const ordersAllowed = canLoad('orders:read', 'orders');
      const catalogAllowed = canLoad('orders:read', 'catalog');
      const templatesAllowed = canLoad('measurements:read', 'measurements');
      const [nextCustomers, nextOrders, nextCatalogItems, nextTemplates] = await Promise.all([
        customersAllowed
          ? fetchAllPages<LocalCustomer>(async (cursor) => {
            const result = await erpRequest<{ items: RemoteCustomer[]; nextCursor?: string | null }>(
              `/customers?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
            );
            return { items: result.items.map(mapRemoteCustomer), nextCursor: result.nextCursor };
          })
          : Promise.resolve([] as LocalCustomer[]),
        ordersAllowed
          ? fetchAllPages<LocalOrder>(async (cursor) => {
            const result = await erpRequest<{ items: RemoteOrder[]; nextCursor?: string | null }>(
              `/orders?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
            );
            return { items: result.items.map(mapRemoteOrder), nextCursor: result.nextCursor };
          })
          : Promise.resolve([] as LocalOrder[]),
        catalogAllowed ? loadAllCatalogItems() : Promise.resolve([] as LocalCatalogItem[]),
        templatesAllowed
          ? erpRequest<{ items: LocalTemplate[] }>('/measurements/templates').then((result) => result.items)
          : Promise.resolve([] as LocalTemplate[]),
      ]);
      if (!isCurrentWorkspace(generation, businessId)) return;
      setCustomers(nextCustomers);
      setOrders(nextOrders);
      setCatalogItems(nextCatalogItems);
      setTemplates(nextTemplates);
      if (ordersAllowed) {
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
    } catch (refreshFailure) {
      if (isCurrentWorkspace(generation, businessId)) {
        setError(refreshFailure instanceof Error ? refreshFailure.message : copy.error);
      }
    }
  }, [businessConfiguration, copy.error, erpRequest, loadAllCatalogItems, session, updateSession, isCurrentWorkspace]);

  useEffect(() => {
    if (!session) return;
    const generation = workspaceGeneration.current;
    const businessId = session.business.id;
    void refreshWorkspace().catch((loadError: unknown) => {
      if (isCurrentWorkspace(generation, businessId)) {
        setError(loadError instanceof Error ? loadError.message : copy.error);
      }
    });
  }, [session?.business.id, refreshWorkspace, copy.error, isCurrentWorkspace]);

  // Catalog refresh on page entry
  useEffect(() => {
    if (!session || !businessConfiguration?.enabledModules.includes('catalog')) return;
    void loadAllCatalogItems()
      .then((items) => setCatalogItems(items))
      .catch((catalogError: unknown) => {
        setError(catalogError instanceof Error ? catalogError.message : copy.error);
      });
  }, [businessConfiguration?.enabledModules, copy.error, loadAllCatalogItems, session]);

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
  }, [copy.error, pendingCredentials, resetWorkspaceData, session]);

  const handleSignOut = useCallback(async () => {
    const endingSession = session;
    const revocation = endingSession ? revokeSession(endingSession.refreshToken) : null;
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
  }, [copy.signOut, copy.syncError, resetWorkspaceData, session]);

  const changeLanguage = useCallback(async (next: Language) => {
    await SecureStore.setItemAsync(LANGUAGE_KEY, next);
    setLanguageState(next);
  }, []);

  const submitSubscriptionPayment = useCallback(async () => {
    if (!session || !subscriptionPlanId) return;
    // The server only accepts the plan's price for the chosen cycle. The form amount
    // is set when a plan is picked, so it can be stale after the cycle changes.
    const expectedAmount = subscriptionAmountFor(subscriptionBilling?.plans ?? [], subscriptionPlanId, subscriptionCycle);
    if (!expectedAmount) {
      setError(copy.error);
      return;
    }
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
            amount: expectedAmount,
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
  }, [copy.error, copy.pendingAdminReview, copy.submitForReview, refreshSubscriptionBilling, session, subscriptionBilling, subscriptionCycle, subscriptionPayment, subscriptionPlanId, updateSession]);

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
      await erpRequest('/customers', {
        method: 'POST',
        body: {
          name: customerName,
          phone: customerPhone,
          notes: customerNotes,
          customFields: configuredFieldValues(customerFields, customerCustomFields),
        },
      });
      await refreshWorkspace();
      setCustomerName('');
      setCustomerPhone('');
      setCustomerNotes('');
      setCustomerCustomFields({});
      setCustomerForm(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : copy.error);
    } finally {
      setSaving(false);
    }
  }, [businessConfiguration, copy.error, customerCustomFields, customerName, customerNotes, customerPhone, refreshWorkspace, session]);

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
      const body = buildOrderRequest({
        customerId: customer.id,
        itemTypeKey: currentItemType.key,
        itemName,
        quantity,
        unitPrice,
        dueDate,
        notes: orderNotes,
        orderCustomFields: configuredFieldValues(orderFields, orderCustomFields),
        itemCustomFields: configuredFieldValues(orderItemFieldDefinitions, itemFieldValues),
      });
      // The server requires an Idempotency-Key. An unchanged retry reuses it, so a
      // lost response cannot create the same order twice.
      const attempt = attemptFor(orderAttemptRef.current, JSON.stringify(body), createClientId);
      orderAttemptRef.current = attempt;
      await erpRequest('/orders', { method: 'POST', body, idempotencyKey: attempt.key });
      orderAttemptRef.current = null;
      await refreshWorkspace();
      setOrderForm(false);
      setItemName('');
      setOrderCustomFields({});
      setOrderItemCustomFields({});
      setQuantity('1');
      setUnitPrice('');
      setOrderNotes('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : copy.error);
    } finally {
      setSaving(false);
    }
  }, [businessConfiguration, copy.chooseCustomer, copy.error, customers, dueDate, itemName, orderCustomFields, orderItemCustomFields, orderItemTypeKey, orderNotes, quantity, refreshWorkspace, selectedCustomer, session, unitPrice]);

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
      await erpRequest(`/measurements/customers/${customer.id}/revisions`, {
        method: 'POST',
        body: {
          garmentTemplateId: template.id,
          values: measurementValues,
          notes: measurementNotes,
          measuredAt: new Date().toISOString(),
        },
      });
      await loadCustomerMeasurements(customer.id);
      setMeasurementForm(false);
      setMeasurementValues({});
      setMeasurementNotes('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : copy.error);
    } finally {
      setSaving(false);
    }
  }, [copy.chooseCustomer, copy.error, customers, loadCustomerMeasurements, measurementCustomer, measurementNotes, measurementTemplate, measurementValues, session, templates]);

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
      await erpRequest('/catalog', {
        method: 'POST',
        body: buildCatalogRequest({
          typeKey,
          name: catalogName,
          description: catalogDescription,
          sku: catalogSku,
          unit: catalogUnit,
          unitPrice: catalogUnitPrice,
          sortOrder: catalogItems.length,
          customFields: configuredFieldValues(visibleCatalogFields, catalogCustomFields),
        }),
      });
      await refreshWorkspace();
      setCatalogName('');
      setCatalogDescription('');
      setCatalogSku('');
      setCatalogUnitPrice('');
      setCatalogCustomFields({});
      setCatalogForm(false);
    } catch (catalogError) {
      setError(catalogError instanceof Error ? catalogError.message : copy.error);
    } finally {
      setSaving(false);
    }
  }, [businessConfiguration, catalogCustomFields, catalogDescription, catalogItems.length, catalogName, catalogSku, catalogTypeKey, catalogUnit, catalogUnitPrice, copy.error, refreshWorkspace, session]);

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
      setCatalogItems(await loadAllCatalogItems());
    } catch (catalogError) {
      setError(catalogError instanceof Error ? catalogError.message : copy.error);
    } finally {
      setTogglingCatalogId(null);
      setSaving(false);
    }
  }, [copy.error, loadAllCatalogItems, session, updateSession]);

  const transitionOrder = useCallback(async (order: LocalOrder, targetStageKey?: string) => {
    if (!session) return;
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
      await refreshWorkspace();

    } catch (transitionError) {
      setError(transitionError instanceof Error ? transitionError.message : copy.error);
    } finally {
      setTransitioningOrderKey(null);
    }
   }, [businessConfiguration, copy.error, refreshWorkspace, session, updateSession]);

   // Opens the user's WhatsApp with the message prepared. The user presses send
   // there, so nothing is sent silently. Order-status notifications are queued by
   // the server when a workflow transition succeeds.
   const sendWhatsAppMessage = useCallback(async (recipientPhone: string, message: string) => {
     const url = whatsappUrl(recipientPhone, message);
     if (!url) {
       setError(copy.error);
       return;
     }
     setError('');
     try {
       await Linking.openURL(url);
     } catch {
       setError(copy.error);
     }
   }, [copy.error]);

   const openOrderPayment = useCallback(async (order: LocalOrder) => {
     if (!session) return;
     setOpeningPaymentOrderId(order.id);
     setError('');
     try {
       const paymentMethodOptions = orderPaymentMethodOptions(businessConfiguration?.paymentMethods ?? []);
       setPaymentOrder(order);
       setPaymentAttempt(null);
       paymentAttemptRef.current = null;
       setPaymentAmount('');
       setPaymentMethod(paymentMethodOptions[0] ?? '');
     } finally {
       setOpeningPaymentOrderId(null);
     }
   }, [businessConfiguration, session]);

   const recordPayment = useCallback(async () => {
     if (!session || !paymentOrder) {
       setError(copy.error);
       return;
     }
     const paymentMethodOptions = orderPaymentMethodOptions(businessConfiguration?.paymentMethods ?? []);
     let amount: string;
     try {
       const selectedMethod = paymentMethod;
       if (!selectedMethod || !paymentMethodOptions.includes(selectedMethod)) {
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
     const method = paymentMethod;
     // A retry of the same payment reuses the key, so a response lost after the
     // server recorded it cannot create a second payment.
     const attempt = attemptFor(
       paymentAttemptRef.current,
       JSON.stringify({ orderId: paymentOrder.id, amount, method }),
       createClientId,
     );
     paymentAttemptRef.current = attempt;
     try {
       await apiRequest(session, `/api/v1/payments/orders/${paymentOrder.id}`, {
         method: 'POST',
         headers: { 'Idempotency-Key': attempt.key },
         body: { amount, method },
       }, updateSession);
       paymentAttemptRef.current = null;
       Alert.alert(copy.orders, copy.saved);
       setPaymentOrder(null);
       setPaymentAttempt(null);
       setPaymentAmount('');
       setPaymentMethod('');
       await refreshWorkspace();
     } catch (paymentError) {
       const message = paymentError instanceof Error ? paymentError.message : copy.error;
       setError(message);
     } finally {
       setSaving(false);
     }
   }, [businessConfiguration, copy.error, copy.orders, copy.saved, paymentAmount, paymentMethod, paymentOrder, refreshWorkspace, session, updateSession]);

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
    paymentAttemptRef.current = null;
    setPaymentAmount('');
    setPaymentMethod('');
    setError('');
  }, []);

  // Saves business settings through the configuration API. The server checks
  // the configuration version, so the payload always carries the version that
  // was loaded; on success the fresh configuration replaces the cached one.
  const saveBusinessConfiguration = useCallback(async (patch: Record<string, unknown>): Promise<boolean> => {
    if (!session || !businessConfiguration) {
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
      setBusinessConfiguration(parsed);
      return true;
    } catch (saveFailure) {
      setError(saveFailure instanceof Error ? saveFailure.message : copy.error);
      return false;
    } finally {
      setSaving(false);
    }
  }, [businessConfiguration, copy.error, copy.settingsOnline, session, updateSession]);

  const completePasswordChange = useCallback(async (currentPassword: string, newPassword: string): Promise<void> => {
    if (!session) throw new Error(copy.settingsOnline);
    await apiRequest(session, '/api/v1/auth/password/change', {
      method: 'POST',
      body: { currentPassword, newPassword },
    }, updateSession);
    // The API revokes every session on a password change, including this one.
    sessionRef.current = null;
    resetWorkspaceData();
    setSession(null);
    await clearSession().catch(() => undefined);
  }, [copy.settingsOnline, resetWorkspaceData, session, updateSession]);

  const resetStaffPassword = useCallback(async (membershipId: string, newPassword: string): Promise<void> => {
    if (!session) throw new Error(copy.settingsOnline);
    await apiRequest(session, `/api/v1/business/staff/${membershipId}/password-reset`, {
      method: 'POST',
      body: { newPassword },
    }, updateSession);
  }, [copy.settingsOnline, session, updateSession]);

  const archiveCustomer = useCallback(async (customer: LocalCustomer): Promise<void> => {
    if (!session) throw new Error(copy.settingsOnline);
    await apiRequest(session, `/api/v1/customers/${customer.id}`, {
      method: 'DELETE',
      body: { version: customer.version },
    }, updateSession);
    setCustomers((current) => current.filter((item) => item.id !== customer.id));
  }, [copy.settingsOnline, session, updateSession]);

  const restoreCustomer = useCallback(async (customer: LocalCustomer): Promise<void> => {
    if (!session) throw new Error(copy.settingsOnline);
    await apiRequest(session, `/api/v1/customers/${customer.id}/restore`, {
      method: 'POST',
      body: { version: customer.version },
    }, updateSession);
    await refreshWorkspace();
  }, [copy.settingsOnline, refreshWorkspace, session, updateSession]);

  const fetchArchivedCustomers = useCallback(async (): Promise<LocalCustomer[]> => {
    const result = await erpRequest<{ items: RemoteCustomer[] }>('/customers?limit=100&archived=true');
    return result.items.map(mapRemoteCustomer);
  }, [erpRequest]);

  const archiveOrder = useCallback(async (order: LocalOrder): Promise<void> => {
    if (!session) throw new Error(copy.settingsOnline);
    await apiRequest(session, `/api/v1/orders/${order.id}`, {
      method: 'DELETE',
      body: { version: order.version },
    }, updateSession);
    setOrders((current) => current.filter((item) => item.id !== order.id));
  }, [copy.settingsOnline, session, updateSession]);

  const restoreOrder = useCallback(async (order: LocalOrder): Promise<void> => {
    if (!session) throw new Error(copy.settingsOnline);
    await apiRequest(session, `/api/v1/orders/${order.id}/restore`, {
      method: 'POST',
      body: { version: order.version },
    }, updateSession);
    await refreshWorkspace();
  }, [copy.settingsOnline, refreshWorkspace, session, updateSession]);

  const fetchArchivedOrders = useCallback(async (): Promise<LocalOrder[]> => {
    const result = await erpRequest<{ items: RemoteOrder[] }>('/orders?limit=100&archived=true');
    return result.items.map(mapRemoteOrder);
  }, [erpRequest]);

  const fetchAlterations = useCallback(async (orderId: string): Promise<AlterationTask[]> => {
    const result = await erpRequest<{ items: AlterationTask[] }>(`/orders/${orderId}/alterations`);
    return result.items;
  }, [erpRequest]);

  const createAlteration = useCallback(async (orderId: string, description: string): Promise<AlterationTask> => {
    return erpRequest<AlterationTask>(`/orders/${orderId}/alterations`, {
      method: 'POST',
      body: { description },
    });
  }, [erpRequest]);

  const setAlterationStatus = useCallback(async (orderId: string, alterationId: string, status: 'OPEN' | 'DONE'): Promise<AlterationTask> => {
    return erpRequest<AlterationTask>(`/orders/${orderId}/alterations/${alterationId}`, {
      method: 'PATCH',
      body: { status },
    });
  }, [erpRequest]);

  const downloadServerExport = useCallback(async (
    kind: 'customers' | 'orders' | 'payments' | 'ledger',
    options?: { archived?: boolean },
  ): Promise<{ bytes: Uint8Array; filename: string; mimeType: string }> => {
    if (!session) throw new Error(copy.settingsOnline);
    const query = kind === 'orders' && options?.archived ? '?archived=true' : '';
    const result = await apiDownloadRequest(session, `/api/v1/exports/${kind}.csv${query}`, updateSession);
    return { bytes: result.bytes, filename: `${kind}.csv`, mimeType: 'text/csv' };
  }, [copy.settingsOnline, session, updateSession]);

  const downloadOrderInvoice = useCallback(async (
    order: LocalOrder,
  ): Promise<{ bytes: Uint8Array; filename: string; mimeType: string }> => {
    if (!session) throw new Error(copy.settingsOnline);
    const result = await apiDownloadRequest(session, `/api/v1/orders/${order.id}/invoice.pdf`, updateSession);
    return { bytes: result.bytes, filename: `invoice-${order.order_number ?? order.id}.pdf`, mimeType: 'application/pdf' };
  }, [copy.settingsOnline, session, updateSession]);

  const fetchRoles = useCallback(async (): Promise<BusinessRole[]> => {
    if (!session) throw new Error(copy.settingsOnline);
    const response = await apiRequest<{ data?: { items?: BusinessRole[] } }>(session, '/api/v1/business/roles', {}, updateSession);
    return (response.data?.items ?? []).filter((role) => role.name !== 'Owner');
  }, [copy.settingsOnline, session, updateSession]);

  const fetchBusinessPermissions = useCallback(async (): Promise<BusinessPermission[]> => {
    if (!session) throw new Error(copy.settingsOnline);
    const response = await apiRequest<{ data?: { items?: BusinessPermission[] } }>(session, '/api/v1/business/permissions', {}, updateSession);
    return response.data?.items ?? [];
  }, [copy.settingsOnline, session, updateSession]);

  const fetchBusinessStaff = useCallback(async (): Promise<BusinessMember[]> => {
    if (!session) throw new Error(copy.settingsOnline);
    const response = await apiRequest<{ data?: { items?: BusinessMember[] } }>(session, '/api/v1/business/staff', {}, updateSession);
    return response.data?.items ?? [];
  }, [copy.settingsOnline, session, updateSession]);

  const createBusinessRole = useCallback(async (input: { name: string; permissions: string[] }): Promise<BusinessRole> => {
    if (!session) throw new Error(copy.settingsOnline);
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
  }, [copy.error, copy.settingsOnline, session, updateSession]);

  const inviteStaffMember = useCallback(async (input: { name: string; email: string; initialPassword: string; roleId: string }): Promise<BusinessMember> => {
    if (!session) throw new Error(copy.settingsOnline);
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
  }, [copy.error, copy.settingsOnline, session, updateSession]);

  // Helpers
  const membership = session?.permissions ?? [];
  const can = (permission: string) => membership.includes(permission);
  const term = (key: string, fallback: string) => businessConfiguration?.terminology[key] ?? fallback;
  const moduleEnabled = (module: string) => Boolean(businessConfiguration?.enabledModules.includes(module));
  const paymentMethodOptions = orderPaymentMethodOptions(businessConfiguration?.paymentMethods ?? []);
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

  const value: WorkspaceContextValue = useMemo(() => ({
    copy,
    rtl,
    language,
    setLanguage: changeLanguage,
    languageOptions,
    branding,
    themeMode,
    palette,
    session,
    businessConfiguration,
    customers,
    orders,
    catalogItems,
    templates,
    measurements,
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
    sendWhatsAppMessage,
    openOrderPayment,
    recordPayment,
    refreshWorkspace,
    loadCustomerMeasurements,
    refreshNotificationHistory,
    refreshSubscriptionBilling,
    cancelOrderPayment,
    saveBusinessConfiguration,
    completePasswordChange,
    resetStaffPassword,
    archiveCustomer,
    restoreCustomer,
    fetchArchivedCustomers,
    archiveOrder,
    restoreOrder,
    fetchArchivedOrders,
    fetchAlterations,
    createAlteration,
    setAlterationStatus,
    downloadServerExport,
    downloadOrderInvoice,
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
    copy, rtl, language, changeLanguage, languageOptions,     branding, themeMode, palette,
    session,
    businessConfiguration, customers, orders, catalogItems, templates, measurements,
    dashboard, notificationHistory, subscriptionBilling,
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
    saveCatalogItem, toggleCatalogItem, transitionOrder, sendWhatsAppMessage, openOrderPayment, recordPayment, refreshWorkspace,
    refreshNotificationHistory, refreshSubscriptionBilling, email, password,
    authBusy, shopChoices, cancelOrderPayment, saveBusinessConfiguration,
    completePasswordChange, resetStaffPassword, archiveCustomer, restoreCustomer,
    fetchArchivedCustomers, archiveOrder, restoreOrder, fetchArchivedOrders, fetchAlterations, createAlteration, setAlterationStatus, downloadServerExport, downloadOrderInvoice, fetchRoles,
    fetchBusinessPermissions, fetchBusinessStaff, createBusinessRole, inviteStaffMember,
  ]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

// Re-export commonly used helpers so screen files don't need to know the
// internal naming.
export { resolveMobileWorkflowStage, mobileFieldVisible, mobileFieldOptions, validateConfiguredFields, configuredFieldValues, fieldValueIsEmpty, karachiDateInput, API_BASE_URL };
