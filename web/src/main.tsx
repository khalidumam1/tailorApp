import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import {
  createCustomerSchema,
  createMeasurementRevisionSchema,
  createOrderSchema,
  createPaymentSchema,
  orderStatuses,
} from '@tailor/shared';
import {
  api,
  ApiError,
  type CurrentUser,
  type Customer,
  type Dashboard,
  type GarmentTemplate,
  type LoginResult,
  type MeasurementProfile,
  type Order,
  type Payment,
  type Receipt,
  type Session,
} from './api';
import './styles.css';

type View = 'dashboard' | 'orders' | 'customers' | 'measurements' | 'payments';
type PlatformView = 'businesses' | 'staff' | 'audit' | 'health';
type Selection = Exclude<LoginResult, { accessToken: string }>;

const navigation: Array<{ view: View; label: string; permission?: string }> = [
  { view: 'dashboard', label: 'Overview', permission: 'orders:read' },
  { view: 'orders', label: 'Orders', permission: 'orders:read' },
  { view: 'customers', label: 'Customers', permission: 'customers:read' },
  { view: 'measurements', label: 'Measurements', permission: 'measurements:read' },
  { view: 'payments', label: 'Payments', permission: 'payments:read' },
];

function money(value: string | undefined): string {
  if (value === undefined) return '—';
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 2 }).format(Number(value));
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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [templates, setTemplates] = useState<GarmentTemplate[]>([]);
  const [profiles, setProfiles] = useState<MeasurementProfile[]>([]);
  const [search, setSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [orderCustomerId, setOrderCustomerId] = useState('');
  const [orderGarment, setOrderGarment] = useState('Shalwar Kameez');
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
        const [orderResult, customerResult] = await Promise.all([
          withSession((token) => api.orders(token, search)),
          withSession((token) => api.customers(token)),
        ]);
        setOrders(orderResult.items);
        setCustomers(customerResult.items);
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
      } else {
        setPayments((await withSession(api.payments)).items);
      }
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [currentUser?.context.scope, measurementCustomerId, measurementTemplateId, search, session, view, withSession]);

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
      staff: 'platform:staff:manage',
      audit: 'platform:audit:read',
      health: 'platform:system:health',
    };
    if (!currentUser.context.platformPermissions.includes(viewPermissions[platformView])) {
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const loadPlatform = async () => {
      if (platformView === 'businesses' && currentUser.context.platformPermissions.includes('platform:businesses:read')) {
        const result = await withSession(api.platformBusinesses);
        if (active) setPlatformBusinesses(result.items);
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
  }, [currentUser, platformView, session, withSession]);

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
    setCustomers([]);
    setPayments([]);
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
      });
      await withSession((token) => api.createCustomer(token, input));
      setCustomerName('');
      setCustomerPhone('');
      setCustomerNotes('');
      setNotice('Customer saved.');
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
          garmentName: orderGarment,
          quantity: Number(orderQuantity),
          unitPrice: orderPrice,
          ...(orderMeasurementId ? { measurementProfileId: orderMeasurementId } : {}),
        }],
      });
      await withSession((token) => api.createOrder(token, input));
      setOrderPrice('');
      setOrderMeasurementId('');
      setNotice('Order created.');
      await reloadCurrent();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setWorking(false);
    }
  }

  async function changeStatus(order: Order, nextStatus: Order['status']) {
    if (!session) return;
    if (nextStatus === 'CANCELLED' && !window.confirm(`Cancel order ${order.orderNumber}? This action cannot be undone.`)) return;
    setWorking(true);
    setError(null);
    try {
      await withSession((token) => api.transitionOrder(token, order, nextStatus));
      setNotice(`Order ${order.orderNumber} updated.`);
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

  async function createBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await withSession((token) => api.createPlatformBusiness(token, { name: businessName, slug: businessSlug }));
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
    const platformNavigation: Array<{ view: PlatformView; label: string; permission: string }> = [
      { view: 'businesses', label: 'Businesses', permission: 'platform:businesses:read' },
      { view: 'staff', label: 'Platform staff', permission: 'platform:staff:manage' },
      { view: 'audit', label: 'Audit history', permission: 'platform:audit:read' },
      { view: 'health', label: 'System health', permission: 'platform:system:health' },
    ];
    const visiblePlatformNavigation = platformNavigation.filter((item) => grants.has(item.permission));
    return (
      <main className="page platform-state">
        <header className="topbar">
          <div><p className="eyebrow">Platform administration</p><h1>TailorApp</h1></div>
          <div className="user-menu"><span className="user-name">{currentUser.user.name}</span><button className="button button-secondary" onClick={() => void signOut()}>Sign out</button></div>
        </header>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice(null)}>×</button></div>}
        <nav className="platform-nav" aria-label="Platform navigation">
          {visiblePlatformNavigation.map((item) => <button key={item.view} className={platformView === item.view ? 'button button-primary' : 'button button-secondary'} onClick={() => { setPlatformView(item.view); setError(null); }}>{item.label}</button>)}
        </nav>
        {visiblePlatformNavigation.length === 0 && <section className="panel"><h2>No platform tools assigned</h2><p className="muted">A platform administrator must explicitly grant access.</p></section>}
        {platformView === 'businesses' && grants.has('platform:businesses:read') && (
          <section className="content-stack">
            <div className="section-heading"><div><h2>Business directory</h2><p className="muted">Create businesses, provision an owner and control activation.</p></div></div>
            {grants.has('platform:businesses:manage') && (
              <form className="panel form-panel" onSubmit={createBusiness}>
                <div className="panel-heading"><h3>Register a business</h3><p className="muted">New businesses start pending until an active owner is assigned.</p></div>
                <div className="form-grid">
                  <label>Business name<input value={businessName} onChange={(event) => setBusinessName(event.target.value)} maxLength={160} required /></label>
                  <label>Unique URL slug<input value={businessSlug} onChange={(event) => setBusinessSlug(event.target.value)} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} required /></label>
                </div>
                <button className="button button-primary" disabled={working || !online}>{working ? 'Creating…' : 'Create pending business'}</button>
              </form>
            )}
            {loading ? <LoadingState /> : platformBusinesses.length ? (
              <div className="table-wrap"><table><thead><tr><th>Business</th><th>Slug</th><th>Members</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>{platformBusinesses.map((business) => (
                  <tr key={business.id}>
                    <td><strong>{business.name}</strong></td><td>{business.slug}</td><td>{business._count?.memberships ?? 0}</td>
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
      </main>
    );
  }

  const permissions = new Set(currentUser?.context.permissions ?? []);
  const visibleNavigation = navigation.filter((item) => !item.permission || permissions.has(item.permission));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand-lockup" href="#" onClick={(event) => { event.preventDefault(); setView('dashboard'); }}>
          <span className="brand-mark" aria-hidden="true">T</span>
          <span><strong>TailorApp</strong><small>Workroom desk</small></span>
        </a>
        <div className="shop-switcher">
          <span className="shop-avatar" aria-hidden="true">{currentUser?.context.business?.name.slice(0, 1) ?? 'S'}</span>
          <span><strong>{currentUser?.context.business?.name ?? 'Business'}</strong><small>Business workspace</small></span>
        </div>
        <nav aria-label="Main navigation" className="main-nav">
          {visibleNavigation.map((item) => (
            <button key={item.view} className={view === item.view ? 'nav-item active' : 'nav-item'} onClick={() => { setView(item.view); setError(null); }}>
              <span className={`nav-icon icon-${item.view}`} aria-hidden="true" />
              {item.label}
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
            <button className="button button-quiet" onClick={() => void signOut()}>Sign out</button>
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
                  <MetricCard label="New orders today" value={String(dashboard.newOrders)} icon="＋" />
                  <MetricCard label="Due today" value={String(dashboard.dueToday)} icon="◷" tone="amber" />
                  <MetricCard label="In progress" value={String(dashboard.inProgress)} icon="⌁" tone="blue" />
                  <MetricCard label="Overdue" value={String(dashboard.overdue)} icon="!" tone="rose" />
                  {permissions.has('payments:read') && <MetricCard label="Outstanding" value={money(dashboard.outstanding)} icon="₨" tone="violet" />}
                  {permissions.has('payments:read') && <MetricCard label="Collected today" value={money(dashboard.collectedToday)} icon="↗" tone="green" />}
                </div>
                <section className="panel dashboard-note">
                  <div>
                    <p className="eyebrow">Today at a glance</p>
                    <h2>{dashboard.alterations} open alteration{dashboard.alterations === 1 ? '' : 's'}</h2>
                    <p className="muted">Dashboard figures use the shop's Asia/Karachi business day.</p>
                  </div>
                  <button className="button button-primary" onClick={() => setView('orders')} disabled={!permissions.has('orders:read')}>View orders</button>
                </section>
              </>
            ) : <EmptyState title="Dashboard unavailable" action="Refresh" onAction={() => void reloadCurrent()} />}
          </section>
        )}

        {view === 'customers' && (
          <section className="content-stack">
            <div className="section-heading">
              <div><h2>Customer book</h2><p className="muted">Search customers by name or phone number.</p></div>
              <form className="search-form" onSubmit={(event) => { event.preventDefault(); void reloadCurrent(); }}>
                <label className="visually-hidden" htmlFor="customer-search">Search customers</label>
                <input id="customer-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or phone" />
                <button className="button button-secondary" type="submit">Search</button>
              </form>
            </div>
            {permissions.has('customers:write') && (
              <form className="panel form-panel" onSubmit={addCustomer}>
                <div className="panel-heading"><h3>Add a customer</h3><p className="muted">The shop checks for an existing phone number before saving.</p></div>
                <div className="form-grid">
                  <label>Name<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={120} required /></label>
                  <label>Phone<input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="03xx xxx xxxx or +92…" maxLength={24} required /></label>
                  <label className="span-all">Notes<textarea value={customerNotes} onChange={(event) => setCustomerNotes(event.target.value)} rows={2} maxLength={2000} /></label>
                </div>
                <button className="button button-primary" type="submit" disabled={working || !online}>{working ? 'Saving…' : 'Save customer'}</button>
              </form>
            )}
            {loading ? <LoadingState /> : customers.length ? (
              <div className="table-wrap">
                <table><thead><tr><th>Customer</th><th>Phone</th><th>Added</th></tr></thead>
                  <tbody>{customers.map((customer) => (
                    <tr key={customer.id}><td><strong>{customer.name}</strong>{customer.notes && <small className="table-note">{customer.notes}</small>}</td><td>{customer.phone}</td><td>{karachiDate(customer.createdAt)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <EmptyState title="No customers yet" detail="Add a customer above or try a broader search." />}
          </section>
        )}

        {view === 'orders' && (
          <section className="content-stack">
            <div className="section-heading">
              <div><h2>Order book</h2><p className="muted">Follow each garment from measurement confirmation to pickup.</p></div>
              <form className="search-form" onSubmit={(event) => { event.preventDefault(); void reloadCurrent(); }}>
                <label className="visually-hidden" htmlFor="order-search">Search orders</label>
                <input id="order-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order number or customer" />
                <button className="button button-secondary" type="submit">Search</button>
              </form>
            </div>
            {permissions.has('orders:write') && (
              <form className="panel form-panel" onSubmit={addOrder}>
                <div className="panel-heading"><h3>Start a new order</h3><p className="muted">The server assigns the order number and calculates the total.</p></div>
                <div className="form-grid">
                  <label>Customer<select value={orderCustomerId} onChange={(event) => setOrderCustomerId(event.target.value)} required>
                    <option value="">Choose customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}
                  </select></label>
                  <label>Garment<input value={orderGarment} onChange={(event) => setOrderGarment(event.target.value)} maxLength={120} required /></label>
                  <label>Quantity<input type="number" min="1" max="100" value={orderQuantity} onChange={(event) => setOrderQuantity(event.target.value)} required /></label>
                  <label>Unit price (PKR)<input type="number" min="0.01" step="0.01" value={orderPrice} onChange={(event) => setOrderPrice(event.target.value)} required /></label>
                  <label>Promised ready date<input type="datetime-local" value={orderDueAt} onChange={(event) => setOrderDueAt(event.target.value)} required /></label>
                  {profiles.length > 0 && <label>Measurement profile<select value={orderMeasurementId} onChange={(event) => setOrderMeasurementId(event.target.value)}>
                    <option value="">No saved profile</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.garmentTemplate.name}</option>)}
                  </select></label>}
                </div>
                <button className="button button-primary" type="submit" disabled={working || !online || !orderCustomerId}>{working ? 'Creating…' : 'Create order'}</button>
              </form>
            )}
            {loading ? <LoadingState /> : orders.length ? (
              <div className="order-list">
                {orders.map((order) => (
                  <article className="order-card" key={order.id}>
                    <div className="order-card-main">
                      <div className="order-heading"><span className="order-number">{order.orderNumber}</span><StatusPill status={order.status} /></div>
                      <h3>{order.customer.name}</h3>
                      <p className="muted">{order.customer.phone} · Ready by {karachiDate(order.promisedAt)}</p>
                      <ul className="garment-list">{order.items.map((item) => <li key={item.id}>{item.quantity} × {item.garmentName}</li>)}</ul>
                    </div>
                    <div className="order-card-side">
                      <span className="money-total">{money(order.total)}</span>
                      <span className="muted">{money(order.outstanding)} outstanding</span>
                      <div className="row-actions">
                        {permissions.has('orders:transition') && <TransitionButton order={order} onChange={changeStatus} disabled={working || !online} />}
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
                  <label>Garment template<select value={measurementTemplateId} onChange={(event) => setMeasurementTemplateId(event.target.value)} required>
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

function MetricCard({ label, value, icon, tone = 'green' }: { label: string; value: string; icon: string; tone?: string }) {
  return <article className={`metric-card tone-${tone}`}><span className="metric-icon" aria-hidden="true">{icon}</span><span className="metric-label">{label}</span><strong>{value}</strong></article>;
}

function StatusPill({ status }: { status: Order['status'] | 'ACTIVE' | 'SUSPENDED' | 'PENDING' }) {
  const label = status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  return <span className={`status-pill status-${status.toLowerCase()}`}>{label}</span>;
}

function TransitionButton({ order, onChange, disabled }: { order: Order; onChange: (order: Order, next: Order['status']) => void; disabled: boolean }) {
  const index = orderStatuses.indexOf(order.status);
  const next = order.status === 'COLLECTED' || order.status === 'CANCELLED' ? undefined : orderStatuses[index + 1];
  return (
    <>
      {next && <button className="button button-secondary" disabled={disabled} onClick={() => onChange(order, next)}>Move to {next.replaceAll('_', ' ').toLowerCase()}</button>}
      {order.status !== 'COLLECTED' && order.status !== 'CANCELLED' && <button className="button button-danger-quiet" disabled={disabled} onClick={() => onChange(order, 'CANCELLED')}>Cancel</button>}
    </>
  );
}

function LoadingState() {
  return <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" />Loading workroom records…</div>;
}

function EmptyState({ title, detail, action, onAction }: { title: string; detail?: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span className="empty-icon" aria-hidden="true">⌂</span><h3>{title}</h3>{detail && <p className="muted">{detail}</p>}{action && onAction && <button className="button button-secondary" onClick={onAction}>{action}</button>}</div>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
