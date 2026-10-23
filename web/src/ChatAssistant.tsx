import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type Customer, type Order, type Session } from './api';

type Message = { role: 'user' | 'assistant'; text: string };

interface ChatAssistantProps {
  session: Session;
  onNavigate: (view: string) => void;
}

const VIEW_ALIASES: Record<string, string> = {
  dashboard: 'dashboard', home: 'dashboard', overview: 'dashboard', summary: 'dashboard',
  orders: 'orders', order: 'orders',
  catalog: 'catalog', items: 'catalog', products: 'catalog',
  customers: 'customers', customer: 'customers',
  measurements: 'measurements', measurement: 'measurements',
  payments: 'payments', payment: 'payments',
  notifications: 'notifications', whatsapp: 'notifications',
  subscription: 'subscription', billing: 'subscription', plan: 'subscription',
  configuration: 'configuration', settings: 'configuration', config: 'configuration',
  erp: 'erp', operations: 'erp', finance: 'erp', inventory: 'erp',
};

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === '"') {
      quote = !quote;
      continue;
    }
    if (!quote && /\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function flagValue(tokens: string[], name: string): string | undefined {
  const lowerName = name.toLowerCase();
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const lower = token.toLowerCase();
    if (lower === lowerName) return tokens[i + 1];
    if (lower.startsWith(`${lowerName}:`) || lower.startsWith(`${lowerName}=`)) {
      return token.slice(lowerName.length + 1);
    }
  }
  return undefined;
}

function money(value: string | undefined): string {
  if (value === undefined) return '—';
  const number = Number(value);
  if (Number.isNaN(number)) return value;
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 2 }).format(number);
}

function isoDate(value: string | undefined, fallbackDays = 7): string {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const date = new Date();
  date.setDate(date.getDate() + fallbackDays);
  return date.toISOString();
}

