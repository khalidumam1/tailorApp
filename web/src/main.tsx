import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import {
  createCustomerSchema,
  createMeasurementRevisionSchema,
  createOrderSchema,
  createPaymentSchema,
} from '@tailor/shared';
import {
  api,
  ApiError,
  type BusinessFieldInput,
  type BusinessStageInput,
  type BusinessTransitionInput,
  type CurrentUser,
  type Customer,
  type BusinessConfiguration,
  type BusinessConfigurationHistoryEntry,
  type BusinessTemplate,
  parseNotificationTemplates,
  parseBusinessTemplateInput,
  type Dashboard,
  type MeasurementTemplate,
  type LoginResult,
  type MeasurementProfile,
  type Order,
  type Payment,
  type Receipt,
  type Session,
  type WhatsAppNotification,
} from './api';
import { BusinessStructureEditors } from './BusinessStructureEditors';
import { BusinessTeamAdmin } from './BusinessTeamAdmin';
import { Icon, type IconName } from './Icons';
import './styles.css';

type View = 'dashboard' | 'orders' | 'catalog' | 'customers' | 'measurements' | 'payments' | 'notifications' | 'subscription' | 'configuration';
type PlatformView = 'businesses' | 'templates' | 'staff' | 'audit' | 'health' | 'billing' | 'plans' | 'paymentQueue' | 'billingSettings' | 'reports';
type Selection = Exclude<LoginResult, { accessToken: string }>;

const navigation: Array<{ view: View; label: string; permission?: string; module?: string }> = [
  { view: 'dashboard', label: 'Overview', permission: 'orders:read' },
  { view: 'orders', label: 'Orders', permission: 'orders:read', module: 'orders' },
  { view: 'catalog', label: 'Catalog', permission: 'orders:read', module: 'catalog' },
  { view: 'customers', label: 'Customers', permission: 'customers:read', module: 'customers' },
  { view: 'measurements', label: 'Measurements', permission: 'measurements:read', module: 'measurements' },
  { view: 'payments', label: 'Payments', permission: 'payments:read', module: 'payments' },
  { view: 'notifications', label: 'WhatsApp notifications', permission: 'notifications:read', module: 'notifications' },
  { view: 'subscription', label: 'Subscription & billing', permission: 'subscriptions:read' },
  { view: 'configuration', label: 'Business settings', permission: 'settings:manage' },
];

function money(value: string | undefined, currency = 'PKR'): string {
  if (value === undefined) return '—';
  return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value));
}

function karachiDate(value: string): string {
  return new Intl.DateTimeFormat('en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Karachi',
  }).format(new Date(value));
}

function dateTimeInput(daysFromNow: number): string {
  const now = new Date();
  const karachi = new Date(now.getTime() + (5 * 60 + now.getTimezoneOffset()) * 60000);
  karachi.setDate(karachi.getDate() + daysFromNow);
  return karachi.toISOString().slice(0, 16);
}

function karachiInputToUtc(value: string): string {
  return new Date(`${value}:00+05:00`).toISOString();
}