export function ChatAssistant({ session, onNavigate }: ChatAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: 'Hi! I am your offline assistant. I can explain the system and run commands without any internet AI. Type "help" to see what I can do.' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef(session.accessToken);
  const refreshRef = useRef(session.refreshToken);

  useEffect(() => {
    tokenRef.current = session.accessToken;
    refreshRef.current = session.refreshToken;
  }, [session.accessToken, session.refreshToken]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function apiCall<T>(fn: (token: string) => Promise<T>): Promise<T> {
    try {
      return await fn(tokenRef.current);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        const rotated = await api.refresh(refreshRef.current);
        tokenRef.current = rotated.accessToken;
        refreshRef.current = rotated.refreshToken;
        return fn(tokenRef.current);
      }
      throw error;
    }
  }

  function push(role: Message['role'], text: string) {
    setMessages((current) => [...current, { role, text }]);
  }

  async function handleCommand(raw: string): Promise<string> {
    const tokens = tokenize(raw);
    const command = tokens[0]?.toLowerCase() ?? '';
    const rest = tokens.slice(1);

    if (!command) return 'Please type a command. Type "help" for options.';
    if (command === 'help' || command === '?') {
      return [
        'Available commands (offline, no AI):',
        'help',
        'go <view>  (dashboard, orders, customers, catalog, measurements, payments, notifications, subscription, configuration, erp)',
        'dashboard',
        'customers [search]',
        'add customer <name> phone <phone> [notes <notes>]',
        'orders [search]',
        'create order customer <name> item <name> qty <n> price <p> [due <date>]',
        'order status <orderNumber> <STATUS>',
        'mark order <orderNumber> <STATUS>',
        'payments',
        'record payment order <orderNumber> amount <amount> method <CASH|BANK|DIGITAL>',
        'catalog [search]',
        'add catalog item name <name> price <price> unit <unit> [type <typeKey>]',
        'inventory [search]',
        'low stock',
        'suppliers [search]',
        'purchases [search]',
        'cashbook accounts',
        'cashbook transactions',
        'notifications',
        'subscription',
        'search <term>',
        'clear',
      ].join('\n');
    }

    if (command === 'clear') {
      setMessages([{ role: 'assistant', text: 'Conversation cleared. Type "help" for commands.' }]);
      return '';
    }

    if (command === 'go' || command === 'open' || command === 'navigate' || command === 'show') {
      const target = rest[0]?.toLowerCase();
      const view = target ? VIEW_ALIASES[target] : undefined;
      if (!view) {
        return `Unknown view "${target ?? ''}". Try: ${Object.keys(VIEW_ALIASES).filter((key, index, array) => array.indexOf(key) === index).slice(0, 12).join(', ')}`;
      }
      onNavigate(view);
      return `Opened ${view}.`;
    }

    if (command === 'dashboard' || command === 'summary' || command === 'stats') {
      const data = await apiCall((token) => api.dashboard(token));
      return [
        `Dashboard (as of ${new Date(data.asOf).toLocaleString()}):`,
        `New orders: ${data.newOrders}`,
        `Due today: ${data.dueToday}`,
        `Overdue: ${data.overdue}`,
        `In progress: ${data.inProgress}`,
        `Alterations: ${data.alterations}`,
        `Outstanding: ${money(data.outstanding)}`,
        `Collected today: ${money(data.collectedToday)}`,
      ].join('\n');
    }

    if (command === 'customers') {
      const query = rest.join(' ').trim();
      const result = await apiCall((token) => api.customers(token, query));
      if (!result.items.length) return 'No customers found.';
      return `Customers (${result.items.length}):\n${result.items.slice(0, 25).map((customer) => `- ${customer.name} · ${customer.phone}${customer.notes ? ` · ${customer.notes}` : ''}`).join('\n')}`;
    }

    if (command === 'add' && rest[0]?.toLowerCase() === 'customer') {
      const createTokens = rest.slice(1);
      const phone = flagValue(createTokens, 'phone');
      const notes = flagValue(createTokens, 'notes');
      const nameTokens = phone
        ? createTokens.slice(0, createTokens.findIndex((token) => token.toLowerCase() === 'phone'))
        : createTokens;
      const name = nameTokens.join(' ').trim();
      if (!name) return 'Usage: add customer <name> phone <phone> [notes <notes>]';
      if (!phone) return 'A phone number is required. Usage: add customer <name> phone <phone>';
      const created = await apiCall((token) => api.createCustomer(token, { name, phone, ...(notes ? { notes } : {}) }));
      return `Customer created: ${created.name} (${created.phone}), id ${created.id}.`;
    }

    if (command === 'orders') {
      const query = rest.join(' ').trim();
      const result = await apiCall((token) => api.orders(token, query));
      if (!result.items.length) return 'No orders found.';
      return `Orders (${result.items.length}):\n${result.items.slice(0, 25).map((order) => `#${order.orderNumber} · ${order.status} · ${order.customer.name} · total ${money(order.total)} · outstanding ${money(order.outstanding)}`).join('\n')}`;
    }

    if (command === 'create' && rest[0]?.toLowerCase() === 'order') {
      const createTokens = rest.slice(1);
      const customerName = flagValue(createTokens, 'customer');
      const itemName = flagValue(createTokens, 'item') ?? flagValue(createTokens, 'garment');
      const quantity = Number(flagValue(createTokens, 'qty') ?? flagValue(createTokens, 'quantity') ?? '1');
      const price = flagValue(createTokens, 'price');
      const due = flagValue(createTokens, 'due');
      if (!customerName) return 'Usage: create order customer <name> item <name> qty <n> price <p> [due <date>]';
      if (!itemName) return 'An item name is required. Usage: ... item <name>';
      if (!price) return 'A price is required. Usage: ... price <amount>';

      const customersResult = await apiCall((token) => api.customers(token, customerName));
      const customer = customersResult.items.find((item) => item.name.toLowerCase() === customerName.toLowerCase()) ?? customersResult.items[0];
      if (!customer) return `No customer found matching "${customerName}". Create the customer first.`;

      const created = await apiCall((token) => api.createOrder(token, {
        customerId: customer.id,
        promisedAt: isoDate(due, 7),
        items: [{ itemName, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1, unitPrice: price }],
      }));
      return `Order created: #${created.orderNumber} for ${customer.name}, total ${money(created.total)}, due ${new Date(created.promisedAt).toLocaleDateString()}.`;
    }

    if (command === 'order' && rest[0]?.toLowerCase() === 'status') {
      const orderNumber = rest[1];
      const status = rest[2]?.toUpperCase();
      if (!orderNumber || !status) return 'Usage: order status <orderNumber> <STATUS>';
      const ordersResult = await apiCall((token) => api.orders(token, orderNumber));
      const order = ordersResult.items.find((item) => item.orderNumber === orderNumber) ?? ordersResult.items[0];
      if (!order) return `Order #${orderNumber} not found.`;
      const updated = await apiCall((token) => api.transitionOrder(token, order, status));
      return `Order #${updated.orderNumber} moved to ${updated.status}.`;
    }

    if (command === 'mark' && rest[0]?.toLowerCase() === 'order') {
      const orderNumber = rest[1];
      const status = rest[2]?.toUpperCase();
      if (!orderNumber || !status) return 'Usage: mark order <orderNumber> <STATUS>';
      const ordersResult = await apiCall((token) => api.orders(token, orderNumber));
      const order = ordersResult.items.find((item) => item.orderNumber === orderNumber) ?? ordersResult.items[0];
      if (!order) return `Order #${orderNumber} not found.`;
      const updated = await apiCall((token) => api.transitionOrder(token, order, status));
      return `Order #${updated.orderNumber} moved to ${updated.status}.`;
    }

    if (command === 'payments') {
      const result = await apiCall((token) => api.payments(token));
      if (!result.items.length) return 'No payments recorded.';
      return `Payments (${result.items.length}):\n${result.items.slice(0, 25).map((payment) => `- ${money(payment.amount)} · ${payment.method} · ${payment.order?.orderNumber ?? 'order'} · ${payment.order?.customer?.name ?? ''}`).join('\n')}`;
    }

    if (command === 'record' && rest[0]?.toLowerCase() === 'payment') {
      const payTokens = rest.slice(1);
      const orderNumber = flagValue(payTokens, 'order');
      const amount = flagValue(payTokens, 'amount');
      const methodInput = (flagValue(payTokens, 'method') ?? 'CASH').toUpperCase();
      if (!orderNumber || !amount) return 'Usage: record payment order <orderNumber> amount <amount> method <CASH|BANK|DIGITAL>';
      if (methodInput !== 'CASH' && methodInput !== 'BANK' && methodInput !== 'DIGITAL') return 'Payment method must be CASH, BANK or DIGITAL.';
      const method = methodInput;
      const ordersResult = await apiCall((token) => api.orders(token, orderNumber));
      const order = ordersResult.items.find((item) => item.orderNumber === orderNumber) ?? ordersResult.items[0];
      if (!order) return `Order #${orderNumber} not found.`;
      const payment = await apiCall((token) => api.createPayment(token, order.id, { amount, method }, crypto.randomUUID()));
      return `Payment recorded: ${money(payment.amount)} via ${payment.method} for order #${order.orderNumber}.`;
    }

    if (command === 'pay') {
      const orderNumber = rest[0];
      const amount = rest[1];
      const methodInput = (rest[2] ?? 'CASH').toUpperCase();
      if (!orderNumber || !amount) return 'Usage: pay <orderNumber> <amount> [CASH|BANK|DIGITAL]';
      if (methodInput !== 'CASH' && methodInput !== 'BANK' && methodInput !== 'DIGITAL') return 'Payment method must be CASH, BANK or DIGITAL.';
      const method = methodInput;
      const ordersResult = await apiCall((token) => api.orders(token, orderNumber));
      const order = ordersResult.items.find((item) => item.orderNumber === orderNumber) ?? ordersResult.items[0];
      if (!order) return `Order #${orderNumber} not found.`;
      const payment = await apiCall((token) => api.createPayment(token, order.id, { amount, method }, crypto.randomUUID()));
      return `Payment recorded: ${money(payment.amount)} via ${payment.method} for order #${order.orderNumber}.`;
    }

    if (command === 'catalog') {
      const query = rest.join(' ').trim();
      const result = await apiCall((token) => api.catalog(token, query));
      if (!result.items.length) return 'No catalog items found.';
      return `Catalog (${result.items.length}):\n${result.items.slice(0, 25).map((item) => `- ${item.name} · ${item.typeKey} · ${item.unit} · ${money(item.unitPrice ?? undefined)}${item.sku ? ` · sku ${item.sku}` : ''}`).join('\n')}`;
    }

    if (command === 'add' && rest[0]?.toLowerCase() === 'catalog') {
      const createTokens = rest.slice(1);
      const name = flagValue(createTokens, 'name') ?? flagValue(createTokens, 'item');
      const price = flagValue(createTokens, 'price');
      const unit = flagValue(createTokens, 'unit') ?? 'piece';
      const typeKey = flagValue(createTokens, 'type') ?? flagValue(createTokens, 'typeKey');
      const sku = flagValue(createTokens, 'sku');
      if (!name) return 'Usage: add catalog item name <name> price <price> unit <unit> [type <typeKey>]';
      if (!price) return 'A price is required. Usage: ... price <amount>';
      const config = await apiCall((token) => api.businessConfiguration(token));
      const resolvedTypeKey = typeKey ?? config.itemTypes?.[0]?.key ?? 'product';
      const created = await apiCall((token) => api.createCatalogItem(token, {
        typeKey: resolvedTypeKey,
        name,
        unit,
        unitPrice: price,
        ...(sku ? { sku } : {}),
        sortOrder: 0,
        customFields: {},
      }));
      return `Catalog item created: ${created.name} (${created.typeKey}), ${money(created.unitPrice ?? undefined)} per ${created.unit}.`;
    }

    if (command === 'inventory') {
      const query = rest.join(' ').trim();
      const result = await apiCall((token) => api.inventoryItems(token, query));
      if (!result.items.length) return 'No inventory items found.';
      return `Inventory (${result.items.length}):\n${result.items.slice(0, 25).map((item) => `- ${item.name} · ${item.baseUnit}${item.reorderPoint ? ` · reorder ${item.reorderPoint}` : ''}`).join('\n')}`;
    }

    if (command === 'low' && rest[0]?.toLowerCase() === 'stock') {
      const result = await apiCall((token) => api.inventoryReorderAlerts(token));
      if (!result.items.length) return 'No reorder alerts. Stock levels look healthy.';
      return `Low stock alerts (${result.count}):\n${result.items.slice(0, 25).map((item) => `- ${item.itemName} · ${item.variantName} · ${item.quantity} ${item.unit} (reorder ${item.reorderPoint})`).join('\n')}`;
    }

    if (command === 'suppliers') {
      const query = rest.join(' ').trim();
      const result = await apiCall((token) => api.suppliers(token, query));
      if (!result.items.length) return 'No suppliers found.';
      return `Suppliers (${result.items.length}):\n${result.items.slice(0, 25).map((supplier) => `- ${supplier.name}${supplier.phone ? ` · ${supplier.phone}` : ''}${supplier.email ? ` · ${supplier.email}` : ''}`).join('\n')}`;
    }

    if (command === 'add' && rest[0]?.toLowerCase() === 'supplier') {
      const createTokens = rest.slice(1);
      const name = flagValue(createTokens, 'name') ?? createTokens.filter((token) => !['phone', 'email', 'address', 'notes'].includes(token.toLowerCase()) && !createTokens[createTokens.indexOf(token) - 1]?.toLowerCase().match(/phone|email|address|notes/)).join(' ').trim();
      const phone = flagValue(createTokens, 'phone');
      const email = flagValue(createTokens, 'email');
      const address = flagValue(createTokens, 'address');
      const notes = flagValue(createTokens, 'notes');
      if (!name) return 'Usage: add supplier name <name> [phone <phone>] [email <email>]';
      const created = await apiCall((token) => api.createSupplier(token, { name, ...(phone ? { phone } : {}), ...(email ? { email } : {}), ...(address ? { address } : {}), ...(notes ? { notes } : {}) }));
      return `Supplier created: ${created.name}${created.phone ? ` (${created.phone})` : ''}.`;
    }

    if (command === 'purchases') {
      const query = rest.join(' ').trim();
      const result = await apiCall((token) => api.purchases(token, query));
      if (!result.items.length) return 'No purchase orders found.';
      return `Purchases (${result.items.length}):\n${result.items.slice(0, 25).map((purchase) => `- ${purchase.id.slice(0, 8)} · supplier ${purchase.supplier.name} · ${purchase.status ?? 'recorded'}`).join('\n')}`;
    }

    if (command === 'cashbook') {
      const sub = rest[0]?.toLowerCase();
      if (sub === 'accounts' || !sub) {
        const result = await apiCall((token) => api.cashbookAccounts(token));
        if (!result.items.length) return 'No cashbook accounts. Run "cashbook setup" in the app first.';
        return `Cashbook accounts (${result.items.length}):\n${result.items.map((account) => `- ${account.name} (${account.code})`).join('\n')}`;
      }
      if (sub === 'transactions') {
        const result = await apiCall((token) => api.cashbookTransactions(token));
        if (!result.items.length) return 'No cashbook transactions.';
        return `Cashbook transactions (${result.items.length}):\n${result.items.slice(0, 25).map((transaction) => `- ${transaction.kind} · ${money(transaction.amount)} · ${transaction.memo}`).join('\n')}`;
      }
      if (sub === 'setup') {
        await apiCall((token) => api.cashbookSetup(token));
        return 'Cashbook setup completed.';
      }
      return 'Usage: cashbook accounts | transactions | setup';
    }

    if (command === 'notifications') {
      const result = await apiCall((token) => api.notifications(token));
      if (!result.items.length) return 'No notifications.';
      return `Notifications (${result.items.length}):\n${result.items.slice(0, 25).map((notification) => `- ${notification.status} · ${notification.kind} · ${notification.id.slice(0, 8)}`).join('\n')}`;
    }

    if (command === 'subscription') {
      const data = await apiCall((token) => api.shopSubscription(token));
      const subscription = data.subscription;
      return [
        subscription ? `Subscription: ${subscription.plan.name} · ${subscription.status} · ends ${new Date(subscription.endsAt).toLocaleDateString()}` : 'No active subscription.',
        `Plans: ${data.plans.map((plan) => `${plan.name} (${money(plan.monthlyPrice)}/mo)`).join(', ')}`,
        `Pending payments: ${data.payments.filter((payment) => payment.status === 'PENDING' || payment.status === 'UNDER_REVIEW').length}`,
      ].join('\n');
    }

    if (command === 'search') {
      const term = rest.join(' ').trim();
      if (!term) return 'Usage: search <term>';
      const [customersResult, ordersResult] = await Promise.all([
        apiCall((token) => api.customers(token, term)).catch(() => ({ items: [] as Customer[] })),
        apiCall((token) => api.orders(token, term)).catch(() => ({ items: [] as Order[] })),
      ]);
      const lines: string[] = [];
      if (customersResult.items.length) lines.push(`Customers:\n${customersResult.items.slice(0, 10).map((customer) => `- ${customer.name} · ${customer.phone}`).join('\n')}`);
      if (ordersResult.items.length) lines.push(`Orders:\n${ordersResult.items.slice(0, 10).map((order) => `- #${order.orderNumber} · ${order.status} · ${order.customer?.name ?? ''}`).join('\n')}`);
      return lines.length ? lines.join('\n\n') : `No results for "${term}".`;
    }

    // Allow direct view names as navigation shortcuts.
    if (VIEW_ALIASES[command]) {
      onNavigate(VIEW_ALIASES[command]);
      return `Opened ${VIEW_ALIASES[command]}.`;
    }

    return `I did not understand "${raw}". Type "help" for available commands.`;
  }

  async function submit() {
    const value = input.trim();
    if (!value || busy) return;
    push('user', value);
    setInput('');
    setBusy(true);
    try {
      const reply = await handleCommand(value);
      if (reply) push('assistant', reply);
    } catch (error) {
      const message = error instanceof ApiError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : 'Something went wrong.';
      push('assistant', `Error: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="button button-primary assistant-launcher"
        onClick={() => setOpen(true)}
        aria-label="Open assistant"
      >
        ?
      </button>
    );
  }

  return (
    <div className="assistant-shell">
      <div className="panel assistant-panel" role="dialog" aria-modal="true" aria-label="Offline assistant">
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <strong>Assistant (offline)</strong>
          <button type="button" className="button button-quiet" onClick={() => setOpen(false)} aria-label="Close assistant" style={{ marginLeft: 'auto' }}>×</button>
        </div>
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.map((message, index) => (
            <div key={index} style={{ alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: message.role === 'user' ? 'var(--configured-primary, #2563eb)' : 'var(--surface-2, #f3f4f6)',
                  color: message.role === 'user' ? '#fff' : 'inherit',
                  fontSize: 13,
                  lineHeight: 1.4,
                }}
              >
                {message.text}
              </div>
            </div>
          ))}
          {busy && <div style={{ alignSelf: 'flex-start', opacity: 0.7, fontSize: 12 }}>Working…</div>}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          style={{ padding: 10, borderTop: '1px solid var(--border, #e5e7eb)', display: 'flex', gap: 8 }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Type a command…"
            disabled={busy}
            style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)' }}
          />
          <button type="submit" className="button button-primary" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatAssistant;