function structureDraft(configuration: BusinessConfiguration): {
  fields: BusinessFieldInput[];
  stages: BusinessStageInput[];
  transitions: BusinessTransitionInput[];
} {
  const stages = configuration.workflow.stages.map((stage) => ({
    key: stage.key,
    label: stage.label,
    sortOrder: stage.sortOrder,
    isInitial: stage.isInitial,
    isTerminal: stage.isTerminal,
    actions: stage.actions,
  }));
  const stageKeys = new Map(configuration.workflow.stages.map((stage) => [stage.id, stage.key]));
  return {
    fields: configuration.tenantFields.map((field) => ({
      module: field.module,
      screen: field.screen,
      key: field.key,
      label: field.label,
      type: field.type as BusinessFieldInput['type'],
      required: field.required,
      sortOrder: field.sortOrder,
      ...(field.defaultValue !== null ? { defaultValue: field.defaultValue } : {}),
      ...(field.validation !== null ? { validation: field.validation } : {}),
      ...(field.options !== null ? { options: field.options } : {}),
      ...(field.visibility !== null ? { visibility: field.visibility } : {}),
    })),
    stages,
    transitions: configuration.workflow.transitions.flatMap((transition) => {
      const from = stageKeys.get(transition.fromStageId);
      const to = stageKeys.get(transition.toStageId);
      return from && to ? [{
        from,
        to,
        allowedRoleKeys: transition.allowedRoleKeys,
        actions: transition.actions,
      }] : [];
    }),
  };
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [scopeChoice, setScopeChoice] = useState<'business' | 'platform'>('business');
  const [businessChoice, setBusinessChoice] = useState('');
  const [view, setView] = useState<View>('dashboard');
  const [online, setOnline] = useState(navigator.onLine);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [businessConfiguration, setBusinessConfiguration] = useState<BusinessConfiguration | null>(null);
  const [businessConfigurationDraft, setBusinessConfigurationDraft] = useState<BusinessConfiguration | null>(null);
  const [businessConfigurationHistory, setBusinessConfigurationHistory] = useState<BusinessConfigurationHistoryEntry[]>([]);
  const [businessConfigurationHistoryCursor, setBusinessConfigurationHistoryCursor] = useState<string | null>(null);
  const [loadingBusinessConfigurationHistory, setLoadingBusinessConfigurationHistory] = useState(false);
  const businessConfigurationHistoryRequest = useRef(0);
  const [structureFields, setStructureFields] = useState<BusinessFieldInput[]>([]);
  const [structureStages, setStructureStages] = useState<BusinessStageInput[]>([]);
  const [structureTransitions, setStructureTransitions] = useState<BusinessTransitionInput[]>([]);
  const [notificationTemplateJson, setNotificationTemplateJson] = useState('{}');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [catalogItems, setCatalogItems] = useState<import('./api').CatalogItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [notifications, setNotifications] = useState<WhatsAppNotification[]>([]);
  const [templates, setTemplates] = useState<MeasurementTemplate[]>([]);
  const [profiles, setProfiles] = useState<MeasurementProfile[]>([]);
  const [search, setSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [customerCustomFields, setCustomerCustomFields] = useState<Record<string, unknown>>({});
  const [catalogName, setCatalogName] = useState('');
  const [catalogDescription, setCatalogDescription] = useState('');
  const [catalogTypeKey, setCatalogTypeKey] = useState('');
  const [catalogSku, setCatalogSku] = useState('');
  const [catalogUnit, setCatalogUnit] = useState('unit');
  const [catalogUnitPrice, setCatalogUnitPrice] = useState('');
  const [catalogCustomFields, setCatalogCustomFields] = useState<Record<string, unknown>>({});
  const [editingCatalogItemId, setEditingCatalogItemId] = useState<string | null>(null);
  const [orderCustomerId, setOrderCustomerId] = useState('');
  const [orderCatalogItemId, setOrderCatalogItemId] = useState('');
  const [orderItemName, setOrderItemName] = useState('');
  const [orderItemTypeKey, setOrderItemTypeKey] = useState('');
  const [orderCustomFields, setOrderCustomFields] = useState<Record<string, unknown>>({});
  const [orderItemCustomFields, setOrderItemCustomFields] = useState<Record<string, unknown>>({});
  const [orderQuantity, setOrderQuantity] = useState('1');
  const [orderPrice, setOrderPrice] = useState('');
  const [orderDueAt, setOrderDueAt] = useState(dateTimeInput(7));
  const [orderMeasurementId, setOrderMeasurementId] = useState('');
  const [measurementCustomerId, setMeasurementCustomerId] = useState('');
  const [measurementTemplateId, setMeasurementTemplateId] = useState('');
  const [measurementValues, setMeasurementValues] = useState<Record<string, string>>({});
  const [measurementNotes, setMeasurementNotes] = useState('');
  const [paymentOrderId, setPaymentOrderId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK' | 'DIGITAL'>('CASH');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [platformView, setPlatformView] = useState<PlatformView>('businesses');
  const [platformBusinesses, setPlatformBusinesses] = useState<import('./api').PlatformBusiness[]>([]);
  const [platformTemplates, setPlatformTemplates] = useState<BusinessTemplate[]>([]);
  const [platformTemplateKey, setPlatformTemplateKey] = useState('tailor');
  const [platformTemplateDraft, setPlatformTemplateDraft] = useState('');
  const [editingPlatformTemplateId, setEditingPlatformTemplateId] = useState<string | null>(null);
  const [platformTemplateRevisions, setPlatformTemplateRevisions] = useState<import('./api').BusinessTemplateRevision[]>([]);
  const [selectedTemplateRevisionId, setSelectedTemplateRevisionId] = useState('');
  const [loadingTemplateRevisions, setLoadingTemplateRevisions] = useState(false);
  const [platformTemplateHistoryRefresh, setPlatformTemplateHistoryRefresh] = useState(0);
  const [platformStaff, setPlatformStaff] = useState<import('./api').PlatformStaff[]>([]);
  const [platformPermissions, setPlatformPermissions] = useState<import('./api').PlatformPermission[]>([]);
  const [platformAudit, setPlatformAudit] = useState<import('./api').AuditEvent[]>([]);
  const [platformHealth, setPlatformHealth] = useState<{ status: string; database: string; checkedAt: string } | null>(null);
  const [staffPermissionDrafts, setStaffPermissionDrafts] = useState<Record<string, string[]>>({});
  const [businessName, setBusinessName] = useState('');
  const [businessSlug, setBusinessSlug] = useState('');
  const [ownerBusinessId, setOwnerBusinessId] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [platformStaffName, setPlatformStaffName] = useState('');
  const [platformStaffEmail, setPlatformStaffEmail] = useState('');
  const [platformStaffPassword, setPlatformStaffPassword] = useState('');
  const [newStaffPermissions, setNewStaffPermissions] = useState<string[]>([]);
  const [shopSubscription, setShopSubscription] = useState<Awaited<ReturnType<typeof api.shopSubscription>> | null>(null);
  const [selectedSubscriptionPlanId, setSelectedSubscriptionPlanId] = useState('');
  const [subscriptionCycle, setSubscriptionCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [subscriptionPayment, setSubscriptionPayment] = useState({ transactionReference: '', senderName: '', amount: '', method: '', paymentDate: new Date().toISOString().slice(0, 10) });
  const [billingDashboard, setBillingDashboard] = useState<import('./api').PlatformBillingDashboard | null>(null);
  const [billingPlans, setBillingPlans] = useState<import('./api').SubscriptionPlan[]>([]);
  const [billingPayments, setBillingPayments] = useState<import('./api').SubscriptionPayment[]>([]);
  const [billingPaymentCursor, setBillingPaymentCursor] = useState<string | null>(null);
  const [billingPaymentSearch, setBillingPaymentSearch] = useState('');
  const [billingPaymentFilter, setBillingPaymentFilter] = useState('REVIEW');
  const [billingSettings, setBillingSettings] = useState<import('./api').BillingSettings | null>(null);
  const [billingBusinesses, setBillingBusinesses] = useState<import('./api').PlatformBusiness[]>([]);
  const [billingBusinessId, setBillingBusinessId] = useState('');
  const [billingBusinessDetail, setBillingBusinessDetail] = useState<Awaited<ReturnType<typeof api.platformBillingBusiness>> | null>(null);
  const [planDraft, setPlanDraft] = useState({ name: '', description: '', monthlyPrice: '', yearlyPrice: '', trialDays: '14' });
  const [planFeatures, setPlanFeatures] = useState<Record<string, boolean>>({
    customers: true, measurements: true, orders: true, payments: true, catalog: true, notifications: true, staff: true, reports: true,
  });
  const [planLimits, setPlanLimits] = useState<Record<string, string>>({
    customers: '-1', staff: '-1', ordersPerMonth: '-1', catalogItems: '-1',
  });
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [assignDraft, setAssignDraft] = useState({
    planId: '',
    startsAt: dateTimeInput(0),
    endsAt: dateTimeInput(30),
    reason: '',
    status: 'ACTIVE' as 'ACTIVE' | 'TRIAL',
    complimentary: true,
    customPrice: '',
    discountAmount: '0',
  });
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [rejectingSubscriptionPaymentId, setRejectingSubscriptionPaymentId] = useState<string | null>(null);
  const [reportFrom, setReportFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [reportTo, setReportTo] = useState(new Date().toISOString().slice(0, 10));

  const withSession = useCallback(async <T,>(action: (token: string) => Promise<T>): Promise<T> => {
    if (!session) throw new Error('Please sign in again.');
    try {
      return await action(session.accessToken);
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.status !== 401) throw cause;
      const renewed = await api.refresh(session.refreshToken);
      const nextSession = { ...session, ...renewed };
      setSession(nextSession);
      return action(nextSession.accessToken);
    }
  }, [session]);

  const reloadCurrent = useCallback(async () => {
    if (!session || currentUser?.context.scope !== 'business') return;
    setLoading(true);
    setError(null);
    try {
      if (view === 'dashboard') {
        setDashboard(await withSession(api.dashboard));
      } else if (view === 'orders') {
        const [orderResult, customerResult, catalogResult] = await Promise.all([
          withSession((token) => api.orders(token, search)),
          withSession((token) => api.customers(token)),
          businessConfiguration?.enabledModules.includes('catalog')
            ? withSession((token) => api.catalog(token))
            : Promise.resolve({ items: [], nextCursor: null }),
        ]);
        setOrders(orderResult.items);
        setCustomers(customerResult.items);
        setCatalogItems(catalogResult.items);
      } else if (view === 'catalog') {
        setCatalogItems((await withSession((token) => api.catalog(token, search, true))).items);
      } else if (view === 'customers') {
        setCustomers((await withSession((token) => api.customers(token, search))).items);
      } else if (view === 'measurements') {
        const [templateResult, customerResult] = await Promise.all([
          withSession(api.templates),
          withSession((token) => api.customers(token)),
        ]);
        setTemplates(templateResult.items);
        setCustomers(customerResult.items);
        if (!measurementTemplateId && templateResult.items[0]) setMeasurementTemplateId(templateResult.items[0].id);
        if (!measurementCustomerId && customerResult.items[0]) setMeasurementCustomerId(customerResult.items[0].id);
      } else if (view === 'payments') {
        setPayments((await withSession(api.payments)).items);
      } else if (view === 'subscription') {
        const result = await withSession(api.shopSubscription);
        setShopSubscription(result);
        if (!selectedSubscriptionPlanId && result.plans[0]) {
          setSelectedSubscriptionPlanId(result.plans[0].id);
          setSubscriptionPayment((current) => ({ ...current, amount: result.plans[0].monthlyPrice }));
        }
        if (!subscriptionPayment.method && result.paymentMethods[0]) {
          setSubscriptionPayment((current) => ({ ...current, method: result.paymentMethods[0] }));
        }
      } else {
        setNotifications((await withSession(api.notifications)).items);
      }
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [businessConfiguration?.enabledModules, currentUser?.context.scope, measurementCustomerId, measurementTemplateId, search, selectedSubscriptionPlanId, session, subscriptionPayment.method, view, withSession]);

  useEffect(() => {
    const onlineChanged = () => setOnline(navigator.onLine);
    window.addEventListener('online', onlineChanged);
    window.addEventListener('offline', onlineChanged);
    return () => {
      window.removeEventListener('online', onlineChanged);
      window.removeEventListener('offline', onlineChanged);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (session) {
      api.me(session.accessToken).then((user) => {
        if (active) {
          setCurrentUser(user);
          setError(null);
        }
      }).catch((cause: unknown) => {
        if (active) setError(messageFor(cause));
      });
    }
    return () => { active = false; };
  }, [session?.accessToken]);

  useEffect(() => {
    let active = true;
    businessConfigurationHistoryRequest.current += 1;
    setBusinessConfigurationHistory([]);
    setBusinessConfigurationHistoryCursor(null);
    setLoadingBusinessConfigurationHistory(false);
    if (!session || currentUser?.context.scope !== 'business') {
      setBusinessConfiguration(null);
      setBusinessConfigurationDraft(null);
      setBusinessConfigurationHistory([]);
      setBusinessConfigurationHistoryCursor(null);
      setStructureFields([]);
      setStructureStages([]);
      setStructureTransitions([]);
      setNotificationTemplateJson('{}');
      return () => { active = false; };
    }
    withSession(api.businessConfiguration)
      .then((configuration) => {
        if (active) {
          setBusinessConfiguration(configuration);
          setBusinessConfigurationDraft(configuration);
          const structure = structureDraft(configuration);
          setStructureFields(structure.fields);
          setStructureStages(structure.stages);
          setStructureTransitions(structure.transitions);
          setNotificationTemplateJson(JSON.stringify(configuration.notificationTemplates, null, 2));
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(messageFor(cause));
      });
    return () => { active = false; };
  }, [currentUser?.context.scope, session?.accessToken, withSession]);

  useEffect(() => {
    let active = true;
    if (view === 'measurements' && measurementCustomerId && currentUser?.context.permissions.includes('measurements:read')) {
      withSession((token) => api.measurements(token, measurementCustomerId))
        .then((result) => { if (active) setProfiles(result.items); })
        .catch((cause: unknown) => { if (active) setError(messageFor(cause)); });
    }
    return () => { active = false; };
  }, [currentUser?.context.permissions, measurementCustomerId, view, withSession]);

  useEffect(() => {
    if (session && currentUser?.context.scope === 'business') void reloadCurrent();
  }, [currentUser?.context.scope, reloadCurrent, session]);

  useEffect(() => {
    let active = true;
    if (!session || currentUser?.context.scope !== 'platform') return;
    const viewPermissions: Record<PlatformView, string> = {
      businesses: 'platform:businesses:read',
      templates: 'platform:templates:manage',
      staff: 'platform:staff:manage',
      audit: 'platform:audit:read',
      health: 'platform:system:health',
      billing: 'platform:subscriptions:read',
      plans: 'platform:plans:manage',
      paymentQueue: 'platform:payments:review',
      billingSettings: 'platform:billing:settings',
      reports: 'platform:reports:read',
    };
    if (!currentUser.context.platformPermissions.includes(viewPermissions[platformView])) {
      setLoading(false);
      setError(null);
      const firstAvailable = (Object.entries(viewPermissions) as Array<[PlatformView, string]>)
        .find(([, permission]) => currentUser.context.platformPermissions.includes(permission))?.[0];
      if (firstAvailable) setPlatformView(firstAvailable);
      return;
    }
    setLoading(true);
    setError(null);
    const loadPlatform = async () => {
      if (platformView === 'businesses' && currentUser.context.platformPermissions.includes('platform:businesses:read')) {
        const [result, templates] = await Promise.all([
          withSession(api.platformBusinesses),
          withSession(api.platformTemplates),
        ]);
        if (active) {
          setPlatformBusinesses(result.items);
          setPlatformTemplates(templates.items);
          if (!templates.items.some((item) => item.key === platformTemplateKey) && templates.items[0]) {
            setPlatformTemplateKey(templates.items[0].key);
          }
        }
      } else if (platformView === 'templates' && currentUser.context.platformPermissions.includes('platform:templates:manage')) {
        const result = await withSession(api.platformTemplates);
        if (active) setPlatformTemplates(result.items);
      } else if (platformView === 'staff' && currentUser.context.platformPermissions.includes('platform:staff:manage')) {
        const [staff, permissions] = await Promise.all([
          withSession(api.platformStaff),
          withSession(api.platformPermissions),
        ]);
        if (active) {
          setPlatformStaff(staff.items);
          setPlatformPermissions(permissions.items);
          setStaffPermissionDrafts((current) => ({
            ...current,
            ...Object.fromEntries(staff.items.map((item) => [item.id, item.permissions])),
          }));
        }
      } else if (platformView === 'audit' && currentUser.context.platformPermissions.includes('platform:audit:read')) {
        const result = await withSession(api.auditEvents);
        if (active) setPlatformAudit(result.items);
      } else if (platformView === 'health' && currentUser.context.platformPermissions.includes('platform:system:health')) {
        const result = await withSession(api.platformHealth);
        if (active) setPlatformHealth(result);
      } else if (platformView === 'billing' && currentUser.context.platformPermissions.includes('platform:subscriptions:read')) {
        const [dashboard, businesses, plans] = await Promise.all([
          withSession(api.platformBillingDashboard),
          withSession(api.platformBillingBusinesses),
          withSession(api.platformSubscriptionPlans),
        ]);
        if (active) {
          setBillingDashboard(dashboard);
          setBillingBusinesses(businesses.items);
          setBillingPlans(plans.items);
        }
      } else if (platformView === 'plans' && currentUser.context.platformPermissions.includes('platform:plans:manage')) {
        setBillingPlans((await withSession(api.platformSubscriptionPlans)).items);
      } else if (platformView === 'paymentQueue' && currentUser.context.platformPermissions.includes('platform:payments:review')) {
        const result = await withSession(api.subscriptionPayments);
        setBillingPayments(result.items);
        setBillingPaymentCursor(result.nextCursor);
      } else if (platformView === 'billingSettings' && currentUser.context.platformPermissions.includes('platform:billing:settings')) {
        setBillingSettings(await withSession(api.billingSettings));
      } else {
        throw new Error('This platform permission is not granted.');
      }
    };
    loadPlatform().catch((cause: unknown) => {
      if (active) setError(messageFor(cause));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [currentUser, platformTemplateKey, platformView, session, withSession]);

  useEffect(() => {
    let active = true;
    if (!session || currentUser?.context.scope !== 'platform'
      || platformView !== 'templates'
      || !currentUser.context.platformPermissions.includes('platform:templates:manage')
      || !editingPlatformTemplateId) {
      setPlatformTemplateRevisions([]);
      setSelectedTemplateRevisionId('');
      setLoadingTemplateRevisions(false);
      return () => { active = false; };
    }
    setPlatformTemplateRevisions([]);
    setSelectedTemplateRevisionId('');
    setLoadingTemplateRevisions(true);
    withSession((token) => api.platformTemplateRevisions(token, editingPlatformTemplateId))
      .then((result) => {
        if (!active) return;
        setPlatformTemplateRevisions(result.items);
        setSelectedTemplateRevisionId((current) =>
          result.items.some((revision) => revision.id === current)
            ? current
            : result.items[0]?.id ?? '');
      })
      .catch((cause: unknown) => {
        if (active) setError(messageFor(cause));
      })
      .finally(() => {
        if (active) setLoadingTemplateRevisions(false);
      });
    return () => { active = false; };
  }, [currentUser, editingPlatformTemplateId, platformTemplateHistoryRefresh, platformView, session, withSession]);

  useEffect(() => {
    let active = true;
    if (session && currentUser?.context.scope === 'platform' && platformView === 'billing' && billingBusinessId) {
      withSession((token) => api.platformBillingBusiness(token, billingBusinessId))
        .then((detail) => { if (active) setBillingBusinessDetail(detail); })
        .catch((cause: unknown) => { if (active) setError(messageFor(cause)); });
    } else {
      setBillingBusinessDetail(null);
    }
    return () => { active = false; };
  }, [billingBusinessId, currentUser?.context.scope, platformView, session, withSession]);

  useEffect(() => {
    let active = true;
    if (view === 'orders' && orderCustomerId && currentUser?.context.permissions.includes('measurements:read')) {
      withSession((token) => api.measurements(token, orderCustomerId))
        .then((result) => { if (active) setProfiles(result.items); })
        .catch((cause: unknown) => { if (active) setError(messageFor(cause)); });
    } else {
      setProfiles([]);
    }
    return () => { active = false; };
  }, [currentUser?.context.permissions, orderCustomerId, session, view, withSession]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === measurementTemplateId),
    [measurementTemplateId, templates],
  );
  const configuredItemTypes = businessConfiguration?.itemTypes ?? [];
  const selectedOrderItemType = configuredItemTypes.find((type) => type.key === orderItemTypeKey)
    ?? configuredItemTypes[0];
  const orderFields = (businessConfiguration?.fields ?? [])
    .filter((field) => field.module === 'orders' && ['order', 'job'].includes(field.screen));
  const orderItemFields = (businessConfiguration?.fields ?? [])
    .filter((field) => field.module === 'orders'
      && ['order-item', 'item'].includes(field.screen)
      && !['item_name', 'garment_name', 'quantity'].includes(field.key)
      && isVisibleForItemType(field, selectedOrderItemType?.key));
  const customerFields = (businessConfiguration?.fields ?? [])
    .filter((field) => field.module === 'customers'
      && ['customer', 'customer-create'].includes(field.screen));

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const result = await api.login(
        email,
        password,
        selection ? scopeChoice : undefined,
        selection && scopeChoice === 'business' ? businessChoice : undefined,
      );
      if ('requiresScopeSelection' in result || 'requiresBusinessSelection' in result) {
        setSelection(result);
        if (result.businesses[0]) setBusinessChoice(result.businesses[0].id);
        return;
      }
      setSession(result);
      setSelection(null);
      setCurrentUser(null);
      setPassword('');
      setView('dashboard');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function signOut() {
    if (session) {
      try {
        await api.logout(session.accessToken, session.refreshToken);
      } catch (cause) {
        setNotice(`Session could not be revoked remotely: ${messageFor(cause)}`);
      }
    }
    setSession(null);
    setCurrentUser(null);
    setSelection(null);
    setDashboard(null);
    setOrders([]);
    setCatalogItems([]);
    setCustomers([]);
    setPayments([]);
    setNotifications([]);
    setReceipt(null);
  }

  async function addCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setWorking(true);
    setError(null);
    try {
      const input = createCustomerSchema.parse({
        name: customerName,
        phone: customerPhone,
        ...(customerNotes ? { notes: customerNotes } : {}),
        customFields: customerCustomFields,
      });
      await withSession((token) => api.createCustomer(token, input));
      setCustomerName('');
      setCustomerPhone('');
      setCustomerNotes('');
      setCustomerCustomFields({});
      setNotice('Customer saved.');
      await reloadCurrent();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function addCatalogItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !businessConfiguration) return;
    setWorking(true);
    setError(null);
    try {
      const typeKey = catalogTypeKey || businessConfiguration.itemTypes[0]?.key;
      if (!typeKey) throw new Error('Configure at least one item type in the business template.');
      if (editingCatalogItemId) {
        const current = catalogItems.find((item) => item.id === editingCatalogItemId);
        if (!current) throw new Error('Catalog item is no longer available; reload and try again.');
        await withSession((token) => api.updateCatalogItem(token, current.id, {
          version: current.version,
          typeKey,
          name: catalogName,
          description: catalogDescription || null,
          sku: catalogSku || null,
          unit: catalogUnit,
          unitPrice: catalogUnitPrice || null,
          sortOrder: current.sortOrder,
          customFields: catalogCustomFields,
        }));
      } else {
        await withSession((token) => api.createCatalogItem(token, {
          typeKey,
          name: catalogName,
          ...(catalogDescription ? { description: catalogDescription } : {}),
          ...(catalogSku ? { sku: catalogSku } : {}),
          unit: catalogUnit,
          ...(catalogUnitPrice ? { unitPrice: catalogUnitPrice } : {}),
          sortOrder: catalogItems.length,
          customFields: catalogCustomFields,
        }));
      }
      setCatalogName('');
      setCatalogDescription('');
      setCatalogSku('');
      setCatalogUnitPrice('');
      setCatalogCustomFields({});
      setEditingCatalogItemId(null);
      setNotice(`${businessConfiguration.terminology.item ?? 'Catalog item'} saved.`);
      await reloadCurrent();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function setCatalogItemActive(item: import('./api').CatalogItem, active: boolean) {
    if (!session) return;
    setWorking(true);
    setError(null);
    try {
      await withSession((token) => api.updateCatalogItem(token, item.id, { version: item.version, active }));
      setNotice(active ? `${item.name} activated.` : `${item.name} deactivated.`);
      await reloadCurrent();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  function editCatalogItem(item: import('./api').CatalogItem) {
    setEditingCatalogItemId(item.id);
    setCatalogTypeKey(item.typeKey);
    setCatalogName(item.name);
    setCatalogDescription(item.description ?? '');
    setCatalogSku(item.sku ?? '');
    setCatalogUnit(item.unit);
    setCatalogUnitPrice(item.unitPrice ?? '');
    const configuredFieldKeys = new Set((businessConfiguration?.fields ?? [])
      .filter((field) => field.module === 'catalog' && ['item', 'catalog-item'].includes(field.screen))
      .map((field) => field.key));
    setCatalogCustomFields(Object.fromEntries(
      Object.entries(item.customFields).filter(([key]) => configuredFieldKeys.has(key)),
    ));
    setError(null);
  }

  async function toggleWhatsAppConsent(customer: Customer) {
    if (!session) return;
    const consented = !customer.whatsappConsent;
    const confirmed = window.confirm(consented
      ? `Confirm that ${customer.name} has explicitly agreed to receive WhatsApp notifications.`
      : `Stop WhatsApp notifications to ${customer.name}?`);
    if (!confirmed) return;
    setWorking(true);
    setError(null);
    try {
      await withSession((token) => api.setWhatsAppConsent(token, customer, consented));
      setNotice(!consented
        ? `WhatsApp notifications opted out for ${customer.name}.`
        : `WhatsApp consent recorded for ${customer.name}.`);
      await reloadCurrent();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function addOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setWorking(true);
    setError(null);
    try {
      const input = createOrderSchema.parse({
        customerId: orderCustomerId,
        promisedAt: karachiInputToUtc(orderDueAt),
        items: [{
          itemTypeKey: orderItemTypeKey || businessConfiguration?.itemTypes[0]?.key,
          itemName: orderItemName,
          quantity: Number(orderQuantity),
          unitPrice: orderPrice,
          ...(orderMeasurementId ? { measurementProfileId: orderMeasurementId } : {}),
          customFields: orderItemCustomFields,
        }],
        customFields: orderCustomFields,
      });
      await withSession((token) => api.createOrder(token, input));
      setOrderPrice('');
      setOrderItemName('');
      setOrderMeasurementId('');
      setOrderCatalogItemId('');
      setOrderCustomFields({});
      setOrderItemCustomFields({});
      setNotice('Order created.');
      await reloadCurrent();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function changeWorkflowStage(order: Order, nextStageKey: string) {
    if (!session) return;
    const nextStage = businessConfiguration?.workflow.stages.find((stage) => stage.key === nextStageKey);
    if (nextStageKey === 'CANCELLED' && !window.confirm(`Cancel order ${order.orderNumber}? This action cannot be undone.`)) return;
    setWorking(true);
    setError(null);
    try {
      await withSession((token) => api.transitionWorkflow(token, order, nextStageKey));
      setNotice(`Order ${order.orderNumber} moved to ${nextStage?.label ?? nextStageKey}.`);
      await reloadCurrent();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function addMeasurement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !selectedTemplate) return;
    setWorking(true);
    setError(null);
    try {
      const values: Record<string, string | number> = {};
      for (const field of selectedTemplate.fields) {
        const value = measurementValues[field.key]?.trim();
        if (!value) continue;
        values[field.key] = field.unit.toLowerCase() === 'text' ? value : Number(value);
      }
      const input = createMeasurementRevisionSchema.parse({
        garmentTemplateId: selectedTemplate.id,
        values,
        measuredAt: new Date().toISOString(),
        ...(measurementNotes ? { notes: measurementNotes } : {}),
      });
      const result = await withSession((token) => api.createMeasurement(token, measurementCustomerId, input));
      setNotice(`Measurement revision ${result.revision.version} saved.`);
      setMeasurementNotes('');
      setMeasurementValues({});
      const updated = await withSession((token) => api.measurements(token, measurementCustomerId));
      setProfiles(updated.items);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function addPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !paymentOrderId) return;
    setWorking(true);
    setError(null);
    try {
      const input = createPaymentSchema.parse({ amount: paymentAmount, method: paymentMethod });
      const payment = await withSession((token) => api.createPayment(token, paymentOrderId, input, crypto.randomUUID()));
      setPaymentAmount('');
      const paymentReceipt = await withSession((token) => api.receipt(token, payment.id));
      setReceipt(paymentReceipt);
      setPaymentOrderId('');
      setNotice('Payment recorded. Its receipt is ready to print.');
      await reloadCurrent();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function showReceipt(paymentId: string) {
    if (!session) return;
    setError(null);
    try {
      setReceipt(await withSession((token) => api.receipt(token, paymentId)));
    } catch (cause) {
      setError(messageFor(cause));
    }
  }

  async function saveBusinessConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!businessConfigurationDraft) return;
    setWorking(true);
    setError(null);
    try {
      const notificationTemplates = parseNotificationTemplates(JSON.parse(notificationTemplateJson) as unknown);
      await withSession((token) => api.updateBusinessConfiguration(token, {
        version: businessConfigurationDraft.version,
        business: {
          name: businessConfigurationDraft.business.name,
          logoUrl: businessConfigurationDraft.business.logoUrl || null,
          currency: businessConfigurationDraft.business.currency,
          timezone: businessConfigurationDraft.business.timezone,
        },
        contactPhone: businessConfigurationDraft.contactPhone,
        terminologyOverrides: businessConfigurationDraft.terminology,
        enabledModules: businessConfigurationDraft.enabledModules,
        itemTypes: businessConfigurationDraft.itemTypes,
        paymentMethods: businessConfigurationDraft.paymentMethods,
        dashboardWidgets: businessConfigurationDraft.dashboardWidgets,
        notificationTemplates,
        publish: true,
      }));
      const configuration = await withSession(api.businessConfiguration);
      setBusinessConfiguration(configuration);
      setBusinessConfigurationDraft((current) => current ? {
        ...configuration,
        business: current.business,
        terminology: current.terminology,
        enabledModules: current.enabledModules,
        paymentMethods: current.paymentMethods,
        contactPhone: current.contactPhone,
        dashboardWidgets: current.dashboardWidgets,
      } : configuration);
      setNotificationTemplateJson(JSON.stringify(configuration.notificationTemplates, null, 2));
      if (businessConfiguration?.templateVersion !== configuration.templateVersion) {
        const structure = structureDraft(configuration);
        setStructureFields(structure.fields);
        setStructureStages(structure.stages);
        setStructureTransitions(structure.transitions);
        setNotice('Business settings published. The assigned template changed, so the field and workflow editor was refreshed.');
      } else {
        setNotice('Business configuration published.');
      }
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function saveBusinessStructure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!businessConfiguration) return;
    setWorking(true);
    setError(null);
    try {
      await withSession((token) => api.updateBusinessStructure(token, {
        version: businessConfiguration.configurationVersion,
        templateVersion: businessConfiguration.templateVersion,
        fields: structureFields,
        stages: structureStages,
        transitions: structureTransitions,
      }));
      const configuration = await withSession(api.businessConfiguration);
      setBusinessConfiguration(configuration);
      setBusinessConfigurationDraft((current) => current ? {
        ...configuration,
        business: current.business,
        terminology: current.terminology,
        enabledModules: current.enabledModules,
        paymentMethods: current.paymentMethods,
        contactPhone: current.contactPhone,
        dashboardWidgets: current.dashboardWidgets,
      } : configuration);
      const structure = structureDraft(configuration);
      setStructureFields(structure.fields);
      setStructureStages(structure.stages);
      setStructureTransitions(structure.transitions);
      setNotice('Business custom fields and workflow published.');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function loadBusinessConfigurationHistory(loadMore = false) {
    const requestId = ++businessConfigurationHistoryRequest.current;
    setLoadingBusinessConfigurationHistory(true);
    setError(null);
    try {
      const page = await withSession((token) => api.businessConfigurationHistory(
        token,
        loadMore ? businessConfigurationHistoryCursor ?? undefined : undefined,
      ));
      if (requestId === businessConfigurationHistoryRequest.current) {
        setBusinessConfigurationHistory((current) => loadMore ? [...current, ...page.items] : page.items);
        setBusinessConfigurationHistoryCursor(page.nextCursor);
      }
    } catch (cause) {
      if (requestId === businessConfigurationHistoryRequest.current) setError(messageFor(cause));
    } finally {
      if (requestId === businessConfigurationHistoryRequest.current) setLoadingBusinessConfigurationHistory(false);
    }
  }

  function editPlatformTemplate(template: BusinessTemplate) {
    const stageKeys = new Map(template.workflowStages.map((stage) => [stage.id, stage.key]));
    const draft = {
      key: template.key,
      name: template.name,
      category: template.category,
      ...(template.description ? { description: template.description } : {}),
      terminology: template.terminology,
      enabledModules: template.enabledModules,
      itemTypes: template.itemTypes,
      paymentMethods: template.paymentMethods,
      dashboardWidgets: template.dashboardWidgets,
      fields: template.fields.map((field) => ({
        module: field.module,
        screen: field.screen,
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        sortOrder: field.sortOrder,
        ...(field.defaultValue !== null ? { defaultValue: field.defaultValue } : {}),
        ...(field.validation !== null ? { validation: field.validation } : {}),
        ...(field.options !== null ? { options: field.options } : {}),
        ...(field.visibility !== null ? { visibility: field.visibility } : {}),
      })),
      stages: template.workflowStages.map((stage) => ({
        key: stage.key,
        label: stage.label,
        sortOrder: stage.sortOrder,
        isInitial: stage.isInitial,
        isTerminal: stage.isTerminal,
        actions: stage.actions,
      })),
      transitions: template.workflowTransitions.map((transition) => ({
        from: stageKeys.get(transition.fromStageId) ?? '',
        to: stageKeys.get(transition.toStageId) ?? '',
        allowedRoleKeys: transition.allowedRoleKeys,
        actions: transition.actions,
      })),
    };
    setEditingPlatformTemplateId(template.id);
    setPlatformTemplateDraft(JSON.stringify(draft, null, 2));
  }

  function startPlatformTemplate() {
    setEditingPlatformTemplateId(null);
    setPlatformTemplateDraft(JSON.stringify({
      key: '',
      name: '',
      category: 'SERVICE',
      description: '',
      terminology: { customer: 'Customer', customers: 'Customers', item: 'Item', items: 'Items', order: 'Order', orders: 'Orders' },
      enabledModules: ['customers', 'orders', 'payments'],
      itemTypes: [{ key: 'item', label: 'Item' }],
      paymentMethods: ['CASH'],
      dashboardWidgets: ['newOrders'],
      fields: [],
      stages: [
        { key: 'NEW', label: 'New', sortOrder: 0, isInitial: true, isTerminal: false, actions: [] },
        { key: 'COMPLETED', label: 'Completed', sortOrder: 1, isInitial: false, isTerminal: true, actions: [] },
      ],
      transitions: [{ from: 'NEW', to: 'COMPLETED', allowedRoleKeys: [], actions: [] }],
    }, null, 2));
  }

  async function savePlatformTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const raw: unknown = JSON.parse(platformTemplateDraft);
      const input = parseBusinessTemplateInput(raw);
      const saved = editingPlatformTemplateId
        ? await withSession((token) => api.updatePlatformTemplate(token, editingPlatformTemplateId, input))
        : await withSession((token) => api.createPlatformTemplate(token, input));
      const templates = await withSession(api.platformTemplates);
      setPlatformTemplates(templates.items);
      setEditingPlatformTemplateId(saved.id);
      setPlatformTemplateHistoryRefresh((current) => current + 1);
      setNotice(`Template ${saved.name} saved.`);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function createBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await withSession((token) => api.createPlatformBusiness(token, {
        name: businessName,
        slug: businessSlug,
        templateKey: platformTemplateKey,
      }));
      setBusinessName('');
      setBusinessSlug('');
      setNotice('Business created in pending state. Assign an owner before activation.');
      const result = await withSession(api.platformBusinesses);
      setPlatformBusinesses(result.items);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function assignOwner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const result = await withSession((token) => api.assignBusinessOwner(token, ownerBusinessId, {
        name: ownerName,
        email: ownerEmail,
        initialPassword: ownerPassword,
      }));
      setOwnerBusinessId('');
      setOwnerName('');
      setOwnerEmail('');
      setOwnerPassword('');
      setNotice(result.accountCreated
        ? `Owner account created for ${result.business.name}. Share the initial password securely.`
        : `Owner assigned for ${result.business.name}; the existing account password was not changed.`);
      const businesses = await withSession(api.platformBusinesses);
      setPlatformBusinesses(businesses.items);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function updateBusinessStatus(business: import('./api').PlatformBusiness, status: import('./api').PlatformBusiness['status']) {
    if (status === 'SUSPENDED' && !window.confirm(`Suspend ${business.name}? Business sign-in will be blocked.`)) return;
    setWorking(true);
    setError(null);
    try {
      const updated = await withSession((token) => api.setBusinessStatus(token, business.id, status));
      setPlatformBusinesses((current) => current.map((item) => item.id === business.id ? { ...item, ...updated } : item));
      setNotice(`${business.name} is now ${status.toLowerCase()}.`);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function createPlatformStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await withSession((token) => api.createPlatformStaff(token, {
        name: platformStaffName,
        email: platformStaffEmail,
        password: platformStaffPassword,
        permissions: newStaffPermissions,
      }));
      setPlatformStaffName('');
      setPlatformStaffEmail('');
      setPlatformStaffPassword('');
      setNewStaffPermissions([]);
      setNotice('Platform staff account created with the selected permissions.');
      const result = await withSession(api.platformStaff);
      setPlatformStaff(result.items);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function savePlatformStaff(staff: import('./api').PlatformStaff, active?: boolean) {
    if (active === false && !window.confirm(`Deactivate ${staff.name}? Their next request will be denied.`)) return;
    setWorking(true);
    setError(null);
    try {
      const updated = await withSession((token) => api.updatePlatformStaff(token, staff.id, {
        permissions: staffPermissionDrafts[staff.id] ?? staff.permissions,
        ...(active !== undefined ? { active } : {}),
      }));
      setPlatformStaff((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(`${staff.name}'s platform access was updated.`);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function submitSubscriptionPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const result = await withSession((token) => api.submitSubscriptionPayment(token, {
        planId: selectedSubscriptionPlanId,
        cycle: subscriptionCycle,
        ...subscriptionPayment,
      }));
      setShopSubscription((current) => current ? {
        ...current,
        payments: [result, ...current.payments],
      } : current);
      setSubscriptionPayment((current) => ({ ...current, transactionReference: '', senderName: '' }));
      setNotice('Payment details submitted for admin review. Your subscription has not been activated yet.');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const input = {
        ...planDraft,
        monthlyPrice: planDraft.monthlyPrice,
        yearlyPrice: planDraft.yearlyPrice,
        trialDays: Number(planDraft.trialDays),
        features: planFeatures,
        limits: Object.fromEntries(Object.entries(planLimits).map(([key, value]) => [key, Number(value)])),
      };
      if (editingPlanId) {
        const plan = await withSession((token) => api.updateSubscriptionPlan(token, editingPlanId, input));
        setBillingPlans((current) => current.map((item) => item.id === plan.id ? { ...item, ...plan, _count: item._count } : item));
        setNotice(`Plan ${plan.name} updated.`);
      } else {
        const plan = await withSession((token) => api.createSubscriptionPlan(token, { ...input, active: true, isDefault: false }));
        setBillingPlans((current) => [...current, plan]);
        setNotice('Subscription plan created.');
      }
      setPlanDraft({ name: '', description: '', monthlyPrice: '', yearlyPrice: '', trialDays: '14' });
      setPlanFeatures({
        customers: true, measurements: true, orders: true, payments: true, catalog: true, notifications: true, staff: true, reports: true,
      });
      setPlanLimits({ customers: '-1', staff: '-1', ordersPerMonth: '-1', catalogItems: '-1' });
      setEditingPlanId(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  function editPlan(plan: import('./api').SubscriptionPlan) {
    setEditingPlanId(plan.id);
    setPlanDraft({
      name: plan.name,
      description: plan.description ?? '',
      monthlyPrice: plan.monthlyPrice,
      yearlyPrice: plan.yearlyPrice,
      trialDays: String(plan.trialDays),
    });
    setPlanFeatures(plan.features);
    setPlanLimits(Object.fromEntries(Object.entries(plan.limits).map(([key, value]) => [key, String(value)])));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelPlanEdit() {
    setEditingPlanId(null);
    setPlanDraft({ name: '', description: '', monthlyPrice: '', yearlyPrice: '', trialDays: '14' });
    setPlanFeatures({
      customers: true, measurements: true, orders: true, payments: true, catalog: true, notifications: true, staff: true, reports: true,
    });
    setPlanLimits({ customers: '-1', staff: '-1', ordersPerMonth: '-1', catalogItems: '-1' });
  }

  async function reviewSubscriptionPayment(payment: import('./api').SubscriptionPayment, decision: 'APPROVE' | 'REJECT' | 'UNDER_REVIEW') {
    const reason = rejectionReasons[payment.id]?.trim();
    if (decision === 'REJECT' && !reason) {
      setError('Enter a rejection reason before rejecting a payment.');
      return;
    }
    if (decision === 'APPROVE' && !window.confirm(`Approve ${money(payment.amount)} for ${payment.business?.name ?? 'this business'} and activate its subscription?`)) return;
    setWorking(true);
    setError(null);
    try {
      const result = await withSession((token) => api.reviewSubscriptionPayment(
        token,
        payment.id,
        decision === 'REJECT' ? { decision, reason: reason ?? '' } : { decision },
      ));
      setBillingPayments((current) => decision === 'UNDER_REVIEW'
        ? current.map((item) => item.id === payment.id ? { ...item, ...result.payment } : item)
        : current.filter((item) => item.id !== payment.id));
      setRejectionReasons((current) => { const next = { ...current }; delete next[payment.id]; return next; });
      if (decision === 'REJECT') setRejectingSubscriptionPaymentId(null);
      setNotice(decision === 'APPROVE' ? `Payment approved; invoice and subscription period recorded.` : decision === 'REJECT' ? 'Payment rejected with the reason recorded.' : 'Payment marked under review.');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function searchSubscriptionPayments(event?: FormEvent<HTMLFormElement>, append = false) {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const status = billingPaymentFilter === 'REVIEW' ? undefined : billingPaymentFilter;
      const cursor = append ? billingPaymentCursor ?? undefined : undefined;
      if (append && !cursor) return;
      const result = await withSession((token) => api.subscriptionPayments(token, status, billingPaymentSearch, cursor));
      setBillingPayments((current) => append ? [...current, ...result.items] : result.items);
      setBillingPaymentCursor(result.nextCursor);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }

  async function saveBillingSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!billingSettings) return;
    setWorking(true);
    setError(null);
    try {
      setBillingSettings(await withSession((token) => api.updateBillingSettings(token, billingSettings)));
      setNotice('Billing instructions and subscription policies saved.');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function assignSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!billingBusinessId || !assignDraft.planId) {
      setError('Choose a business and plan before assigning access.');
      return;
    }
    setWorking(true);
    setError(null);
    try {
      await withSession((token) => api.assignBusinessSubscription(token, billingBusinessId, {
        planId: assignDraft.planId,
        cycle: 'CUSTOM',
        status: assignDraft.status,
        complimentary: assignDraft.complimentary,
        ...(!assignDraft.complimentary ? { customPrice: assignDraft.customPrice } : {}),
        discountAmount: assignDraft.discountAmount,
        startsAt: karachiInputToUtc(assignDraft.startsAt),
        endsAt: karachiInputToUtc(assignDraft.endsAt),
        reason: assignDraft.reason,
      }));
      setBillingBusinessDetail(await withSession((token) => api.platformBillingBusiness(token, billingBusinessId)));
      setAssignDraft((current) => ({ ...current, reason: '' }));
      setNotice('Complimentary access assigned and audited.');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function changeSubscriptionStatus(subscriptionId: string, status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED') {
    const reason = window.prompt(`Reason for ${status.toLowerCase()} this subscription?`)?.trim();
    if (!reason) return;
    setWorking(true);
    setError(null);
    try {
      await withSession((token) => api.setSubscriptionStatus(token, subscriptionId, {
        status,
        ...(status === 'ACTIVE' ? { endsAt: karachiInputToUtc(assignDraft.endsAt) } : {}),
        reason,
      }));
      if (billingBusinessId) setBillingBusinessDetail(await withSession((token) => api.platformBillingBusiness(token, billingBusinessId)));
      setNotice(`Subscription ${status.toLowerCase()} action recorded.`);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function downloadSubscriptionReceipt(paymentId: string, platform = false) {
    setWorking(true);
    setError(null);
    try {
      const blob = await withSession((token) => platform
        ? api.platformSubscriptionReceipt(token, paymentId)
        : api.subscriptionReceipt(token, paymentId));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'subscription-receipt.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function downloadSubscriptionReport() {
    setWorking(true);
    setError(null);
    try {
      const blob = await withSession((token) => api.subscriptionReportCsv(token, reportFrom, reportTo));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `subscription-reconciliation-${reportFrom}-${reportTo}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function recordSubscriptionAdjustment(payment: import('./api').SubscriptionPayment) {
    const kindChoice = window.prompt('Enter REFUND or ADJUSTMENT (this records an internal entry only):')?.trim().toUpperCase();
    if (kindChoice !== 'REFUND' && kindChoice !== 'ADJUSTMENT') return;
    const amount = window.prompt('Enter amount in PKR:')?.trim();
    if (!amount) return;
    const reason = window.prompt('Enter the reason (at least 5 characters):')?.trim();
    if (!reason || reason.length < 5) {
      setError('A reason of at least five characters is required.');
      return;
    }
    setWorking(true);
    setError(null);
    try {
      await withSession((token) => api.recordSubscriptionAdjustment(token, payment.id, {
        kind: kindChoice === 'REFUND' ? 'REFUND_RECORDED' : 'ADJUSTMENT_RECORDED',
        amount,
        reason,
      }));
      if (billingBusinessId) setBillingBusinessDetail(await withSession((token) => api.platformBillingBusiness(token, billingBusinessId)));
      setNotice(`${kindChoice === 'REFUND' ? 'Refund' : 'Adjustment'} recorded for reconciliation. This does not claim an external transfer occurred.`);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function togglePlan(plan: import('./api').SubscriptionPlan, updates: { active?: boolean; isDefault?: boolean }) {
    setWorking(true);
    setError(null);
    try {
      const updated = await withSession((token) => api.updateSubscriptionPlan(token, plan.id, updates));
      setBillingPlans((current) => current.map((item) => item.id === updated.id
        ? { ...item, ...updated, _count: item._count }
        : updates.isDefault ? { ...item, isDefault: false } : item));
      setNotice(`Plan ${updated.name} updated.`);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  if (!session) {
    const availableBusinesses = selection?.businesses ?? [];
    return (
      <main className="auth-layout">
        <section className="auth-brand">
          <p className="eyebrow">Made for the workroom</p>
          <h1>Good work starts with a good fit.</h1>
          <p>Keep customers, measurements, stitching progress and payments in one clear place.</p>
        </section>
        <form className="auth-card" onSubmit={submitLogin}>
          <div>
            <p className="eyebrow">TailorApp</p>
            <h2>{selection ? 'Choose your workspace' : 'Welcome back'}</h2>
            <p className="muted">{selection ? 'Sign in again to confirm your access scope.' : 'Sign in with your business account.'}</p>
          </div>
          {error && <p className="alert alert-error" role="alert">{error}</p>}
          {selection && (
            <fieldset className="scope-picker">
              <legend>Access context</legend>
              {('requiresScopeSelection' in selection && selection.canAccessPlatform) && (
                <label className="radio-row">
                  <input type="radio" name="scope" value="platform" checked={scopeChoice === 'platform'} onChange={() => setScopeChoice('platform')} />
                  Platform administration
                </label>
              )}
              {availableBusinesses.length > 0 && (
                <>
                  <label className="radio-row">
                    <input type="radio" name="scope" value="business" checked={scopeChoice === 'business'} onChange={() => setScopeChoice('business')} />
                    Business workspace
                  </label>
                  {scopeChoice === 'business' && (
                    <select aria-label="Business workspace" value={businessChoice} onChange={(event) => setBusinessChoice(event.target.value)}>
                      {availableBusinesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
                    </select>
                  )}
                </>
              )}
            </fieldset>
          )}
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <button className="button button-primary button-wide" type="submit" disabled={working || (selection !== null && scopeChoice === 'business' && !businessChoice)}>
            {working ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="fine-print">Your session stays in memory on this device. Never share your password.</p>
        </form>
      </main>
    );
  }

  if (currentUser?.context.scope === 'platform') {
    const grants = new Set(currentUser.context.platformPermissions);
    const canApprovePayments = currentUser.user.platformRole === 'SUPER_ADMIN' && grants.has('platform:payments:review');
    const platformNavigation: Array<{ view: PlatformView; label: string; permission: string }> = [
      { view: 'businesses', label: 'Businesses', permission: 'platform:businesses:read' },
      { view: 'templates', label: 'Business templates', permission: 'platform:templates:manage' },
      { view: 'billing', label: 'Subscriptions', permission: 'platform:subscriptions:read' },
      { view: 'plans', label: 'Plans', permission: 'platform:plans:manage' },
      { view: 'paymentQueue', label: 'Payment review', permission: 'platform:payments:review' },
      { view: 'billingSettings', label: 'Billing settings', permission: 'platform:billing:settings' },
      { view: 'reports', label: 'Billing reports', permission: 'platform:reports:read' },
      { view: 'staff', label: 'Platform staff', permission: 'platform:staff:manage' },
      { view: 'audit', label: 'Audit history', permission: 'platform:audit:read' },
      { view: 'health', label: 'System health', permission: 'platform:system:health' },
    ];
    const visiblePlatformNavigation = platformNavigation.filter((item) => grants.has(item.permission));
    const activeBusinesses = platformBusinesses.filter((business) => business.status === 'ACTIVE').length;
    const pendingBusinesses = platformBusinesses.filter((business) => business.status === 'PENDING').length;
    const suspendedBusinesses = platformBusinesses.filter((business) => business.status === 'SUSPENDED').length;
    return (
      <main className="page platform-state">
        <header className="platform-header">
          <div className="platform-brand" aria-label="TailorApp platform">
            <span className="platform-brand-mark" aria-hidden="true">T</span>
            <span><strong>TailorApp</strong><small>Platform console</small></span>
          </div>
          <div className="platform-header-actions">
            <span className="platform-access-badge"><span aria-hidden="true">●</span> Platform administrator</span>
            <div className="platform-identity">
              <span className="user-avatar" aria-hidden="true">{currentUser.user.name.trim().charAt(0).toUpperCase()}</span>
              <span className="platform-identity-name">{currentUser.user.name}<small>Super admin</small></span>
            </div>
            <button className="button button-secondary" onClick={() => void signOut()}><Icon name="signOut" /> Sign out</button>
          </div>
        </header>
        <section className="platform-welcome">
          <div><p className="eyebrow">Administration</p><h1>Platform control center</h1><p>Manage businesses, access, and service health from one place.</p></div>
          <span className="platform-scope-label"><span aria-hidden="true">✓</span> Secure platform scope</span>
        </section>
        <div className="platform-layout">
          <aside className="platform-sidebar" aria-label="Platform workspace">
            <p className="platform-sidebar-label">WORKSPACE</p>
            <nav className="platform-nav" aria-label="Platform navigation">
              {visiblePlatformNavigation.map((item) => (
                <button
                  key={item.view}
                  type="button"
                  className={platformView === item.view ? 'platform-nav-item is-active' : 'platform-nav-item'}
                  aria-current={platformView === item.view ? 'page' : undefined}
                  onClick={() => { setPlatformView(item.view); setError(null); }}
                >
                  <span className="platform-nav-icon"><Icon name={item.view} /></span>
                  <span className="nav-label">{item.label}</span>
                </button>
              ))}
            </nav>
            <div className="platform-sidebar-footer"><span className="connection-dot is-online" />Secure platform scope</div>
          </aside>
          <section className="platform-content-window" aria-label="Platform content">
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            {notice && <div className="alert alert-success" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice(null)}>×</button></div>}
            {visiblePlatformNavigation.length === 0 && <section className="panel"><h2>No platform tools assigned</h2><p className="muted">A platform administrator must explicitly grant access.</p></section>}
        {platformView === 'businesses' && grants.has('platform:businesses:read') && (
          <section className="content-stack">
            <div className="section-heading"><div><p className="eyebrow">Workspace management</p><h2>Business directory</h2><p className="muted">Onboard businesses, assign owners, and manage account status.</p></div></div>
            <div className="platform-metrics" aria-label="Business account summary">
              <article className="platform-metric"><span className="platform-metric-icon"><Icon name="businesses" /></span><span className="platform-metric-label">Registered businesses</span><strong>{loading ? '—' : platformBusinesses.length}</strong></article>
              <article className="platform-metric"><span className="platform-metric-icon is-green"><Icon name="check" /></span><span className="platform-metric-label">Active</span><strong>{loading ? '—' : activeBusinesses}</strong></article>
              <article className="platform-metric"><span className="platform-metric-icon is-amber"><Icon name="clock" /></span><span className="platform-metric-label">Pending review</span><strong>{loading ? '—' : pendingBusinesses}</strong></article>
              <article className="platform-metric"><span className="platform-metric-icon is-rose"><Icon name="warning" /></span><span className="platform-metric-label">Suspended</span><strong>{loading ? '—' : suspendedBusinesses}</strong></article>
            </div>
            {grants.has('platform:businesses:manage') && (
              <form className="panel form-panel platform-create-panel" onSubmit={createBusiness}>
                <div className="panel-heading"><span className="panel-kicker">New workspace</span><h3>Register a business</h3><p className="muted">New accounts start pending until an owner is assigned and access is reviewed.</p></div>
                <div className="form-grid">
                  <label>Business name<input value={businessName} onChange={(event) => setBusinessName(event.target.value)} maxLength={160} required /></label>
                  <label>Unique URL slug<input value={businessSlug} onChange={(event) => setBusinessSlug(event.target.value)} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} required /></label>
                  <label>Business template<select value={platformTemplateKey} onChange={(event) => setPlatformTemplateKey(event.target.value)} required>
                    {platformTemplates.map((template) => <option key={template.id} value={template.key}>{template.name} · {template.category}</option>)}
                  </select></label>
                </div>
                <div className="platform-form-footer"><p className="fine-print">The business inherits this template’s terminology, fields, modules, and workflow. The slug is its stable identifier.</p><button className="button button-primary" disabled={working || !online || platformTemplates.length === 0}>{working ? 'Creating…' : 'Create pending business'}</button></div>
              </form>
            )}
            {loading ? <LoadingState /> : platformBusinesses.length ? (
              <div className="table-wrap"><table><thead><tr><th>Business</th><th>Slug</th><th>Members</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>{platformBusinesses.map((business) => (
                  <tr key={business.id}>
                    <td><strong>{business.name}</strong><small className="table-note">{business.template?.name ?? 'Tailor template'}</small></td><td>{business.slug}</td><td>{business._count?.memberships ?? 0}</td>
                    <td><StatusPill status={business.status} /></td>
                    <td><div className="row-actions">
                      {grants.has('platform:businesses:manage') && <button className="button button-secondary" onClick={() => setOwnerBusinessId(business.id)}>Assign owner</button>}
                      {grants.has('platform:businesses:manage') && business.status !== 'ACTIVE' && <button className="button button-primary" disabled={working || !online} onClick={() => void updateBusinessStatus(business, 'ACTIVE')}>Activate</button>}
                      {grants.has('platform:businesses:manage') && business.status === 'ACTIVE' && <button className="button button-danger-quiet" disabled={working || !online} onClick={() => void updateBusinessStatus(business, 'SUSPENDED')}>Suspend</button>}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : !loading && <EmptyState title="No businesses registered" detail="Create a pending business to begin onboarding." />}
          </section>
        )}
        {platformView === 'templates' && grants.has('platform:templates:manage') && (
          <section className="content-stack">
            <div className="section-heading">
              <div><p className="eyebrow">Business builder</p><h2>Business templates</h2><p className="muted">Define terminology, modules, custom fields, item types, payment options, dashboard widgets, and workflow stages. Changes are validated and audited by the server.</p></div>
              <button className="button button-primary" type="button" onClick={startPlatformTemplate}>New template</button>
            </div>
            <div className="panel form-panel">
              <div className="form-grid">
                <label>Template to edit<select value={editingPlatformTemplateId ?? ''} onChange={(event) => setEditingPlatformTemplateId(event.target.value || null)}>
                  <option value="">Choose a template</option>
                  {platformTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.key}</option>)}
                </select></label>
                <div className="platform-form-footer">
                  <button className="button button-secondary" type="button" disabled={!editingPlatformTemplateId} onClick={() => {
                    const selected = platformTemplates.find((template) => template.id === editingPlatformTemplateId);
                    if (selected) editPlatformTemplate(selected);
                  }}>Load selected template</button>
                </div>
              </div>
              {(() => {
                const selected = platformTemplates.find((template) => template.id === editingPlatformTemplateId);
                return selected ? (
                  <div className="template-preview">
                    <p><strong>{selected.name}</strong> · {selected.category} · {selected.isSystem ? 'System template' : 'Custom template'}</p>
                    <p className="fine-print">Modules: {selected.enabledModules.join(', ')}</p>
                    <p className="fine-print">Items: {selected.itemTypes.map((item) => item.label).join(', ')}</p>
                    <p className="fine-print">Workflow: {selected.workflowStages.map((stage) => stage.label).join(' → ')}</p>
                    <p className="fine-print">Custom fields: {selected.fields.length} · Allowed transitions: {selected.workflowTransitions.length}</p>
                  </div>
                ) : null;
              })()}
            </div>
            {editingPlatformTemplateId && (
              <section className="panel form-panel template-revision-history" aria-labelledby="template-history-title">
                <div className="section-heading">
                  <div><h3 id="template-history-title">Published revision history</h3><p className="muted">Immutable snapshots include the full template configuration, fields, item types, stages, and transitions.</p></div>
                  <button className="button button-secondary" type="button" disabled={loadingTemplateRevisions} onClick={() => setPlatformTemplateHistoryRefresh((current) => current + 1)}>
                    {loadingTemplateRevisions ? 'Loading…' : 'Refresh history'}
                  </button>
                </div>
                {loadingTemplateRevisions && platformTemplateRevisions.length === 0 ? <LoadingState /> : platformTemplateRevisions.length ? (
                  <>
                    <div className="form-grid template-revision-controls">
                      <label>Revision<select value={selectedTemplateRevisionId} onChange={(event) => setSelectedTemplateRevisionId(event.target.value)}>
                        {platformTemplateRevisions.map((revision) => (
                          <option key={revision.id} value={revision.id}>
                            Version {revision.version} · {new Date(revision.createdAt).toLocaleString()}
                          </option>
                        ))}
                      </select></label>
                    </div>
                    {(() => {
                      const revision = platformTemplateRevisions.find((item) => item.id === selectedTemplateRevisionId);
                      if (!revision) return null;
                      return (
                        <>
                          <p className="fine-print">
                            Version {revision.version} · {revision.actor ? `${revision.actor.name} (${revision.actor.email})` : revision.actorId ? `Actor ${revision.actorId}` : 'Migration baseline'} · Request {revision.requestId}
                          </p>
                          <pre className="template-revision-snapshot">{JSON.stringify(revision.snapshot, null, 2)}</pre>
                        </>
                      );
                    })()}
                  </>
                ) : <p className="muted">No snapshots are available for this template yet.</p>}
              </section>
            )}
            {platformTemplateDraft ? (
              <form className="panel form-panel" onSubmit={savePlatformTemplate}>
                <div className="panel-heading"><h3>{editingPlatformTemplateId ? 'Customize template' : 'Create a template'}</h3><p className="muted">Edit the structured JSON below. Keys must be unique; workflows need one initial stage and at least one terminal stage. Businesses without tenant overrides inherit the saved template defaults.</p></div>
                <label className="span-all">Template configuration (JSON)<textarea className="template-json-editor" rows={24} spellCheck={false} value={platformTemplateDraft} onChange={(event) => setPlatformTemplateDraft(event.target.value)} required /></label>
                <button className="button button-primary" disabled={working || !online}>{working ? 'Saving…' : editingPlatformTemplateId ? 'Save template changes' : 'Create template'}</button>
              </form>
            ) : null}
            {loading ? <LoadingState /> : platformTemplates.length ? (
              <div className="template-card-grid">
                {platformTemplates.map((template) => (
                  <article className="panel template-summary" key={template.id}>
                    <div className="section-heading"><div><h3>{template.name}</h3><p className="muted">{template.key} · {template.category}</p></div><span className="notification-pill">{template.isSystem ? 'System' : 'Custom'}</span></div>
                    <p className="fine-print">{template.description ?? 'No description provided.'}</p>
                    <p className="fine-print">{template.workflowStages.length} workflow stages · {template.fields.length} fields · {template.enabledModules.length} modules</p>
                    <button className="button button-secondary" type="button" onClick={() => editPlatformTemplate(template)}>Edit template</button>
                  </article>
                ))}
              </div>
            ) : <EmptyState title="No templates available" />}
          </section>
        )}
        {platformView === 'staff' && grants.has('platform:staff:manage') && (
          <section className="content-stack">
            <div className="section-heading"><div><h2>Platform staff</h2><p className="muted">Staff receive only the permissions explicitly selected and allowed by your own grants.</p></div></div>
            <form className="panel form-panel" onSubmit={createPlatformStaff}>
              <div className="panel-heading"><h3>Add platform staff</h3><p className="muted">The initial password must be shared securely out of band.</p></div>
              <div className="form-grid">
                <label>Name<input value={platformStaffName} onChange={(event) => setPlatformStaffName(event.target.value)} required /></label>
                <label>Email<input type="email" value={platformStaffEmail} onChange={(event) => setPlatformStaffEmail(event.target.value)} required /></label>
                <label className="span-all">Initial password (20–72 characters)<input type="password" minLength={20} maxLength={72} value={platformStaffPassword} onChange={(event) => setPlatformStaffPassword(event.target.value)} required /></label>
                <fieldset className="permission-picker span-all"><legend>Platform permissions</legend>
                  {platformPermissions.map((permission) => (
                    <label key={permission.key} className="radio-row">
                      <input type="checkbox" checked={newStaffPermissions.includes(permission.key)} disabled={!grants.has(permission.key)} onChange={(event) => setNewStaffPermissions((current) => event.target.checked ? [...current, permission.key] : current.filter((key) => key !== permission.key))} />
                      <span><strong>{permission.key}</strong><small>{permission.description}</small></span>
                    </label>
                  ))}
                </fieldset>
              </div>
              <button className="button button-primary" disabled={working || !online}>{working ? 'Creating…' : 'Create platform staff account'}</button>
            </form>
            {platformStaff.map((staff) => (
              <article className="panel staff-card" key={staff.id}>
                <div className="section-heading"><div><h3>{staff.name}</h3><p className="muted">{staff.email} · {staff.active ? 'Active' : 'Inactive'}</p></div>
                  <button className={staff.active ? 'button button-danger-quiet' : 'button button-secondary'} disabled={working || !online} onClick={() => void savePlatformStaff(staff, !staff.active)}>{staff.active ? 'Deactivate' : 'Reactivate'}</button>
                </div>
                <fieldset className="permission-picker"><legend>Granted permissions</legend>
                  {platformPermissions.map((permission) => (
                    <label key={permission.key} className="radio-row">
                      <input type="checkbox" checked={(staffPermissionDrafts[staff.id] ?? staff.permissions).includes(permission.key)} disabled={!grants.has(permission.key)} onChange={(event) => setStaffPermissionDrafts((current) => {
                        const selected = current[staff.id] ?? staff.permissions;
                        return { ...current, [staff.id]: event.target.checked ? [...selected, permission.key] : selected.filter((key) => key !== permission.key) };
                      })} />
                      <span><strong>{permission.key}</strong><small>{permission.description}</small></span>
                    </label>
                  ))}
                </fieldset>
                <button className="button button-secondary" disabled={working || !online} onClick={() => void savePlatformStaff(staff)}>Save permissions</button>
              </article>
            ))}
          </section>
        )}
        {platformView === 'billing' && grants.has('platform:subscriptions:read') && (
          <section className="content-stack">
            <div className="section-heading"><div><p className="eyebrow">Subscription lifecycle</p><h2>Billing overview</h2><p className="muted">Renewals, trials, expiry and recorded manual payments. Approval is the only payment action that activates a subscription.</p></div></div>
            {loading ? <LoadingState /> : billingDashboard ? (
              <>
                <div className="platform-metrics billing-metrics">
                  <article className="platform-metric"><span className="platform-metric-label">Businesses</span><strong>{billingDashboard.businesses}</strong></article>
                  <article className="platform-metric"><span className="platform-metric-label">Active subscriptions</span><strong>{billingDashboard.active}</strong></article>
                  <article className="platform-metric"><span className="platform-metric-label">Trials</span><strong>{billingDashboard.trial}</strong></article>
                  <article className="platform-metric"><span className="platform-metric-label">Grandfathered access</span><strong>{billingDashboard.complimentary}</strong></article>
                  <article className="platform-metric"><span className="platform-metric-label">Expired</span><strong>{billingDashboard.expired}</strong></article>
                  <article className="platform-metric"><span className="platform-metric-label">Pending payments</span><strong>{billingDashboard.pendingPayments}</strong></article>
                  <article className="platform-metric"><span className="platform-metric-label">Recorded revenue</span><strong>{money(billingDashboard.recordedRevenue)}</strong></article>
                </div>
                {grants.has('platform:subscriptions:manage') && (
                  <details className="panel disclosure-panel">
                    <summary><span><strong>Manage a business subscription</strong><small>Assign a plan, free trial or complimentary access</small></span><span className="disclosure-action">Open form</span></summary>
                    {billingPlans.length === 0 && <p className="alert alert-error" role="alert">No active subscription plans are available. Create or activate a plan before assigning access.</p>}
                    <form className="form-grid disclosure-content" onSubmit={assignSubscription}>
                      <label>Business<select value={billingBusinessId} onChange={(event) => setBillingBusinessId(event.target.value)} required><option value="">Choose business</option>{billingBusinesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select></label>
                      <label>Plan<select value={assignDraft.planId} onChange={(event) => setAssignDraft((current) => ({ ...current, planId: event.target.value }))} required><option value="">Choose plan</option>{billingPlans.filter((plan) => plan.active).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
                      <label>Access type<select value={assignDraft.status} onChange={(event) => setAssignDraft((current) => ({ ...current, status: event.target.value as 'ACTIVE' | 'TRIAL' }))}><option value="ACTIVE">Active subscription</option><option value="TRIAL">Free trial</option></select></label>
                      <label>Starts at (Karachi time)<input type="datetime-local" value={assignDraft.startsAt} onChange={(event) => setAssignDraft((current) => ({ ...current, startsAt: event.target.value }))} required /></label>
                      <label>Expires at (Karachi time)<input type="datetime-local" value={assignDraft.endsAt} onChange={(event) => setAssignDraft((current) => ({ ...current, endsAt: event.target.value }))} required /></label>
                      <label className="checkbox-row"><input type="checkbox" checked={assignDraft.complimentary} onChange={(event) => setAssignDraft((current) => ({ ...current, complimentary: event.target.checked }))} /> Complimentary access</label>
                      {!assignDraft.complimentary && <label>Custom price (PKR)<input inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={assignDraft.customPrice} onChange={(event) => setAssignDraft((current) => ({ ...current, customPrice: event.target.value }))} required /></label>}
                      <label>Discount amount (PKR)<input inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={assignDraft.discountAmount} onChange={(event) => setAssignDraft((current) => ({ ...current, discountAmount: event.target.value }))} required /></label>
                      <label className="span-all">Reason<input value={assignDraft.reason} onChange={(event) => setAssignDraft((current) => ({ ...current, reason: event.target.value }))} minLength={5} maxLength={1000} required /></label>
                      <div className="span-all"><button className="button button-primary" disabled={working || !online || billingPlans.filter((plan) => plan.active).length === 0}>Assign subscription</button></div>
                    </form>
                  </details>
                )}
                <section className="panel content-stack">
                  <div><h3>Upcoming expiry alerts</h3><p className="muted">Contact these businesses within the configured reminder window before access expires.</p></div>
                  {billingDashboard.expiring.length ? <div className="table-wrap"><table><thead><tr><th>Business</th><th>Plan</th><th>Expires (Karachi)</th><th>Manage</th></tr></thead><tbody>
                    {billingDashboard.expiring.map((item) => <tr key={item.id}><td>{item.business.name}</td><td>{item.plan.name}</td><td>{karachiDate(item.endsAt)}</td><td><button className="button button-secondary" onClick={() => setBillingBusinessId(item.business.id)}>View history</button></td></tr>)}
                  </tbody></table></div> : <EmptyState title="No upcoming expiries" />}
                </section>
                {billingBusinessDetail && <section className="panel content-stack">
                  <div className="section-heading"><div><h3>{billingBusinessDetail.business.name} subscription history</h3><p className="muted">Business status: {billingBusinessDetail.business.status} · {billingBusinessDetail.business.slug}</p></div><button className="button button-quiet" onClick={() => setBillingBusinessId('')}>Close</button></div>
                  {billingBusinessDetail.subscriptions.length ? <div className="table-wrap"><table><thead><tr><th>Plan</th><th>Status</th><th>Cycle</th><th>Period</th><th>Management</th></tr></thead><tbody>
                    {billingBusinessDetail.subscriptions.map((subscription) => <tr key={subscription.id}><td>{subscription.plan.name}{subscription.grandfathered ? ' · Legacy access' : subscription.complimentary ? ' · Complimentary' : ''}</td><td>{subscription.status}</td><td>{subscription.cycle}</td><td>{karachiDate(subscription.startsAt)} – {karachiDate(subscription.endsAt)}</td><td><div className="row-actions">{grants.has('platform:subscriptions:manage') && subscription.status === 'ACTIVE' && <button className="button button-danger-quiet" disabled={working || !online} onClick={() => void changeSubscriptionStatus(subscription.id, 'SUSPENDED')}>Suspend</button>}{grants.has('platform:subscriptions:manage') && subscription.status === 'SUSPENDED' && <button className="button button-primary" disabled={working || !online} onClick={() => void changeSubscriptionStatus(subscription.id, 'ACTIVE')}>Reactivate</button>}{grants.has('platform:subscriptions:manage') && !['CANCELLED', 'EXPIRED'].includes(subscription.status) && <button className="button button-danger-quiet" disabled={working || !online} onClick={() => void changeSubscriptionStatus(subscription.id, 'CANCELLED')}>Cancel</button>}</div></td></tr>)}
                  </tbody></table></div> : <EmptyState title="No subscription periods" />}
                  <h3>Payments and system invoices</h3>
                  {billingBusinessDetail.payments.length ? <div className="table-wrap"><table><thead><tr><th>Transaction</th><th>Amount</th><th>Status</th><th>Invoice</th><th>Submitted</th><th>Receipt</th></tr></thead><tbody>
                    {billingBusinessDetail.payments.map((payment) => <tr key={payment.id}><td>{payment.transactionReference}</td><td>{money(payment.amount)}</td><td>{payment.status}</td><td>{payment.invoiceNumber ?? '—'}</td><td>{karachiDate(payment.createdAt)}</td><td><div className="row-actions">{payment.invoiceNumber && grants.has('platform:payments:review') && <button className="button button-quiet" disabled={working} onClick={() => void downloadSubscriptionReceipt(payment.id, true)}>Receipt PDF</button>}{payment.status === 'APPROVED' && canApprovePayments && <button className="button button-secondary" disabled={working || !online} onClick={() => void recordSubscriptionAdjustment(payment)}>Record refund/adjustment</button>}</div></td></tr>)}
                  </tbody></table></div> : <EmptyState title="No subscription payments" />}
                  <h3>Renewal and admin activity</h3>
                  {billingBusinessDetail.events.length ? <div className="table-wrap"><table><thead><tr><th>Action</th><th>Details</th><th>Recorded (Karachi)</th></tr></thead><tbody>
                    {billingBusinessDetail.events.map((event) => <tr key={event.id}><td>{event.action.replaceAll('.', ' ')}</td><td>{Object.entries(event.metadata).map(([key, value]) => `${key}: ${String(value)}`).join(' · ') || '—'}</td><td>{karachiDate(event.createdAt)}</td></tr>)}
                  </tbody></table></div> : <EmptyState title="No subscription events recorded" />}
                </section>}
              </>
            ) : <EmptyState title="Subscription overview unavailable" />}
          </section>
        )}
        {platformView === 'plans' && grants.has('platform:plans:manage') && (
          <section className="content-stack">
            <div className="section-heading"><div><p className="eyebrow">Pricing configuration</p><h2>Subscription plans</h2><p className="muted">Prices are PKR. Limits use -1 to indicate unlimited. Plan changes do not delete subscription history.</p></div></div>
            <details className="panel disclosure-panel" open={Boolean(editingPlanId)}>
              <summary><span><strong>{editingPlanId ? 'Edit subscription plan' : 'Create a plan'}</strong><small>Set prices, trial duration, included features and usage limits</small></span><span className="disclosure-action">{editingPlanId ? 'Editing' : 'Open form'}</span></summary>
              <form className="form-panel disclosure-content" onSubmit={createPlan}>
              <div className="panel-heading"><h3>{editingPlanId ? 'Edit subscription plan' : 'Create a plan'}</h3><p className="muted">New businesses receive a trial on the configured default plan.</p></div>
              <div className="form-grid">
                <label>Plan name<input value={planDraft.name} onChange={(event) => setPlanDraft((draft) => ({ ...draft, name: event.target.value }))} minLength={2} maxLength={100} required /></label>
                <label>Trial days<input type="number" min={0} max={365} value={planDraft.trialDays} onChange={(event) => setPlanDraft((draft) => ({ ...draft, trialDays: event.target.value }))} required /></label>
                <label>Monthly price (PKR)<input inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={planDraft.monthlyPrice} onChange={(event) => setPlanDraft((draft) => ({ ...draft, monthlyPrice: event.target.value }))} required /></label>
                <label>Yearly price (PKR)<input inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={planDraft.yearlyPrice} onChange={(event) => setPlanDraft((draft) => ({ ...draft, yearlyPrice: event.target.value }))} required /></label>
                <label className="span-all">Description<input value={planDraft.description} onChange={(event) => setPlanDraft((draft) => ({ ...draft, description: event.target.value }))} maxLength={1000} /></label>
              </div>
              <fieldset className="permission-picker"><legend>Included features</legend>
                {Object.entries(planFeatures).map(([feature, enabled]) => <label key={feature}><input type="checkbox" checked={enabled} onChange={(event) => setPlanFeatures((current) => ({ ...current, [feature]: event.target.checked }))} /> {feature.replaceAll(/([A-Z])/g, ' $1')}</label>)}
              </fieldset>
              <div className="form-grid">
                {Object.entries(planLimits).map(([limit, value]) => <label key={limit}>{limit.replaceAll(/([A-Z])/g, ' $1')} limit (-1 unlimited)<input type="number" min={-1} value={value} onChange={(event) => setPlanLimits((current) => ({ ...current, [limit]: event.target.value }))} /></label>)}
              </div>
              <div className="row-actions"><button className="button button-primary" disabled={working || !online}>{editingPlanId ? 'Save plan changes' : 'Create plan'}</button>{editingPlanId && <button type="button" className="button button-secondary" onClick={cancelPlanEdit}>Cancel editing</button>}</div>
              </form>
            </details>
            {loading ? <LoadingState /> : billingPlans.length ? <div className="table-wrap"><table><thead><tr><th>Plan</th><th>Monthly</th><th>Yearly</th><th>Trial</th><th>Subscriptions</th><th>Default</th><th>Actions</th></tr></thead><tbody>
              {billingPlans.map((plan) => <tr key={plan.id}><td><strong>{plan.name}</strong><small className="table-note">{plan.active ? 'Active' : 'Inactive'}{plan.description ? ` · ${plan.description}` : ''}</small></td><td>{money(plan.monthlyPrice)}</td><td>{money(plan.yearlyPrice)}</td><td>{plan.trialDays} days</td><td>{plan._count?.subscriptions ?? 0}</td><td>{plan.isDefault ? 'Yes' : 'No'}</td><td><div className="row-actions"><button className="button button-secondary" disabled={working || !online} onClick={() => editPlan(plan)}>Edit</button><button className="button button-secondary" disabled={working || !online || plan.isDefault || !plan.active} onClick={() => void togglePlan(plan, { isDefault: true })}>Make default</button><button className={plan.active ? 'button button-danger-quiet' : 'button button-primary'} disabled={working || !online || (plan.active && plan.isDefault)} title={plan.active && plan.isDefault ? 'Select another default plan first' : undefined} onClick={() => void togglePlan(plan, { active: !plan.active })}>{plan.active ? 'Deactivate' : 'Activate'}</button></div></td></tr>)}
            </tbody></table></div> : <EmptyState title="No plans configured" />}
          </section>
        )}
        {platformView === 'paymentQueue' && grants.has('platform:payments:review') && (
          <section className="content-stack">
            <div className="section-heading"><div><p className="eyebrow">Manual reconciliation</p><h2>Subscription payment review</h2><p className="muted">Verify transfer details independently. Shop submissions do not activate a plan.</p></div></div>
            <form className="billing-filter-bar" onSubmit={(event) => void searchSubscriptionPayments(event)}>
              <div className="billing-filter-search">
                <label className="visually-hidden" htmlFor="billing-payment-search">Search transaction reference, sender or business</label>
                <input id="billing-payment-search" value={billingPaymentSearch} onChange={(event) => setBillingPaymentSearch(event.target.value)} placeholder="Business, transaction reference or sender" maxLength={120} />
              </div>
              <div className="billing-filter-status">
                <label className="visually-hidden" htmlFor="billing-payment-filter">Filter payment status</label>
                <select id="billing-payment-filter" value={billingPaymentFilter} onChange={(event) => setBillingPaymentFilter(event.target.value)}>
                  <option value="REVIEW">Needs review</option><option value="ALL">All statuses</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="UNDER_REVIEW">Under review</option><option value="PENDING">Pending</option>
                </select>
                <button className="button button-secondary" type="submit" disabled={working || !online}>Search</button>
              </div>
            </form>
            {loading ? <LoadingState /> : billingPayments.length ? <div className="table-wrap"><table><thead><tr><th>Business / plan</th><th>Amount</th><th>Method / date</th><th>Reference / sender</th><th>Review</th></tr></thead><tbody>
              {billingPayments.map((payment) => <tr key={payment.id}><td><strong>{payment.business?.name}</strong><small className="table-note">{payment.plan.name}</small></td><td><strong>{money(payment.amount)}</strong></td><td>{payment.method}<small className="table-note">{payment.paymentDate.slice(0, 10)}</small></td><td>{payment.transactionReference}<small className="table-note">Sender: {payment.senderName}</small></td><td><StatusPill status={payment.status} />{payment.status === 'PENDING' || payment.status === 'UNDER_REVIEW' ? canApprovePayments ? <div className="row-actions payment-review-actions">{payment.status === 'PENDING' && <button className="button button-secondary" disabled={working || !online} onClick={() => void reviewSubscriptionPayment(payment, 'UNDER_REVIEW')}>Mark reviewing</button>}<button className="button button-primary" disabled={working || !online} onClick={() => void reviewSubscriptionPayment(payment, 'APPROVE')}>Approve</button>{rejectingSubscriptionPaymentId === payment.id ? <div className="reject-payment-form"><label className="visually-hidden" htmlFor={`reject-${payment.id}`}>Rejection reason</label><input id={`reject-${payment.id}`} placeholder="Reason required (5+ characters)" value={rejectionReasons[payment.id] ?? ''} onChange={(event) => setRejectionReasons((current) => ({ ...current, [payment.id]: event.target.value }))} maxLength={1000} /><button className="button button-danger-quiet" disabled={working || !online || (rejectionReasons[payment.id]?.trim().length ?? 0) < 5} onClick={() => void reviewSubscriptionPayment(payment, 'REJECT')}>Confirm reject</button><button className="button button-quiet" onClick={() => setRejectingSubscriptionPaymentId(null)}>Cancel</button></div> : <button className="button button-danger-quiet" disabled={working || !online} onClick={() => setRejectingSubscriptionPaymentId(payment.id)}>Reject</button>}</div> : <small className="table-note">Super Admin review required</small> : null}</td></tr>)}
            </tbody></table></div> : <EmptyState title="No payments awaiting review" detail="Payment submissions will appear here after shop owners submit their transaction details." />}
            {billingPaymentCursor && <button className="button button-secondary" disabled={loading || working || !online} onClick={() => void searchSubscriptionPayments(undefined, true)}>Load more payments</button>}
          </section>
        )}
        {platformView === 'billingSettings' && grants.has('platform:billing:settings') && (
          <section className="content-stack">
            <div className="section-heading"><div><p className="eyebrow">Platform configuration</p><h2>Billing settings</h2><p className="muted">Configure manual payment instructions, grace period, reminder schedule and support details.</p></div></div>
            {loading ? <LoadingState /> : billingSettings ? <form className="panel form-panel" onSubmit={saveBillingSettings}>
              <div className="form-grid">
                <label className="span-all">Payment methods (comma-separated)<input value={billingSettings.paymentMethods.join(', ')} onChange={(event) => setBillingSettings({ ...billingSettings, paymentMethods: [...new Set(event.target.value.split(',').map((method) => method.trim()).filter(Boolean))] })} required /></label>
                <label className="span-all">Payment account details and instructions<textarea rows={5} maxLength={4000} value={billingSettings.paymentInstructions} onChange={(event) => setBillingSettings({ ...billingSettings, paymentInstructions: event.target.value })} /></label>
                <label>Grace period (days)<input type="number" min={0} max={90} value={billingSettings.gracePeriodDays} onChange={(event) => setBillingSettings({ ...billingSettings, gracePeriodDays: Number(event.target.value) })} /></label>
                <label>Expiry reminder days<input value={billingSettings.expiryReminderDays.join(', ')} onChange={(event) => setBillingSettings({ ...billingSettings, expiryReminderDays: event.target.value.split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value >= 0) })} /></label>
                <label>Support contact<input maxLength={200} value={billingSettings.supportContact} onChange={(event) => setBillingSettings({ ...billingSettings, supportContact: event.target.value })} /></label>
                <label className="checkbox-row"><input type="checkbox" checked={billingSettings.enforcementEnabled} onChange={(event) => setBillingSettings({ ...billingSettings, enforcementEnabled: event.target.checked })} /> Enforce subscription access after grace period</label>
              </div>
              <p className="fine-print">Expiry enforcement restricts paid mutations only. Shops retain login, read access to their business data, billing and support.</p>
              <button className="button button-primary" disabled={working || !online}>Save billing settings</button>
            </form> : <EmptyState title="Billing settings unavailable" />}
          </section>
        )}
        {platformView === 'reports' && grants.has('platform:reports:read') && (
          <section className="content-stack">
            <div className="section-heading"><div><p className="eyebrow">Finance & reconciliation</p><h2>Subscription reports</h2><p className="muted">Export submitted, approved and rejected manual-payment records for the selected payment-date range.</p></div></div>
            <form className="panel report-filter-bar" onSubmit={(event) => { event.preventDefault(); void downloadSubscriptionReport(); }}>
              <div className="report-date-fields">
                <label>From<input type="date" value={reportFrom} max={reportTo} onChange={(event) => setReportFrom(event.target.value)} required /></label>
                <label>To<input type="date" value={reportTo} min={reportFrom} onChange={(event) => setReportTo(event.target.value)} required /></label>
              </div>
              <div className="report-filter-action"><p className="fine-print">Includes payment-date status and reconciliation references.</p><button className="button button-primary" disabled={working || !online}>{working ? 'Preparing report…' : 'Download CSV'}</button></div>
              <p className="report-disclaimer fine-print">Recorded refunds and adjustments are audit events and are not represented as external transfers.</p>
            </form>
          </section>
        )}
        {platformView === 'audit' && grants.has('platform:audit:read') && (
          <section className="content-stack"><div><h2>Platform audit history</h2><p className="muted">Privileged actions are recorded with actor, entity, timestamp and request ID.</p></div>
            {loading ? <LoadingState /> : platformAudit.length ? <div className="table-wrap"><table><thead><tr><th>Action</th><th>Actor</th><th>Entity</th><th>Time (Karachi)</th><th>Request ID</th></tr></thead><tbody>
              {platformAudit.map((event) => <tr key={event.id}><td><strong>{event.action}</strong></td><td>{event.actor?.name ?? 'System'}</td><td>{event.entityType}</td><td>{karachiDate(event.createdAt)}</td><td>{event.requestId}</td></tr>)}
            </tbody></table></div> : <EmptyState title="No audit events" />}</section>
        )}
        {platformView === 'health' && grants.has('platform:system:health') && (
          <section className="content-stack"><div><h2>System health</h2><p className="muted">Readiness check for the API's PostgreSQL connection.</p></div>
            {loading ? <LoadingState /> : platformHealth ? <section className="panel health-card"><span className="connection-dot is-online" /><div><h3>{platformHealth.status}</h3><p className="muted">Database: {platformHealth.database} · Checked {karachiDate(platformHealth.checkedAt)}</p></div></section> : <EmptyState title="Health status unavailable" />}
          </section>
        )}
        {ownerBusinessId && (
          <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOwnerBusinessId(''); }}>
            <form className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="owner-title" onSubmit={assignOwner}>
              <button type="button" className="dialog-close" aria-label="Close" onClick={() => setOwnerBusinessId('')}>×</button>
              <p className="eyebrow">Business onboarding</p><h2 id="owner-title">Assign a business owner</h2>
              <p className="muted">Existing accounts keep their current password. New accounts use an initial password that must be shared securely.</p>
              <label>Name<input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} required /></label>
              <label>Email<input type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} required /></label>
              <label>Initial password (ignored for existing account)<input type="password" minLength={16} maxLength={72} value={ownerPassword} onChange={(event) => setOwnerPassword(event.target.value)} required /></label>
              <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setOwnerBusinessId('')}>Cancel</button><button className="button button-primary" disabled={working || !online}>{working ? 'Assigning…' : 'Assign owner'}</button></div>
            </form>
          </div>
        )}
          </section>
        </div>
      </main>
    );
  }

  const permissions = new Set(currentUser?.context.permissions ?? []);
  const term = (key: string, fallback: string) => businessConfiguration?.terminology[key] ?? fallback;
  const catalogFields = businessConfiguration?.fields.filter((field) =>
    field.module === 'catalog' && ['item', 'catalog-item'].includes(field.screen)) ?? [];
  const moduleEnabled = (module: string | undefined) =>
    !module || !businessConfiguration || businessConfiguration.enabledModules.includes(module);
  const widgetEnabled = (widget: string) =>
    !businessConfiguration || businessConfiguration.dashboardWidgets.includes(widget);
  const visibleNavigation = navigation
    .filter((item) => (!item.permission || permissions.has(item.permission)) && moduleEnabled(item.module))
    .map((item) => ({
      ...item,
      label: item.view === 'orders' ? term('orders', item.label)
        : item.view === 'catalog' ? term('items', item.label)
        : item.view === 'customers' ? term('customers', item.label)
          : item.view === 'measurements' ? term('measurements', item.label)
            : item.view === 'payments' ? term('payments', item.label) : item.label,
    }));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand-lockup" href="#" onClick={(event) => { event.preventDefault(); setView('dashboard'); }}>
          <span className="brand-mark" aria-hidden="true">T</span>
          <span><strong>TailorApp</strong><small>Workroom desk</small></span>
        </a>
        <div className="shop-switcher">
          <span className="shop-avatar" aria-hidden="true">{(businessConfiguration?.business.name ?? currentUser?.context.business?.name ?? 'S').slice(0, 1)}</span>
          <span><strong>{businessConfiguration?.business.name ?? currentUser?.context.business?.name ?? 'Business'}</strong><small>{businessConfiguration?.template.name ?? 'Business workspace'}</small></span>
        </div>
        <nav aria-label="Main navigation" className="main-nav">
          {visibleNavigation.map((item) => (
            <button key={item.view} className={view === item.view ? 'nav-item active' : 'nav-item'} onClick={() => { setView(item.view); setError(null); }}>
              <span className="nav-icon"><Icon name={item.view} /></span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className={online ? 'connection-dot is-online' : 'connection-dot'} aria-hidden="true" />
          <span>{online ? 'Online' : 'Offline — changes need a connection'}</span>
        </div>
      </aside>
      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">{currentUser?.context.business?.name}</p>
            <h1>{navigation.find((item) => item.view === view)?.label ?? 'Overview'}</h1>
          </div>
          <div className="user-menu">
            <span className="user-avatar" aria-hidden="true">{currentUser?.user.name.slice(0, 1).toUpperCase()}</span>
            <span className="user-name">{currentUser?.user.name}</span>
            <button className="button button-quiet" onClick={() => void signOut()}><Icon name="signOut" /> Sign out</button>
          </div>
        </header>

        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice(null)}>×</button></div>}
        {!online && <div className="offline-banner" role="status">You are offline. This web workspace is read-only until the connection returns.</div>}

        {view === 'dashboard' && (
          <section aria-label="Business overview">
            {loading && !dashboard ? <LoadingState /> : dashboard ? (
              <>
                <div className="metric-grid">
                  {widgetEnabled('newOrders') && <MetricCard label={`New ${term('orders', 'orders').toLowerCase()} today`} value={String(dashboard.newOrders)} icon="plus" />}
                  {widgetEnabled('dueToday') && <MetricCard label="Due today" value={String(dashboard.dueToday)} icon="clock" tone="amber" />}
                  {widgetEnabled('inProgress') && <MetricCard label="In progress" value={String(dashboard.inProgress)} icon="progress" tone="blue" />}
                  {widgetEnabled('overdue') && <MetricCard label="Overdue" value={String(dashboard.overdue)} icon="warning" tone="rose" />}
                  {widgetEnabled('outstanding') && permissions.has('payments:read') && <MetricCard label="Outstanding" value={money(dashboard.outstanding, businessConfiguration?.business.currency)} icon="payments" tone="violet" />}
                  {widgetEnabled('collectedToday') && permissions.has('payments:read') && <MetricCard label="Collected today" value={money(dashboard.collectedToday, businessConfiguration?.business.currency)} icon="trendUp" tone="green" />}
                </div>
                {businessConfiguration?.template.key === 'tailor' && <section className="panel dashboard-note">
                  <div>
                    <p className="eyebrow">Today at a glance</p>
                    <h2>{dashboard.alterations} open alteration{dashboard.alterations === 1 ? '' : 's'}</h2>
                    <p className="muted">Dashboard figures use the shop's Asia/Karachi business day.</p>
                  </div>
                  <button className="button button-primary" onClick={() => setView('orders')} disabled={!permissions.has('orders:read')}>View orders</button>
                </section>}
              </>
            ) : <EmptyState title="Dashboard unavailable" action="Refresh" onAction={() => void reloadCurrent()} />}
          </section>
        )}

        {view === 'customers' && (
          <section className="content-stack">
            <div className="section-heading">
              <div><h2>{term('customers', 'Customers')}</h2><p className="muted">Search by name or phone number.</p></div>
              <form className="search-form" onSubmit={(event) => { event.preventDefault(); void reloadCurrent(); }}>
                <label className="visually-hidden" htmlFor="customer-search">Search customers</label>
                <input id="customer-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or phone" />
                <button className="button button-secondary" type="submit">Search</button>
              </form>
            </div>
            {permissions.has('customers:write') && (
              <form className="panel form-panel" onSubmit={addCustomer}>
                <div className="panel-heading"><h3>Add {term('customer', 'customer').toLowerCase()}</h3><p className="muted">The shop checks for an existing phone number before saving.</p></div>
                <div className="form-grid">
                  <label>Name<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={120} required /></label>
                  <label>Phone<input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="03xx xxx xxxx or +92…" maxLength={24} required /></label>
                  <label className="span-all">Notes<textarea value={customerNotes} onChange={(event) => setCustomerNotes(event.target.value)} rows={2} maxLength={2000} /></label>
                  {customerFields.map((field) => (
                    <DynamicFieldControl
                      key={field.id}
                      field={field}
                      value={customerCustomFields[field.key] ?? field.defaultValue}
                      onChange={(value) => setCustomerCustomFields((current) => ({ ...current, [field.key]: value }))}
                    />
                  ))}
                </div>
                <button className="button button-primary" type="submit" disabled={working || !online}>{working ? 'Saving…' : 'Save customer'}</button>
              </form>
            )}
            {loading ? <LoadingState /> : customers.length ? (
              <div className="table-wrap">
                <table><thead><tr><th>Customer</th><th>Phone</th><th>WhatsApp consent</th><th>Added</th></tr></thead>
                  <tbody>{customers.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <strong>{customer.name}</strong>
                        {customer.notes && <small className="table-note">{customer.notes}</small>}
                        {Object.entries(customer.customFields ?? {}).map(([key, value]) => (
                          <small className="table-note" key={key}>
                            {businessConfiguration?.fields.find((field) => field.key === key)?.label ?? key}: {displayFieldValue(value)}
                          </small>
                        ))}
                      </td>
                      <td>{customer.phone}</td>
                      <td>
                        <span className="notification-pill">{customer.whatsappConsent && !customer.whatsappOptedOutAt ? 'Opted in' : 'Not opted in'}</span>
                        {permissions.has('customers:write') && (
                          <button
                            className="button button-quiet"
                            disabled={working || !online}
                            aria-label={`${customer.whatsappConsent ? 'Opt out' : 'Record consent'} for ${customer.name}`}
                            onClick={() => void toggleWhatsAppConsent(customer)}
                          >{customer.whatsappConsent ? 'Opt out' : 'Record consent'}</button>
                        )}
                      </td>
                      <td>{karachiDate(customer.createdAt)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <EmptyState title="No customers yet" detail="Add a customer above or try a broader search." />}
          </section>
        )}

        {view === 'catalog' && (
          <section className="content-stack">
            <div className="section-heading">
              <div><h2>{term('items', 'Catalog')}</h2><p className="muted">Manage reusable items and services for this business.</p></div>
              <form className="search-form" onSubmit={(event) => { event.preventDefault(); void reloadCurrent(); }}>
                <label className="visually-hidden" htmlFor="catalog-search">Search catalog</label>
                <input id="catalog-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or SKU" />
                <button className="button button-secondary" type="submit">Search</button>
              </form>
            </div>
            {permissions.has('settings:manage') && (
              <form className="panel form-panel" onSubmit={addCatalogItem}>
                <div className="panel-heading"><h3>{editingCatalogItemId ? 'Edit' : 'Add'} {term('item', 'item').toLowerCase()}</h3><p className="muted">Item types and additional fields come from the active business template.</p></div>
                <div className="form-grid">
                  <label>Type<select
                    value={catalogTypeKey || businessConfiguration?.itemTypes[0]?.key || ''}
                    onChange={(event) => { setCatalogTypeKey(event.target.value); setCatalogCustomFields({}); }}
                    required
                  >
                    {businessConfiguration?.itemTypes.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
                  </select></label>
                  <label>Name<input value={catalogName} onChange={(event) => setCatalogName(event.target.value)} maxLength={160} required /></label>
                  <label className="span-all">Description<textarea rows={2} value={catalogDescription} onChange={(event) => setCatalogDescription(event.target.value)} maxLength={2000} /></label>
                  <label>Code / SKU<input value={catalogSku} onChange={(event) => setCatalogSku(event.target.value)} maxLength={80} /></label>
                  <label>Unit<input value={catalogUnit} onChange={(event) => setCatalogUnit(event.target.value)} maxLength={40} required /></label>
                  <label>Unit price ({businessConfiguration?.business.currency ?? 'PKR'})<input type="number" min="0" step="0.01" value={catalogUnitPrice} onChange={(event) => setCatalogUnitPrice(event.target.value)} /></label>
                  {catalogFields.filter((field) => isVisibleForItemType(field, catalogTypeKey || businessConfiguration?.itemTypes[0]?.key)).map((field) => (
                    <DynamicFieldControl
                      key={field.id}
                      field={field}
                      value={catalogCustomFields[field.key] ?? field.defaultValue}
                      onChange={(value) => setCatalogCustomFields((current) => ({ ...current, [field.key]: value }))}
                    />
                  ))}
                </div>
                <button className="button button-primary" disabled={working || !online}>{working ? 'Saving…' : editingCatalogItemId ? 'Update catalog item' : 'Save catalog item'}</button>
                {editingCatalogItemId && <button className="button button-secondary" type="button" onClick={() => { setEditingCatalogItemId(null); setCatalogName(''); setCatalogDescription(''); setCatalogSku(''); setCatalogUnitPrice(''); setCatalogCustomFields({}); }}>Cancel edit</button>}
              </form>
            )}
            {loading ? <LoadingState /> : catalogItems.length ? (
              <div className="table-wrap">
                <table><thead><tr><th>{term('item', 'Item')}</th><th>Type</th><th>Code</th><th>Unit price</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>{catalogItems.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.name}</strong>{Object.entries(item.customFields).map(([key, value]) => (
                        <small className="table-note" key={key}>{catalogFields.find((field) => field.key === key)?.label ?? key}: {displayFieldValue(value)}</small>
                      ))}</td>
                      <td>{businessConfiguration?.itemTypes.find((type) => type.key === item.typeKey)?.label ?? item.typeKey}</td>
                      <td>{item.sku ?? '—'}</td>
                      <td>{item.unitPrice ? `${money(item.unitPrice, businessConfiguration?.business.currency)} / ${item.unit}` : `— / ${item.unit}`}</td>
                      <td><span className="notification-pill">{item.active ? 'Active' : 'Inactive'}</span></td>
                      <td>{permissions.has('settings:manage') && <><button className="button button-quiet" disabled={working || !online} onClick={() => editCatalogItem(item)}>Edit</button><button className="button button-quiet" disabled={working || !online} onClick={() => void setCatalogItemActive(item, !item.active)}>{item.active ? 'Deactivate' : 'Activate'}</button></>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <EmptyState title={`No ${term('items', 'catalog items').toLowerCase()} yet`} detail="Create a catalog item or search with a different term." />}
          </section>
        )}

        {view === 'orders' && (
          <section className="content-stack">
            <div className="section-heading">
              <div><h2>{term('orders', 'Orders')}</h2><p className="muted">Follow each {term('item', 'item').toLowerCase()} through the configured workflow.</p></div>
              <form className="search-form" onSubmit={(event) => { event.preventDefault(); void reloadCurrent(); }}>
                <label className="visually-hidden" htmlFor="order-search">Search orders</label>
                <input id="order-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order number or customer" />
                <button className="button button-secondary" type="submit">Search</button>
              </form>
            </div>
            {businessConfiguration && (
              <section className="panel template-preview">
                <h3>Configured {term('order', 'Order').toLowerCase()} workflow</h3>
                <p className="fine-print">{businessConfiguration.workflow.stages.map((stage) => stage.label).join(' → ')}</p>
              </section>
            )}
            {permissions.has('orders:write') && (
              <form className="panel form-panel" onSubmit={addOrder}>
                <div className="panel-heading"><h3>Start a new order</h3><p className="muted">The server assigns the order number and calculates the total.</p></div>
                <div className="form-grid">
                  <label>Customer<select value={orderCustomerId} onChange={(event) => setOrderCustomerId(event.target.value)} required>
                    <option value="">Choose customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}
                  </select></label>
                  {configuredItemTypes.length > 1 ? (
                    <label>{term('item', 'Item')} type<select
                      value={selectedOrderItemType?.key ?? ''}
                      onChange={(event) => { setOrderItemTypeKey(event.target.value); setOrderCatalogItemId(''); setOrderItemCustomFields({}); }}
                      required
                    >
                      {configuredItemTypes.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
                    </select></label>
                  ) : null}
                  <label>{selectedOrderItemType?.label ?? term('item', 'Item')} name<input value={orderItemName} onChange={(event) => setOrderItemName(event.target.value)} maxLength={160} required /></label>
                  {catalogItems.some((item) => item.active && item.typeKey === (selectedOrderItemType?.key ?? businessConfiguration?.itemTypes[0]?.key)) && (
                    <label>Saved {selectedOrderItemType?.label.toLowerCase() ?? term('item', 'Item').toLowerCase()}<select
                      value={orderCatalogItemId}
                      onChange={(event) => {
                        const item = catalogItems.find((entry) => entry.id === event.target.value);
                        setOrderCatalogItemId(item?.id ?? '');
                        if (item) {
                          setOrderItemName(item.name);
                          if (item.unitPrice) setOrderPrice(item.unitPrice);
                        }
                      }}
                    >
                      <option value="">Enter a new item</option>
                      {catalogItems.filter((item) => item.active && item.typeKey === (selectedOrderItemType?.key ?? businessConfiguration?.itemTypes[0]?.key)).map((item) => (
                        <option key={item.id} value={item.id}>{item.name}{item.sku ? ` · ${item.sku}` : ''}</option>
                      ))}
                    </select></label>
                  )}
                  <label>Quantity<input type="number" min="1" max="100" value={orderQuantity} onChange={(event) => setOrderQuantity(event.target.value)} required /></label>
                  <label>Unit price ({businessConfiguration?.business.currency ?? 'PKR'})<input type="number" min="0.01" step="0.01" value={orderPrice} onChange={(event) => setOrderPrice(event.target.value)} required /></label>
                  <label>Due date<input type="datetime-local" value={orderDueAt} onChange={(event) => setOrderDueAt(event.target.value)} required /></label>
                  {moduleEnabled('measurements') && profiles.length > 0 && <label>{term('measurement', 'Measurement')} profile<select value={orderMeasurementId} onChange={(event) => setOrderMeasurementId(event.target.value)}>
                    <option value="">No saved profile</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.garmentTemplate.name}</option>)}
                  </select></label>}
                  {orderItemFields.map((field) => <DynamicFieldControl
                    key={field.id}
                    field={field}
                    value={orderItemCustomFields[field.key]}
                    onChange={(value) => setOrderItemCustomFields((current) => ({ ...current, [field.key]: value }))}
                  />)}
                  {orderFields.map((field) => <DynamicFieldControl
                    key={field.id}
                    field={field}
                    value={orderCustomFields[field.key]}
                    onChange={(value) => setOrderCustomFields((current) => ({ ...current, [field.key]: value }))}
                  />)}
                </div>
                <button className="button button-primary" type="submit" disabled={working || !online || !orderCustomerId}>{working ? 'Creating…' : 'Create order'}</button>
              </form>
            )}
            {loading ? <LoadingState /> : orders.length ? (
              <div className="order-list">
                {orders.map((order) => (
                  <article className="order-card" key={order.id}>
                    <div className="order-card-main">
                      <div className="order-heading"><span className="order-number">{order.orderNumber}</span><StatusPill status={order.currentWorkflowStage?.label ?? order.workflowStageKey ?? order.status} /></div>
                      <h3>{order.customer.name}</h3>
                      <p className="muted">{order.customer.phone} · Due {karachiDate(order.promisedAt)}</p>
                      <ul className="garment-list">{order.items.map((item) => (
                        <li key={item.id}>
                          {item.quantity} × {item.itemName ?? item.garmentName}
                          {Object.entries(item.customFields ?? {}).map(([key, value]) => (
                            <small className="table-note" key={key}>
                              {businessConfiguration?.fields.find((field) => field.key === key)?.label ?? key}: {displayFieldValue(value)}
                            </small>
                          ))}
                        </li>
                      ))}</ul>
                      {Object.entries(order.customFields ?? {}).map(([key, value]) => (
                        <p className="fine-print" key={key}>
                          {businessConfiguration?.fields.find((field) => field.key === key)?.label ?? key}: {displayFieldValue(value)}
                        </p>
                      ))}
                    </div>
                    <div className="order-card-side">
                      <span className="money-total">{money(order.total, businessConfiguration?.business.currency)}</span>
                      <span className="muted">{money(order.outstanding, businessConfiguration?.business.currency)} outstanding</span>
                      <div className="row-actions">
                        {permissions.has('orders:transition') && businessConfiguration?.workflow.transitions
                          .filter((transition) => transition.fromStageId === (order.workflowStageId
                            ?? businessConfiguration.workflow.stages.find((stage) =>
                              stage.key === (order.workflowStageKey ?? order.status))?.id))
                          .map((transition) => {
                            const stage = businessConfiguration.workflow.stages.find((item) => item.id === transition.toStageId);
                            return stage ? <button
                              className="button button-secondary"
                              key={transition.id}
                              disabled={working || !online}
                              onClick={() => void changeWorkflowStage(order, stage.key)}
                            >Move to {stage.label}</button> : null;
                          })}
                        {permissions.has('payments:write') && Number(order.outstanding) > 0 && (
                          <button className="button button-secondary" onClick={() => { setPaymentOrderId(order.id); setPaymentAmount(order.outstanding); }}>Record payment</button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : <EmptyState title="No orders found" detail="Create an order or adjust your search." />}
          </section>
        )}

        {view === 'measurements' && (
          <section className="content-stack">
            <div className="section-heading"><div><h2>Measurement book</h2><p className="muted">Each save creates a dated revision. Earlier measurements stay in history.</p></div></div>
            {permissions.has('measurements:write') && (
              <form className="panel form-panel" onSubmit={addMeasurement}>
                <div className="form-grid">
                  <label>Customer<select value={measurementCustomerId} onChange={(event) => setMeasurementCustomerId(event.target.value)} required>
                    {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                  </select></label>
                  <label>Measurement template<select value={measurementTemplateId} onChange={(event) => setMeasurementTemplateId(event.target.value)} required>
                    {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                  </select></label>
                  {selectedTemplate?.fields.map((field) => (
                    <label key={field.key}>{field.label} ({field.unit})
                      <input type={field.unit.toLowerCase() === 'text' ? 'text' : 'number'} step={field.unit.toLowerCase() === 'text' ? undefined : '0.1'} value={measurementValues[field.key] ?? ''} onChange={(event) => setMeasurementValues((current) => ({ ...current, [field.key]: event.target.value }))} required={field.required ?? false} />
                    </label>
                  ))}
                  <label className="span-all">Notes<textarea rows={2} value={measurementNotes} onChange={(event) => setMeasurementNotes(event.target.value)} maxLength={2000} /></label>
                </div>
                <button className="button button-primary" type="submit" disabled={working || !online || !measurementCustomerId || !selectedTemplate}>{working ? 'Saving…' : 'Save revision'}</button>
              </form>
            )}
            <div className="customer-picker">
              <label>View history for<select value={measurementCustomerId} onChange={(event) => setMeasurementCustomerId(event.target.value)}>
                <option value="">Choose customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select></label>
            </div>
            {profiles.map((profile) => (
              <section className="panel history-panel" key={profile.id}>
                <h3>{profile.garmentTemplate.name}</h3>
                {profile.revisions.map((revision) => (
                  <div className="revision-row" key={revision.id}>
                    <div><strong>Revision {revision.version}</strong><p className="muted">{karachiDate(revision.measuredAt)}{revision.notes ? ` · ${revision.notes}` : ''}</p></div>
                    <dl>{Object.entries(revision.values).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{String(value)}</dd></div>)}</dl>
                  </div>
                ))}
              </section>
            ))}
            {!loading && measurementCustomerId && profiles.length === 0 && <EmptyState title="No measurements saved" detail="Choose a template above and save the first revision." />}
            {loading && <LoadingState />}
          </section>
        )}

        {view === 'payments' && (
          <section className="content-stack">
            <div className="section-heading"><div><h2>Payment ledger</h2><p className="muted">Posted payments and corrections are permanent ledger entries.</p></div></div>
            {payments.length ? (
              <div className="table-wrap">
                <table><thead><tr><th>Receipt</th><th>Customer / order</th><th>Type</th><th>Method</th><th>Amount</th><th></th></tr></thead>
                  <tbody>{payments.map((payment) => (
                    <tr key={payment.id}>
                      <td><strong>{payment.receiptNumber}</strong><small className="table-note">{karachiDate(payment.createdAt)}</small></td>
                      <td>{payment.order.customer.name}<small className="table-note">{payment.order.orderNumber}</small></td>
                      <td>{payment.kind === 'REVERSAL' ? 'Correction' : 'Payment'}</td>
                      <td>{payment.method.toLowerCase()}</td>
                      <td className={payment.kind === 'REVERSAL' ? 'negative-money' : ''}>{payment.kind === 'REVERSAL' ? '−' : ''}{money(payment.amount)}</td>
                      <td><button className="button button-quiet" onClick={() => void showReceipt(payment.id)}>Receipt</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <EmptyState title="No payments recorded" detail="Payments will appear here when an advance or partial payment is posted." />}
          </section>
        )}

        {view === 'notifications' && (
          <section className="content-stack">
            <div className="section-heading"><div><h2>WhatsApp delivery history</h2><p className="muted">Sent means accepted by Meta; Delivered and Read are confirmed by verified delivery webhooks.</p></div></div>
            {notifications.length ? (
              <div className="table-wrap">
                <table><thead><tr><th>Created</th><th>Customer number</th><th>Event</th><th>Status</th><th>Details</th></tr></thead>
                  <tbody>{notifications.map((notification) => (
                    <tr key={notification.id}>
                      <td>{karachiDate(notification.createdAt)}</td>
                      <td>{notification.recipientPhone || 'Invalid number'}</td>
                      <td>{notification.kind.replaceAll('_', ' ').toLowerCase()}</td>
                      <td><NotificationPill status={notification.status} /></td>
                      <td>
                        {notification.renderedMessage && <small className="table-note">{notification.renderedMessage}</small>}
                        {notification.lastError ?? (notification.readAt ? `Read ${karachiDate(notification.readAt)}` : notification.deliveredAt ? `Delivered ${karachiDate(notification.deliveredAt)}` : notification.sentAt ? `Sent ${karachiDate(notification.sentAt)}` : `Attempts: ${notification.attemptCount}`)}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <EmptyState title="No WhatsApp notifications yet" detail="Order, payment and pickup notifications appear here after their changes commit." />}
          </section>
        )}
        {view === 'configuration' && permissions.has('settings:manage') && (
          <section className="content-stack">
            <div className="section-heading"><div><p className="eyebrow">Business builder</p><h2>Business settings</h2><p className="muted">Customize your workspace appearance, terminology, enabled modules, payment methods, and dashboard without changing your business data.</p></div></div>
            {businessConfigurationDraft ? (
              <>
                <form className="panel form-panel" onSubmit={saveBusinessConfiguration}>
                  <div className="form-grid">
                    <label>Business name<input value={businessConfigurationDraft.business.name} onChange={(event) => setBusinessConfigurationDraft({ ...businessConfigurationDraft, business: { ...businessConfigurationDraft.business, name: event.target.value } })} maxLength={160} required /></label>
                    <label>Logo URL<input type="url" value={businessConfigurationDraft.business.logoUrl ?? ''} onChange={(event) => setBusinessConfigurationDraft({ ...businessConfigurationDraft, business: { ...businessConfigurationDraft.business, logoUrl: event.target.value || null } })} placeholder="https://…" /></label>
                    <label>Currency<input value={businessConfigurationDraft.business.currency} onChange={(event) => setBusinessConfigurationDraft({ ...businessConfigurationDraft, business: { ...businessConfigurationDraft.business, currency: event.target.value.toUpperCase() } })} pattern="[A-Z]{3}" maxLength={3} required /></label>
                    <label>Timezone<input value={businessConfigurationDraft.business.timezone} onChange={(event) => setBusinessConfigurationDraft({ ...businessConfigurationDraft, business: { ...businessConfigurationDraft.business, timezone: event.target.value } })} maxLength={100} required /></label>
                    <label>Business contact / WhatsApp phone<input
                      type="tel"
                      value={businessConfigurationDraft.contactPhone ?? ''}
                      onChange={(event) => setBusinessConfigurationDraft({
                        ...businessConfigurationDraft,
                        contactPhone: event.target.value || null,
                      })}
                      pattern="[+]?[0-9][0-9 ().-]{5,31}"
                      maxLength={32}
                      placeholder="+923001234567"
                      aria-describedby="business-contact-phone-help"
                    /><small id="business-contact-phone-help" className="fine-print">Subscription reminders use this configured number; the app will not guess a phone from a user account.</small></label>
                  </div>
                  <h3>Enabled modules</h3>
                  <div className="configuration-options">
                    {businessConfigurationDraft.availableModules.map((module) => (
                      <label className="checkbox-row" key={module}>
                        <input type="checkbox" checked={businessConfigurationDraft.enabledModules.includes(module)} onChange={(event) => setBusinessConfigurationDraft({
                          ...businessConfigurationDraft,
                          enabledModules: event.target.checked
                            ? [...businessConfigurationDraft.enabledModules, module]
                            : businessConfigurationDraft.enabledModules.filter((value) => value !== module),
                        })} />
                        {module}
                      </label>
                    ))}
                  </div>
                  <h3>Terminology</h3>
                  <div className="form-grid">
                    {Object.entries(businessConfigurationDraft.terminology).map(([key, label]) => (
                      <label key={key}>{key.replaceAll('_', ' ')}<input value={label} onChange={(event) => setBusinessConfigurationDraft({
                        ...businessConfigurationDraft,
                        terminology: { ...businessConfigurationDraft.terminology, [key]: event.target.value },
                      })} maxLength={120} required /></label>
                    ))}
                  </div>
                  <h3>Payment methods</h3>
                  <div className="configuration-options">
                    {businessConfigurationDraft.availablePaymentMethods.map((method) => (
                      <label className="checkbox-row" key={method}>
                        <input type="checkbox" checked={businessConfigurationDraft.paymentMethods.includes(method)} disabled={businessConfigurationDraft.paymentMethods.length === 1 && businessConfigurationDraft.paymentMethods.includes(method)} onChange={(event) => setBusinessConfigurationDraft({
                          ...businessConfigurationDraft,
                          paymentMethods: event.target.checked
                            ? [...businessConfigurationDraft.paymentMethods, method]
                            : businessConfigurationDraft.paymentMethods.filter((value) => value !== method),
                        })} />
                        {method}
                      </label>
                    ))}
                  </div>
                  <h3>Dashboard widgets</h3>
                  <div className="configuration-options">
                    {businessConfigurationDraft.availableDashboardWidgets.map((widget) => (
                      <label className="checkbox-row" key={widget}>
                        <input type="checkbox" checked={businessConfigurationDraft.dashboardWidgets.includes(widget)} onChange={(event) => setBusinessConfigurationDraft({
                          ...businessConfigurationDraft,
                          dashboardWidgets: event.target.checked
                            ? [...businessConfigurationDraft.dashboardWidgets, widget]
                            : businessConfigurationDraft.dashboardWidgets.filter((value) => value !== widget),
                        })} />
                        {widget}
                      </label>
                    ))}
                  </div>
                  <h3>Item and service types</h3>
                  <p className="muted">These types control catalog entries, order items, and type-specific custom fields for this business.</p>
                  <div className="content-stack">
                    {businessConfigurationDraft.itemTypes.map((itemType, index) => (
                      <div className="form-grid business-item-type-row" key={`${itemType.key}-${index}`}>
                        <label>Type key<input
                          value={itemType.key}
                          pattern="[a-z][a-z0-9_-]{0,79}"
                          maxLength={80}
                          onChange={(event) => setBusinessConfigurationDraft({
                            ...businessConfigurationDraft,
                            itemTypes: businessConfigurationDraft.itemTypes.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, key: event.target.value } : item),
                          })}
                          required
                        /></label>
                        <label>Label<input
                          value={itemType.label}
                          maxLength={120}
                          onChange={(event) => setBusinessConfigurationDraft({
                            ...businessConfigurationDraft,
                            itemTypes: businessConfigurationDraft.itemTypes.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, label: event.target.value } : item),
                          })}
                          required
                        /></label>
                        <button className="button button-quiet" type="button" disabled={businessConfigurationDraft.itemTypes.length <= 1} onClick={() => setBusinessConfigurationDraft({
                          ...businessConfigurationDraft,
                          itemTypes: businessConfigurationDraft.itemTypes.filter((_, itemIndex) => itemIndex !== index),
                        })}>Remove type</button>
                      </div>
                    ))}
                    <button className="button button-secondary" type="button" onClick={() => setBusinessConfigurationDraft({
                      ...businessConfigurationDraft,
                      itemTypes: [...businessConfigurationDraft.itemTypes, { key: '', label: '' }],
                    })}>Add item or service type</button>
                  </div>
                  <h3>Notification templates</h3>
                  <p className="muted">Configure event bodies, approved WhatsApp template names, and recipientPolicy (CUSTOMER or BUSINESS_CONTACT). Variable order must match the approved Meta template. Variables include business.*, recipient.*, customer.*, order.*, item.name, subscription.*, event.*, and custom.field_key.</p>
                  <label>Event templates (JSON)<textarea rows={10} spellCheck={false} value={notificationTemplateJson} onChange={(event) => setNotificationTemplateJson(event.target.value)} /></label>
                  <div className="platform-form-footer"><p className="fine-print">Version {businessConfigurationDraft.version}. Saving publishes an audited configuration for this business only.</p><button className="button button-primary" disabled={working || !online}>{working ? 'Publishing…' : 'Publish settings'}</button></div>
                </form>
                <form className="content-stack" onSubmit={saveBusinessStructure}>
                  <BusinessStructureEditors
                    fields={structureFields}
                    itemTypes={businessConfigurationDraft.itemTypes}
                    inheritedFields={businessConfigurationDraft.fields.filter((field) =>
                      field.businessId !== businessConfigurationDraft.business.id
                      && !structureFields.some((draft) => draft.key === field.key))}
                    availableModules={businessConfigurationDraft.enabledModules}
                    workflowEnabled={businessConfigurationDraft.availableModules.includes('orders')
                      && businessConfigurationDraft.enabledModules.includes('orders')}
                    stages={structureStages}
                    transitions={structureTransitions}
                    onFieldsChange={setStructureFields}
                    onWorkflowChange={(stages, transitions) => {
                      setStructureStages(stages);
                      setStructureTransitions(transitions);
                    }}
                  />
                  <div className="panel form-panel platform-form-footer">
                    <p className="fine-print">
                      Configuration version {businessConfigurationDraft.configurationVersion} · template version {businessConfigurationDraft.templateVersion}.
                      {businessConfigurationDraft.workflowIsTenantScoped ? ' This business has its own workflow.' : ' Workflow currently inherits from its template.'}
                    </p>
                    <button className="button button-primary" disabled={working || !online}>
                      {working ? 'Publishing…' : 'Publish fields and workflow'}
                    </button>
                  </div>
                </form>
                <section className="panel">
                  <h3>Current template preview</h3>
                  <p className="muted">{businessConfigurationDraft.template.name} · {businessConfigurationDraft.template.category}</p>
                  <p className="fine-print">Item types: {businessConfigurationDraft.itemTypes.map((item) => item.label).join(', ')}</p>
                  <p className="fine-print">Configured fields: {businessConfigurationDraft.fields.length}</p>
                  <p className="fine-print">Workflow: {businessConfigurationDraft.workflow.stages.map((stage) => stage.label).join(' → ')}</p>
                  <p className="fine-print">Allowed transitions: {businessConfigurationDraft.workflow.transitions.length}</p>
                </section>
                <BusinessTeamAdmin
                  canManage={currentUser?.context.permissions.includes('staff:manage') ?? false}
                  actorPermissions={currentUser?.context.permissions ?? []}
                  online={online}
                  withSession={withSession}
                />
                <section className="panel form-panel configuration-history" aria-labelledby="configuration-history-title">
                  <div className="section-heading">
                    <div>
                      <h3 id="configuration-history-title">Configuration history</h3>
                      <p className="muted">Read-only snapshots of published business settings, fields, and workflows.</p>
                    </div>
                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={loadingBusinessConfigurationHistory || !online}
                      onClick={() => void loadBusinessConfigurationHistory()}
                    >
                      {loadingBusinessConfigurationHistory ? 'Loading…' : 'Refresh history'}
                    </button>
                  </div>
                  {businessConfigurationHistory.length ? (
                    <div className="configuration-history-list">
                      {businessConfigurationHistory.map((entry) => (
                        <details className="configuration-history-entry" key={entry.id}>
                          <summary>
                            <span>
                              <strong>{entry.version === null ? 'Configuration update' : `Version ${entry.version}`}</strong>
                              <small className="table-note">
                                {new Date(entry.createdAt).toLocaleString()} · {entry.actorName}
                                {entry.templateVersion === null ? '' : ` · Template version ${entry.templateVersion}`}
                              </small>
                            </span>
                          </summary>
                          {entry.snapshot === null
                            ? <p className="muted">This historical event did not include a configuration snapshot.</p>
                            : <pre className="template-revision-snapshot">{JSON.stringify(entry.snapshot, null, 2)}</pre>}
                        </details>
                      ))}
                    </div>
                  ) : !loadingBusinessConfigurationHistory ? (
                    <p className="muted">Load history to review previously published configuration snapshots.</p>
                  ) : null}
                  {businessConfigurationHistoryCursor && (
                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={loadingBusinessConfigurationHistory || !online}
                      onClick={() => void loadBusinessConfigurationHistory(true)}
                    >
                      Load more history
                    </button>
                  )}
                </section>
              </>
            ) : <LoadingState />}
          </section>
        )}
        {view === 'subscription' && (
          <section className="content-stack">
            <div className="section-heading"><div><p className="eyebrow">Shop account</p><h2>Subscription & billing</h2><p className="muted">View your plan, renewal date, account instructions and manual-payment history.</p></div></div>
            {loading && !shopSubscription ? <LoadingState /> : shopSubscription ? (
              <>
                <div className="shop-billing-summary">
                {shopSubscription.subscription ? <section className="panel shop-plan-card">
                  <div><p className="eyebrow">{shopSubscription.subscription.status.replaceAll('_', ' ')}</p><h3>{shopSubscription.subscription.plan.name}{shopSubscription.subscription.grandfathered ? ' · Legacy access' : shopSubscription.subscription.complimentary ? ' · Complimentary access' : ''}</h3><p className="muted">Valid {karachiDate(shopSubscription.subscription.startsAt)} through {karachiDate(shopSubscription.subscription.endsAt)} · {shopSubscription.subscription.cycle.toLowerCase()}</p>
                    {new Date(shopSubscription.subscription.graceUntil) < new Date() && <p className="alert alert-error">Your grace period has ended. Paid changes are restricted; billing, login and read access remain available.</p>}
                  </div>
                  <div className="plan-renewal"><span>Next renewal</span><strong>{karachiDate(shopSubscription.subscription.endsAt)}</strong></div>
                </section> : <section className="panel"><h3>No subscription assigned</h3><p className="muted">Contact platform support to select a plan. Existing business data remains available.</p></section>}
                <section className="panel payment-instructions">
                  <div><p className="eyebrow">Need to renew?</p><h3>Payment instructions</h3></div>
                  <p className="muted">{shopSubscription.paymentInstructions || 'Contact platform support for current payment account details.'}</p>
                  {shopSubscription.supportContact && <p className="support-contact">Support: {shopSubscription.supportContact}</p>}
                </section>
                </div>
                {permissions.has('subscriptions:manage') && shopSubscription.plans.length > 0 && (
                  <details className="panel disclosure-panel shop-payment-disclosure">
                    <summary><span><strong>Request or renew a plan</strong><small>Submit transfer details for secure admin review</small></span><span className="disclosure-action">Open form</span></summary>
                    <form className="form-panel disclosure-content" onSubmit={submitSubscriptionPayment}>
                    <div className="panel-heading"><p className="muted">Submitting details creates a pending review only. Access changes after an authorized admin confirms the payment.</p></div>
                    <div className="form-grid">
                      <label>Plan<select value={selectedSubscriptionPlanId} onChange={(event) => {
                        const planId = event.target.value;
                        setSelectedSubscriptionPlanId(planId);
                        const plan = shopSubscription.plans.find((item) => item.id === planId);
                        setSubscriptionPayment((current) => ({ ...current, amount: plan ? (subscriptionCycle === 'MONTHLY' ? plan.monthlyPrice : plan.yearlyPrice) : '' }));
                      }} required>{shopSubscription.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {money(subscriptionCycle === 'MONTHLY' ? plan.monthlyPrice : plan.yearlyPrice)}/{subscriptionCycle === 'MONTHLY' ? 'month' : 'year'}</option>)}</select></label>
                      <label>Billing cycle<select value={subscriptionCycle} onChange={(event) => {
                        const cycle = event.target.value as 'MONTHLY' | 'YEARLY';
                        setSubscriptionCycle(cycle);
                        const plan = shopSubscription.plans.find((item) => item.id === selectedSubscriptionPlanId);
                        setSubscriptionPayment((current) => ({ ...current, amount: plan ? (cycle === 'MONTHLY' ? plan.monthlyPrice : plan.yearlyPrice) : '' }));
                      }}><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select></label>
                      <label>Payment method<select value={subscriptionPayment.method} onChange={(event) => setSubscriptionPayment((current) => ({ ...current, method: event.target.value }))} required>{shopSubscription.paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></label>
                      <label>Amount (PKR)<input inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={subscriptionPayment.amount} onChange={(event) => setSubscriptionPayment((current) => ({ ...current, amount: event.target.value }))} required /></label>
                      <label>Transaction ID / reference<input value={subscriptionPayment.transactionReference} onChange={(event) => setSubscriptionPayment((current) => ({ ...current, transactionReference: event.target.value }))} minLength={3} maxLength={120} required /></label>
                      <label>Sender name<input value={subscriptionPayment.senderName} onChange={(event) => setSubscriptionPayment((current) => ({ ...current, senderName: event.target.value }))} minLength={2} maxLength={160} required /></label>
                      <label>Payment date<input type="date" value={subscriptionPayment.paymentDate} onChange={(event) => setSubscriptionPayment((current) => ({ ...current, paymentDate: event.target.value }))} required /></label>
                    </div>
                    {Number(subscriptionPayment.amount) <= 0 && <p className="fine-print">This is a free plan/trial. Choose a paid plan to submit a manual payment.</p>}
                    <button className="button button-primary" disabled={working || !online || !subscriptionPayment.method || Number(subscriptionPayment.amount) <= 0}>{working ? 'Submitting…' : 'Submit payment for review'}</button>
                    </form>
                  </details>
                )}
                <section className="content-stack">
                  <div className="section-heading"><div><h3>Payment history and invoices</h3><p className="muted">Your transfer submissions and approved receipts.</p></div><span className="history-count">{shopSubscription.payments.length} records</span></div>
                  {shopSubscription.payments.length ? <div className="table-wrap billing-history-table"><table><thead><tr><th>Submitted</th><th>Plan / cycle</th><th>Amount</th><th>Reference</th><th>Status</th><th>Receipt</th></tr></thead><tbody>
                    {shopSubscription.payments.map((payment) => <tr key={payment.id}><td>{karachiDate(payment.createdAt)}</td><td>{payment.plan.name}<small className="table-note">{payment.cycle.toLowerCase()} · {payment.method}</small></td><td><strong>{money(payment.amount)}</strong></td><td>{payment.transactionReference}<small className="table-note">Sender: {payment.senderName}</small></td><td><StatusPill status={payment.status} />{payment.invoiceNumber && <small className="table-note">Invoice {payment.invoiceNumber}</small>}{payment.rejectionReason && <small className="table-note">Reason: {payment.rejectionReason}</small>}</td><td>{payment.invoiceNumber && <button className="button button-quiet" disabled={working || !online} onClick={() => void downloadSubscriptionReceipt(payment.id)}>PDF</button>}</td></tr>)}
                  </tbody></table></div> : <EmptyState title="No subscription payment history" detail="Submitted plan payments will appear here for tracking." />}
                </section>
              </>
            ) : <EmptyState title="Subscription details unavailable" action="Refresh" onAction={() => void reloadCurrent()} />}
          </section>
        )}

        {loading && <span className="sync-note" role="status">Refreshing records…</span>}
      </main>

      {paymentOrderId && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaymentOrderId(''); }}>
          <form className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="payment-title" onSubmit={addPayment}>
            <button type="button" className="dialog-close" aria-label="Close" onClick={() => setPaymentOrderId('')}>×</button>
            <p className="eyebrow">Order payment</p><h2 id="payment-title">Record an advance or partial payment</h2>
            <p className="muted">A receipt is generated after the payment is committed.</p>
            <label>Amount (PKR)<input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} required /></label>
            <label>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}>
              <option value="CASH">Cash</option><option value="BANK">Bank</option><option value="DIGITAL">Digital</option>
            </select></label>
            <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setPaymentOrderId('')}>Cancel</button><button className="button button-primary" disabled={working || !online}>{working ? 'Posting…' : 'Post payment'}</button></div>
          </form>
        </div>
      )}

      {receipt && (
        <div className="dialog-backdrop receipt-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReceipt(null); }}>
          <section className="receipt-card receipt-print" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
            <div className="receipt-brand"><span className="brand-mark">T</span><div><p className="eyebrow">Payment receipt</p><h2 id="receipt-title">{receipt.business.name}</h2></div></div>
            <p className="receipt-number">{receipt.receiptNumber}</p>
            <dl className="receipt-details">
              <div><dt>Customer</dt><dd>{receipt.order.customer.name}</dd></div>
              <div><dt>Phone</dt><dd>{receipt.order.customer.phone}</dd></div>
              <div><dt>Order</dt><dd>{receipt.order.orderNumber}</dd></div>
              <div><dt>Date</dt><dd>{karachiDate(receipt.createdAt)}</dd></div>
              <div><dt>Method</dt><dd>{receipt.method.toLowerCase()}</dd></div>
              {receipt.correctionOf && <div><dt>Reversal of</dt><dd>{receipt.correctionOf.receiptNumber}</dd></div>}
            </dl>
            <div className="receipt-total"><span>{receipt.kind === 'REVERSAL' ? 'Reversal' : 'Paid'}</span><strong>{money(receipt.amount)}</strong></div>
            <div className="dialog-actions no-print">
              <button className="button button-secondary" onClick={() => setReceipt(null)}>Close</button>
              <button className="button button-primary" onClick={() => window.print()}>Print receipt</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, icon, tone = 'green' }: { label: string; value: string; icon: IconName; tone?: string }) {
  return <article className={`metric-card tone-${tone}`}><span className="metric-icon" aria-hidden="true"><Icon name={icon} /></span><span className="metric-label">{label}</span><strong>{value}</strong></article>;
}

function StatusPill({ status }: { status: string }) {
  const label = status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  return <span className={`status-pill status-${status.toLowerCase()}`}>{label}</span>;
}

function isVisibleForItemType(
  field: BusinessConfiguration['fields'][number],
  itemTypeKey: string | undefined,
): boolean {
  if (!field.visibility || typeof field.visibility !== 'object' || Array.isArray(field.visibility)) return true;
  const visibility = field.visibility as Record<string, unknown>;
  const configuredTypes = visibility.itemTypes ?? visibility.garmentTypes;
  if (!Array.isArray(configuredTypes) || configuredTypes.length === 0) return true;
  return Boolean(itemTypeKey && configuredTypes.includes(itemTypeKey));
}

function displayFieldValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return value === null || value === undefined ? '' : JSON.stringify(value);
}

function DynamicFieldControl({
  field,
  value,
  onChange,
}: {
  field: BusinessConfiguration['fields'][number];
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const options = Array.isArray(field.options)
    ? field.options.flatMap((option) => {
      if (typeof option === 'string') return [{ key: option, label: option }];
      if (option && typeof option === 'object' && !Array.isArray(option)
        && 'key' in option && 'label' in option
        && typeof option.key === 'string' && typeof option.label === 'string') {
        return [{ key: option.key, label: option.label }];
      }
      return [];
    })
    : [];
  const required = field.required;
  if (field.type === 'BOOLEAN') {
    return (
      <label className="checkbox-row">
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        {field.label}{required ? ' *' : ''}
      </label>
    );
  }
  if (field.type === 'DROPDOWN') {
    return (
      <label>{field.label}
        <select value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} required={required}>
          <option value="">Choose…</option>
          {options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
      </label>
    );
  }
  if (field.type === 'MULTI_SELECT') {
    const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    return (
      <label>{field.label}
        <select
          multiple
          value={selected}
          onChange={(event) => onChange(Array.from(event.target.selectedOptions, (option) => option.value))}
          required={required}
        >
          {options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
      </label>
    );
  }
  if (field.type === 'LONG_TEXT' || field.type === 'NOTES') {
    return (
      <label className="span-all">{field.label}<textarea
        rows={3}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      /></label>
    );
  }
  const inputType = field.type === 'DATE' ? 'date'
    : field.type === 'DATETIME' ? 'datetime-local'
      : ['NUMBER', 'CURRENCY', 'MEASUREMENT'].includes(field.type) ? 'number' : 'text';
  return (
    <label>{field.label}<input
      type={inputType}
      step={['CURRENCY', 'MEASUREMENT'].includes(field.type) ? '0.01' : field.type === 'NUMBER' ? 'any' : undefined}
      value={value === undefined || value === null ? '' : String(value)}
      onChange={(event) => onChange(event.target.value)}
      required={required}
    /></label>
  );
}

function NotificationPill({ status }: { status: WhatsAppNotification['status'] }) {
  const labels: Record<WhatsAppNotification['status'], string> = {
    QUEUED: 'Queued',
    PROCESSING: 'Processing',
    SENT: 'Sent',
    DELIVERED: 'Delivered',
    READ: 'Read',
    FAILED: 'Failed',
    NOT_SENT: 'Not sent',
  };
  return <span className={`notification-pill notification-${status.toLowerCase()}`}>{labels[status]}</span>;
}

function LoadingState() {
  return <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" />Loading workroom records…</div>;
}

function EmptyState({ title, detail, action, onAction }: { title: string; detail?: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span className="empty-icon" aria-hidden="true"><Icon name="inbox" /></span><h3>{title}</h3>{detail && <p className="muted">{detail}</p>}{action && onAction && <button className="button button-secondary" onClick={onAction}>{action}</button>}</div>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
