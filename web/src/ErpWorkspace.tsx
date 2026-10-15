import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api, type AccountingJournal, type BalanceSheetReport, type CashTransaction, type ErpAccount, type InventoryItem, type InventoryMovement, type InventoryValuationItem, type ProfitLossReport, type PurchaseOrder, type Supplier, type SupplierLedger, type TrialBalanceRow } from './api';
import { Icon } from './Icons';

type ErpModule = 'inventory' | 'suppliers' | 'purchasing' | 'cashbook' | 'accounting';
type WithSession = <T>(action: (token: string) => Promise<T>) => Promise<T>;
type IdempotencyAttempt = { scope: string; fingerprint: string; key: string };

const erpModules: Array<{ id: ErpModule; label: string; permission: string; icon: 'catalog' | 'customers' | 'orders' | 'payments' | 'reports' }> = [
  { id: 'inventory', label: 'Inventory', permission: 'inventory:read', icon: 'catalog' },
  { id: 'suppliers', label: 'Suppliers', permission: 'suppliers:read', icon: 'customers' },
  { id: 'purchasing', label: 'Purchasing', permission: 'purchasing:read', icon: 'orders' },
  { id: 'cashbook', label: 'Cash & bank', permission: 'cashbook:read', icon: 'payments' },
  { id: 'accounting', label: 'Accounting', permission: 'accounting:read', icon: 'reports' },
];
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const isZeroQuantity = (value: string | undefined) => value === undefined || /^0+(?:\.0+)?$/.test(value);
const formatQuantity = (value: string) => value.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
const localDateTimeInput = (value = new Date()) => {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};
const localDateTimeIso = (value: string) => new Date(value).toISOString();
const downloadCsvTemplate = (filename: string, rows: string[][]) => {
  const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function ErpWorkspace({
  withSession,
  online,
  enabledModules,
  permissions,
  currency,
  timezone,
}: {
  withSession: WithSession;
  online: boolean;
  enabledModules: string[];
  permissions: string[];
  currency: string;
  timezone: string;
}) {
  const accessible = useMemo(() => erpModules.filter((item) => enabledModules.includes(item.id) && permissions.includes(item.permission)), [enabledModules, permissions]);
  const [activeModule, setActiveModule] = useState<ErpModule>('inventory');
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const idempotencyAttempts = useRef(new Map<string, Map<string, string>>());

  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [valuationRows, setValuationRows] = useState<InventoryValuationItem[]>([]);
  const [locations, setLocations] = useState<Array<{ id: string; code: string; name: string; isDefault: boolean; active: boolean }>>([]);
  const [inventoryValue, setInventoryValue] = useState('0.00');
  const [reorderAlerts, setReorderAlerts] = useState<Array<{ variantId: string; itemId: string; itemName: string; variantName: string; quantity: string; reorderPoint: string; unit: string }>>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierLedger, setSupplierLedger] = useState<SupplierLedger | null>(null);
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [accounts, setAccounts] = useState<ErpAccount[]>([]);
  const [categories, setCategories] = useState<ErpAccount[]>([]);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [reconciliations, setReconciliations] = useState<Array<{ id: string; accountId: string; statementStart: string; statementEnd: string; openingBalance: string; closingBalance: string; status: 'OPEN' | 'CLOSED'; account: { id: string; code: string; name: string }; _count: { matches: number } }>>([]);
  const [reconciliationId, setReconciliationId] = useState('');
  const [reconciliationLines, setReconciliationLines] = useState<Array<{ id: string; debit: string; credit: string; matched: boolean; signedAmount: string; journalEntry: { id: string; entryNumber: string; entryDate: string; memo: string; sourceType: string } }>>([]);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [trialRows, setTrialRows] = useState<TrialBalanceRow[]>([]);
  const [trialTotals, setTrialTotals] = useState({ debitTotal: '0.00', creditTotal: '0.00' });
  const [journals, setJournals] = useState<AccountingJournal[]>([]);
  const [profitLoss, setProfitLoss] = useState<ProfitLossReport | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetReport | null>(null);

  const [stockForm, setStockForm] = useState({ name: '', kind: 'MATERIAL' as 'MATERIAL' | 'PRODUCT' | 'SUPPLY', unit: 'metre', sku: '', reorderPoint: '', openingQuantity: '', openingCost: '' });
  const [variantForm, setVariantForm] = useState({ itemId: '', name: '', sku: '', openingQuantity: '', openingCost: '', locationId: '' });
  const [movementForm, setMovementForm] = useState({ variantId: '', locationId: '', kind: 'RECEIPT' as 'RECEIPT' | 'CONSUMPTION' | 'CUSTOMER_RETURN' | 'SUPPLIER_RETURN' | 'WASTAGE' | 'ADJUSTMENT', direction: 'IN' as 'IN' | 'OUT', quantity: '', unitCost: '', note: '' });
  const [transferForm, setTransferForm] = useState({ variantId: '', fromLocationId: '', toLocationId: '', quantity: '' });
  const [locationForm, setLocationForm] = useState({ code: '', name: '' });
  const [supplierForm, setSupplierForm] = useState({ name: '', contactName: '', phone: '', email: '', address: '' });
  const [supplierEditingId, setSupplierEditingId] = useState('');
  const [purchaseForm, setPurchaseForm] = useState({ supplierId: '', variantId: '', quantity: '', unitCost: '', notes: '' });
  const [receiveForm, setReceiveForm] = useState({ orderId: '', lineId: '', quantity: '' });
  const [settlementForm, setSettlementForm] = useState({ orderId: '', kind: 'PAYMENT' as 'PAYMENT' | 'REFUND', financialAccountId: '', amount: '', note: '' });
  const [cashForm, setCashForm] = useState({ kind: 'EXPENSE' as 'RECEIPT' | 'EXPENSE' | 'TRANSFER', accountId: '', contraAccountId: '', amount: '', memo: '' });
  const [cashbookEditForm, setCashbookEditForm] = useState({ kind: '' as 'ACCOUNT' | 'CATEGORY' | '', accountId: '', name: '' });
  const [accountForm, setAccountForm] = useState({ code: '', name: '', type: 'EXPENSE' as ErpAccount['type'], cashbookEnabled: false });
  const [categoryForm, setCategoryForm] = useState({ name: '', type: 'EXPENSE' as 'INCOME' | 'EXPENSE' });
  const [openingForm, setOpeningForm] = useState({ accountId: '', amount: '', asOf: localDateTimeInput() });
  const [reconciliationForm, setReconciliationForm] = useState({ accountId: '', statementStart: localDateTimeInput(new Date(Date.now() - 30 * 86_400_000)), statementEnd: localDateTimeInput(), openingBalance: '', closingBalance: '' });
  const [journalForm, setJournalForm] = useState({ memo: '', debitAccountId: '', creditAccountId: '', amount: '' });
  const [reportDate, setReportDate] = useState(dateOnly(new Date()));

  useEffect(() => {
    if (accessible.length && !accessible.some((item) => item.id === activeModule)) setActiveModule(accessible[0]!.id);
  }, [accessible, activeModule]);

  const refresh = useCallback(async () => {
    if (!online || !accessible.some((item) => item.id === activeModule)) return;
    setLoading(true);
    setError('');
    try {
      if (activeModule === 'inventory') {
        const [items, valuation, alerts, movements, locationResult] = await Promise.all([
          withSession((token) => api.inventoryItems(token)),
          withSession(api.inventoryValuation),
          withSession(api.inventoryReorderAlerts),
          withSession((token) => api.inventoryMovements(token, { limit: 30 })),
          withSession(api.inventoryLocations),
        ]);
        setInventoryItems(items.items);
        setInventoryValue(valuation.totalValue);
        setValuationRows(valuation.items);
        setReorderAlerts(alerts.items);
        setInventoryMovements(movements.items);
        setLocations(locationResult.items);
        if (!variantForm.itemId && items.items[0]) setVariantForm((current) => ({ ...current, itemId: items.items[0]!.id }));
        if (!variantForm.locationId && locationResult.items[0]) setVariantForm((current) => ({ ...current, locationId: locationResult.items[0]!.id }));
        const variants = items.items.flatMap((item) => item.variants.map((variant) => ({ id: variant.id })));
        if (!movementForm.variantId && variants[0]) setMovementForm((current) => ({ ...current, variantId: variants[0]!.id }));
        if (!transferForm.variantId && variants[0]) setTransferForm((current) => ({ ...current, variantId: variants[0]!.id }));
        if (!movementForm.locationId && locationResult.items[0]) setMovementForm((current) => ({ ...current, locationId: locationResult.items[0]!.id }));
        if (!transferForm.fromLocationId && locationResult.items[0]) setTransferForm((current) => ({ ...current, fromLocationId: locationResult.items[0]!.id }));
        if (!transferForm.toLocationId && locationResult.items[1]) setTransferForm((current) => ({ ...current, toLocationId: locationResult.items[1]!.id }));
      } else if (activeModule === 'suppliers') {
        setSuppliers((await withSession((token) => api.suppliers(token, '', true))).items);
      } else if (activeModule === 'purchasing') {
        const [orderResult, supplierResult, itemResult, accountResult] = await Promise.all([
          withSession((token) => api.purchases(token)),
          enabledModules.includes('suppliers') && permissions.includes('suppliers:read')
            ? withSession((token) => api.suppliers(token)) : Promise.resolve({ items: [], nextCursor: null }),
          enabledModules.includes('inventory') && permissions.includes('inventory:read')
            ? withSession((token) => api.inventoryItems(token)) : Promise.resolve({ items: [] }),
          enabledModules.includes('cashbook') && permissions.includes('cashbook:read')
            ? withSession(api.cashbookAccounts) : Promise.resolve({ items: [], setupRequired: true }),
        ]);
        setPurchases(orderResult.items);
        setSuppliers(supplierResult.items);
        setInventoryItems(itemResult.items);
        setAccounts(accountResult.items);
        if (!purchaseForm.supplierId && supplierResult.items[0]) setPurchaseForm((current) => ({ ...current, supplierId: supplierResult.items[0]!.id }));
        if (!purchaseForm.variantId && itemResult.items[0]?.variants[0]) setPurchaseForm((current) => ({ ...current, variantId: itemResult.items[0]!.variants[0]!.id }));
        if (!settlementForm.financialAccountId && accountResult.items[0]) setSettlementForm((current) => ({ ...current, financialAccountId: accountResult.items[0]!.id }));
      } else if (activeModule === 'cashbook') {
        const [accountResult, categoryResult, transactionResult, reconciliationResult] = await Promise.all([
          withSession(api.cashbookAccounts),
          withSession(api.cashbookCategories),
          withSession((token) => api.cashbookTransactions(token)),
          withSession(api.cashbookReconciliations),
        ]);
        setAccounts(accountResult.items);
        setCategories(categoryResult.items);
        setTransactions(transactionResult.items);
        setReconciliations(reconciliationResult.items);
        if (!cashForm.accountId && accountResult.items[0]) setCashForm((current) => ({ ...current, accountId: accountResult.items[0]!.id }));
        if (!openingForm.accountId && accountResult.items[0]) setOpeningForm((current) => ({ ...current, accountId: accountResult.items[0]!.id }));
        if (!reconciliationForm.accountId && accountResult.items[0]) setReconciliationForm((current) => ({ ...current, accountId: accountResult.items[0]!.id }));
        const expense = categoryResult.items.find((account) => account.type === 'EXPENSE');
        if (!cashForm.contraAccountId && expense) setCashForm((current) => ({ ...current, contraAccountId: expense.id }));
        if (!settlementForm.financialAccountId && accountResult.items[0]) setSettlementForm((current) => ({ ...current, financialAccountId: accountResult.items[0]!.id }));
      } else {
        const [accountResult, trial, pnl, sheet, journalResult] = await Promise.all([
          withSession(api.accountingAccounts),
          withSession((token) => api.trialBalance(token, reportDate)),
          withSession((token) => api.profitLoss(token, { to: reportDate })),
          withSession((token) => api.balanceSheet(token, reportDate)),
          withSession((token) => api.accountingJournals(token, { to: reportDate, limit: 50 })),
        ]);
        setAccounts(accountResult.items);
        setJournals(journalResult.items);
        setTrialRows(trial.items);
        setTrialTotals({ debitTotal: trial.debitTotal, creditTotal: trial.creditTotal });
        setProfitLoss(pnl);
        setBalanceSheet(sheet);
        if (!journalForm.debitAccountId && accountResult.items[0]) setJournalForm((current) => ({ ...current, debitAccountId: accountResult.items.find((account) => account.type === 'ASSET')?.id ?? accountResult.items[0]!.id }));
        if (!journalForm.creditAccountId && accountResult.items[1]) setJournalForm((current) => ({ ...current, creditAccountId: accountResult.items.find((account) => account.type === 'INCOME')?.id ?? accountResult.items[1]!.id }));
        if (!accountForm.code && accountResult.items.length) setAccountForm((current) => ({ ...current, code: `A${Date.now().toString().slice(-6)}` }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this module.');
    } finally {
      setLoading(false);
    }
  }, [activeModule, accessible, online, withSession, enabledModules, permissions, movementForm.variantId, movementForm.locationId,
    variantForm.itemId, variantForm.locationId, transferForm.variantId, transferForm.fromLocationId, transferForm.toLocationId, purchaseForm.supplierId, purchaseForm.variantId,
    settlementForm.financialAccountId, cashForm.accountId, cashForm.contraAccountId, openingForm.accountId, reconciliationForm.accountId,
    reportDate, journalForm.debitAccountId, journalForm.creditAccountId, accountForm.code]);

  useEffect(() => { void refresh(); }, [refresh]);

  const beginIdempotentMutation = (scope: string, body: unknown): IdempotencyAttempt => {
    const fingerprint = JSON.stringify(body);
    const scoped = idempotencyAttempts.current.get(scope) ?? new Map<string, string>();
    const existing = scoped.get(fingerprint);
    const key = existing ?? crypto.randomUUID();
    scoped.set(fingerprint, key);
    idempotencyAttempts.current.set(scope, scoped);
    return { scope, fingerprint, key };
  };
  const completeIdempotentMutation = (attempt: IdempotencyAttempt) => {
    const scoped = idempotencyAttempts.current.get(attempt.scope);
    scoped?.delete(attempt.fingerprint);
    if (scoped?.size === 0) idempotencyAttempts.current.delete(attempt.scope);
  };
  const mutate = async (
    operation: (token: string) => Promise<unknown>,
    message: string,
    attempt?: IdempotencyAttempt,
  ): Promise<boolean> => {
    setWorking(true);
    setError('');
    setNotice('');
    try {
      await withSession(operation);
      if (attempt) completeIdempotentMutation(attempt);
      setNotice(message);
      await refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the change.');
      return false;
    } finally {
      setWorking(false);
    }
  };
  const money = (value: string | undefined) => value === undefined ? '—' : new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value));
  const variantChoices = inventoryItems.flatMap((item) => item.variants.map((variant) => ({ id: variant.id, label: `${item.name} · ${variant.name}`, unit: item.baseUnit })));
  const movementLocationId = movementForm.locationId || locations.find((location) => location.isDefault)?.id || locations[0]?.id;
  const movementBalance = inventoryItems.flatMap((item) => item.variants).find((variant) => variant.id === movementForm.variantId)
    ?.balances.find((balance) => balance.location.id === movementLocationId);
  const adjustmentCostRequired = movementForm.kind === 'ADJUSTMENT' && movementForm.direction === 'IN' && isZeroQuantity(movementBalance?.quantity);
  const writeAllowed = (permission: string, requiredModules: string[] = []) => permissions.includes(permission) && requiredModules.every((module) => enabledModules.includes(module));
  const accessibleActive = accessible.some((item) => item.id === activeModule);
  const activeLabel = erpModules.find((item) => item.id === activeModule)?.label ?? 'Operations & finance';

  const handle = (callback: () => void) => (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); callback(); };

  const saveStockItem = () => {
    if (!stockForm.name.trim()) return setError('Enter an item name.');
    if (Boolean(stockForm.openingQuantity) !== Boolean(stockForm.openingCost)) return setError('Opening quantity and unit cost must both be provided.');
    const opening = stockForm.openingQuantity ? { quantity: stockForm.openingQuantity, unitCost: stockForm.openingCost } : undefined;
    const input = {
      kind: stockForm.kind, name: stockForm.name.trim(), baseUnit: stockForm.unit.trim() || 'unit',
      reorderPoint: stockForm.reorderPoint || undefined,
      variant: { name: 'Standard', sku: stockForm.sku || undefined, ...(opening ? { opening } : {}) },
    };
    const attempt = beginIdempotentMutation('/inventory/items', input);
    void mutate((token) => api.createInventoryItem(token, input, attempt.key), 'Inventory item created.', attempt).then((saved) => {
      if (saved) setStockForm((current) => ({ ...current, name: '', sku: '', openingQuantity: '', openingCost: '' }));
    });
  };
  const saveVariant = () => {
    if (!variantForm.itemId || !variantForm.name.trim()) return setError('Choose an item and enter a variant name.');
    if (Boolean(variantForm.openingQuantity) !== Boolean(variantForm.openingCost)) return setError('Enter both opening quantity and unit cost, or leave both blank.');
    const opening = variantForm.openingQuantity
      ? { quantity: variantForm.openingQuantity, unitCost: variantForm.openingCost, ...(variantForm.locationId ? { locationId: variantForm.locationId } : {}) }
      : undefined;
    const input = { name: variantForm.name.trim(), sku: variantForm.sku.trim() || undefined, ...(opening ? { opening } : {}) };
    const scope = `/inventory/items/${variantForm.itemId}/variants`;
    const attempt = beginIdempotentMutation(scope, input);
    void mutate((token) => api.createInventoryVariant(token, variantForm.itemId, input, attempt.key), 'Stock variant created.', attempt).then((saved) => {
      if (saved) setVariantForm((current) => ({ ...current, name: '', sku: '', openingQuantity: '', openingCost: '' }));
    });
  };
  const saveMovement = () => {
    if (!movementForm.variantId || !movementForm.quantity) return setError('Choose an item and enter a quantity.');
    if (['RECEIPT', 'CUSTOMER_RETURN'].includes(movementForm.kind) && !movementForm.unitCost) return setError('Enter the cost per unit for received stock or a customer return.');
    if (adjustmentCostRequired && !movementForm.unitCost) return setError('Enter a unit cost when adding stock to an empty location.');
    const input = {
      variantId: movementForm.variantId, locationId: movementForm.locationId || undefined,
      kind: movementForm.kind, quantity: movementForm.quantity,
      ...(movementForm.kind === 'ADJUSTMENT' ? { direction: movementForm.direction } : {}),
      ...(['RECEIPT', 'CUSTOMER_RETURN'].includes(movementForm.kind)
        || (movementForm.kind === 'ADJUSTMENT' && movementForm.direction === 'IN' && movementForm.unitCost.trim())
        ? { unitCost: movementForm.unitCost.trim() } : {}),
      note: movementForm.note.trim() || undefined,
    };
    const attempt = beginIdempotentMutation('/inventory/movements', input);
    void mutate((token) => api.createInventoryMovement(token, input, attempt.key), 'Inventory movement posted.', attempt).then((saved) => {
      if (saved) setMovementForm((current) => ({ ...current, quantity: '', unitCost: '', note: '' }));
    });
  };
  const reverseStockMovement = (movement: InventoryMovement) => {
    if (movement.sourceType !== 'MANUAL') return;
    const reason = window.prompt('Reason for this inventory reversal?');
    if (!reason?.trim()) return;
    const input = { reason: reason.trim() };
    const attempt = beginIdempotentMutation(`/inventory/movements/${movement.id}/reversals`, input);
    void mutate((token) => api.reverseInventoryMovement(token, movement.id, input.reason, attempt.key), 'Stock movement reversed with an audit record.', attempt);
  };
  const saveTransfer = () => {
    if (!transferForm.variantId || !transferForm.fromLocationId || !transferForm.toLocationId || !transferForm.quantity) return setError('Choose a stock item, two locations and quantity.');
    if (transferForm.fromLocationId === transferForm.toLocationId) return setError('Choose two different locations.');
    const input = { ...transferForm };
    const attempt = beginIdempotentMutation('/inventory/transfers', input);
    void mutate((token) => api.transferInventory(token, input, attempt.key), 'Stock transferred between locations.', attempt).then((saved) => {
      if (saved) setTransferForm((current) => ({ ...current, quantity: '' }));
    });
  };
  const saveLocation = () => {
    if (!locationForm.code.trim() || !locationForm.name.trim()) return setError('Enter both a location code and name.');
    const input = { code: locationForm.code.trim(), name: locationForm.name.trim() };
    void mutate((token) => api.createInventoryLocation(token, input), 'Inventory location added.').then((saved) => {
      if (saved) setLocationForm({ code: '', name: '' });
    });
  };
  const saveSupplier = () => {
    if (!supplierForm.name.trim()) return setError('Enter a supplier name.');
    const input = {
      name: supplierForm.name.trim(), contactName: supplierForm.contactName || undefined, phone: supplierForm.phone || undefined,
      email: supplierForm.email || undefined, address: supplierForm.address || undefined,
    };
    if (supplierEditingId) {
      const supplier = suppliers.find((item) => item.id === supplierEditingId);
      if (!supplier) return setError('Supplier is no longer available. Refresh and try again.');
      void mutate((token) => api.updateSupplier(token, supplier.id, { version: supplier.version, ...input }), 'Supplier updated.').then((saved) => {
        if (saved) { setSupplierEditingId(''); setSupplierForm({ name: '', contactName: '', phone: '', email: '', address: '' }); }
      });
      return;
    }
    const attempt = beginIdempotentMutation('/suppliers', input);
    void mutate((token) => api.createSupplier(token, input, attempt.key), 'Supplier added.', attempt).then((saved) => {
      if (saved) setSupplierForm({ name: '', contactName: '', phone: '', email: '', address: '' });
    });
  };
  const loadSupplierLedger = async (supplierId: string) => {
    try {
      const ledger = await withSession((token) => api.supplierLedger(token, supplierId));
      setSupplierLedger(ledger);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load supplier history.');
    }
  };
  const savePurchase = () => {
    if (!purchaseForm.supplierId || !purchaseForm.variantId || !purchaseForm.quantity || !purchaseForm.unitCost) return setError('Complete supplier, item, quantity and unit cost.');
    const input = {
      supplierId: purchaseForm.supplierId,
      notes: purchaseForm.notes || undefined,
      lines: [{ variantId: purchaseForm.variantId, quantity: purchaseForm.quantity, unitCost: purchaseForm.unitCost }],
    };
    const attempt = beginIdempotentMutation('/purchases', input);
    void mutate((token) => api.createPurchaseOrder(token, input, attempt.key), 'Purchase order created.', attempt).then((saved) => {
      if (saved) setPurchaseForm((current) => ({ ...current, quantity: '', unitCost: '', notes: '' }));
    });
  };
  const saveReceipt = () => {
    const order = purchases.find((item) => item.id === receiveForm.orderId);
    if (!order || !receiveForm.lineId || !receiveForm.quantity) return setError('Choose an outstanding purchase line and enter received quantity.');
    const input = { lines: [{ purchaseOrderLineId: receiveForm.lineId, quantity: receiveForm.quantity }] };
    const scope = `/purchases/${order.id}/receive`;
    const attempt = beginIdempotentMutation(scope, input);
    void mutate((token) => api.receivePurchaseOrder(token, order.id, input, attempt.key), 'Goods received into inventory.', attempt).then((saved) => {
      if (saved) setReceiveForm((current) => ({ ...current, quantity: '' }));
    });
  };
  const saveSettlement = () => {
    if (!settlementForm.orderId || !settlementForm.financialAccountId || !settlementForm.amount) return setError('Choose a purchase, cash/bank account and amount.');
    const input = {
      kind: settlementForm.kind, financialAccountId: settlementForm.financialAccountId, amount: settlementForm.amount, note: settlementForm.note || undefined,
    };
    const scope = `/purchases/${settlementForm.orderId}/settlements`;
    const attempt = beginIdempotentMutation(scope, input);
    void mutate((token) => api.settlePurchaseOrder(token, settlementForm.orderId, input, attempt.key), settlementForm.kind === 'PAYMENT' ? 'Supplier payment posted.' : 'Supplier refund recorded.', attempt).then((saved) => {
      if (saved) setSettlementForm((current) => ({ ...current, amount: '', note: '' }));
    });
  };
  const saveCashTransaction = () => {
    if (!cashForm.accountId || !cashForm.contraAccountId || !cashForm.amount || !cashForm.memo.trim()) return setError('Choose both accounts and enter an amount and description.');
    if (cashForm.accountId === cashForm.contraAccountId) return setError('Choose two different accounts.');
    const input = {
      kind: cashForm.kind, financialAccountId: cashForm.accountId, contraAccountId: cashForm.contraAccountId,
      amount: cashForm.amount, memo: cashForm.memo.trim(),
    };
    const attempt = beginIdempotentMutation('/cashbook/transactions', input);
    void mutate((token) => api.createCashbookTransaction(token, input, attempt.key), 'Cashbook transaction posted.', attempt).then((saved) => {
      if (saved) setCashForm((current) => ({ ...current, amount: '', memo: '' }));
    });
  };
  const saveAccount = () => {
    if (!accountForm.code.trim() || !accountForm.name.trim()) return setError('Enter account code and name.');
    void mutate((token) => api.createAccountingAccount(token, {
      code: accountForm.code.trim(), name: accountForm.name.trim(), type: accountForm.type,
      cashbookEnabled: accountForm.cashbookEnabled,
    }), 'Account created.').then((saved) => {
      if (saved) setAccountForm((current) => ({ ...current, name: '', code: `A${Date.now().toString().slice(-6)}` }));
    });
  };
  const saveCategory = () => {
    if (!categoryForm.name.trim()) return setError('Enter a category name.');
    const code = `C${Date.now().toString().slice(-6)}`;
    void mutate((token) => api.createCashbookCategory(token, { code, name: categoryForm.name.trim(), type: categoryForm.type }), 'Cashbook category created.').then((saved) => {
      if (saved) setCategoryForm((current) => ({ ...current, name: '' }));
    });
  };
  const saveCashbookName = () => {
    if (!cashbookEditForm.accountId || !cashbookEditForm.name.trim()) return setError('Choose an account or category and enter a name.');
    const records = cashbookEditForm.kind === 'ACCOUNT' ? accounts : categories;
    const record = records.find((item) => item.id === cashbookEditForm.accountId);
    if (!record) return setError('That account or category is no longer available. Refresh and try again.');
    const update = cashbookEditForm.kind === 'ACCOUNT'
      ? (token: string) => api.updateCashbookAccount(token, record.id, { version: record.version ?? 1, name: cashbookEditForm.name.trim() })
      : (token: string) => api.updateCashbookCategory(token, record.id, { version: record.version ?? 1, name: cashbookEditForm.name.trim() });
    void mutate(update, 'Cashbook account or category updated.').then((saved) => {
      if (saved) setCashbookEditForm({ kind: '', accountId: '', name: '' });
    });
  };
  const saveOpening = () => {
    if (!openingForm.accountId || !openingForm.amount || !openingForm.asOf) return setError('Choose an account, date and opening balance.');
    const input = { amount: openingForm.amount, asOf: localDateTimeIso(openingForm.asOf) };
    const scope = `/cashbook/accounts/${openingForm.accountId}/opening`;
    const attempt = beginIdempotentMutation(scope, input);
    void mutate((token) => api.setCashbookOpeningBalance(token, openingForm.accountId, input, attempt.key), 'Opening balance recorded.', attempt).then((saved) => {
      if (saved) setOpeningForm((current) => ({ ...current, amount: '' }));
    });
  };
  const startReconciliation = () => {
    if (!reconciliationForm.accountId || !reconciliationForm.statementStart || !reconciliationForm.statementEnd) return setError('Choose an account and statement period.');
    const input = {
      accountId: reconciliationForm.accountId, statementStart: localDateTimeIso(reconciliationForm.statementStart),
      statementEnd: localDateTimeIso(reconciliationForm.statementEnd), openingBalance: reconciliationForm.openingBalance || '0.00',
      closingBalance: reconciliationForm.closingBalance || '0.00',
    };
    const attempt = beginIdempotentMutation('/cashbook/reconciliations', input);
    void mutate((token) => api.startBankReconciliation(token, input, attempt.key), 'Reconciliation started.', attempt);
  };
  const loadReconciliationLines = async (id: string) => {
    setReconciliationId(id);
    setSelectedLineIds([]);
    try {
      const result = await withSession((token) => api.bankReconciliationLines(token, id));
      setReconciliationLines(result.items);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load reconciliation lines.'); }
  };
  const matchSelectedLines = () => {
    if (!reconciliationId || selectedLineIds.length === 0) return setError('Select at least one unreconciled bank statement line.');
    void mutate((token) => api.matchBankReconciliationLines(token, reconciliationId, selectedLineIds), 'Selected journal lines matched.').then((saved) => {
      if (saved) void loadReconciliationLines(reconciliationId);
    });
  };
  const closeReconciliation = () => {
    if (!reconciliationId) return;
    const closingId = reconciliationId;
    void mutate((token) => api.closeBankReconciliation(token, closingId), 'Reconciliation closed.').then((saved) => {
      if (saved) void loadReconciliationLines(closingId);
    });
  };
  const saveJournal = () => {
    if (!journalForm.memo.trim() || !journalForm.debitAccountId || !journalForm.creditAccountId || !journalForm.amount) return setError('Complete memo, debit account, credit account and amount.');
    if (journalForm.debitAccountId === journalForm.creditAccountId) return setError('Choose different debit and credit accounts.');
    const input = {
      memo: journalForm.memo.trim(),
      lines: [
        { accountId: journalForm.debitAccountId, debit: journalForm.amount, credit: '0.00' },
        { accountId: journalForm.creditAccountId, debit: '0.00', credit: journalForm.amount },
      ],
    };
    const attempt = beginIdempotentMutation('/accounting/journals', input);
    void mutate((token) => api.postAccountingJournal(token, input, attempt.key), 'Balanced journal entry posted.', attempt).then((saved) => {
      if (saved) setJournalForm((current) => ({ ...current, memo: '', amount: '' }));
    });
  };
  const reverseJournal = (journal: AccountingJournal) => {
    if (journal.status === 'REVERSED' || journal.reversalOfId) return;
    const reason = window.prompt(`Why are you reversing ${journal.entryNumber}?`);
    if (!reason?.trim()) return;
    const input = { reason: reason.trim() };
    const attempt = beginIdempotentMutation(`/accounting/journals/${journal.id}/reversals`, input);
    void mutate((token) => api.reverseAccountingJournal(token, journal.id, input.reason, attempt.key), 'Journal reversed with an audited counter-entry.', attempt);
  };

  if (!accessible.length) return <div className="panel empty-state"><h3>No ERP modules enabled</h3><p className="muted">Ask a business administrator to enable the modules you need. Platform administrators control which modules are available.</p></div>;

  return (
    <section className="content-stack erp-workspace">
      <div className="page-head">
        <div>
          <p className="eyebrow">Business operations</p>
          <h2>Operations & finance</h2>
          <p className="muted">Stock, suppliers, purchasing, cashbook and accounting. Records are posted to your business ledger.</p>
        </div>
        <div className="page-head-actions"><span className="status-pill">{currency} · {timezone}</span><button className="button button-secondary" onClick={() => void refresh()} disabled={!online || loading || working}><Icon name="progress" /> Refresh</button></div>
      </div>

      <nav className="segmented erp-module-tabs" aria-label="Operations modules">
        {accessible.map((item) => <button key={item.id} type="button" className={activeModule === item.id ? 'is-active' : ''} onClick={() => { setActiveModule(item.id); setError(''); setNotice(''); }}><Icon name={item.icon} />{item.label}</button>)}
      </nav>
      {!online && <div className="offline-banner" role="status">You are offline. ERP records are read-only until a connection returns; no stock or financial entries will be queued offline.</div>}
      {error && <div className="alert alert-error" role="alert">{error}<button type="button" aria-label="Dismiss" onClick={() => setError('')}>×</button></div>}
      {notice && <div className="alert alert-success" role="status">{notice}<button type="button" aria-label="Dismiss" onClick={() => setNotice('')}>×</button></div>}
      {loading && <div className="panel"><span className="muted">Loading {activeLabel.toLowerCase()}…</span></div>}
      {!accessibleActive && <div className="panel"><h3>Module access changed</h3><p className="muted">Refresh your business settings to continue.</p></div>}

      {activeModule === 'inventory' && accessibleActive && (
        <>
          <div className="metric-grid">
            <Metric label="Inventory value" value={money(inventoryValue)} icon="catalog" />
            <Metric label="Stock items" value={String(inventoryItems.length)} icon="orders" />
            <Metric label="Reorder alerts" value={String(reorderAlerts.length)} icon="warning" />
            <Metric label="Locations" value={String(locations.length)} icon="home" />
          </div>
          {reorderAlerts.length > 0 && <div className="panel erp-alert-panel"><div className="section-heading"><div><span className="panel-kicker">Attention needed</span><h3>Reorder alerts</h3></div><span className="status-pill status-pill-warning">{reorderAlerts.length} low-stock</span></div><ul className="erp-alert-list">{reorderAlerts.map((alert) => <li key={alert.variantId}><strong>{alert.itemName} · {alert.variantName}</strong><span>{alert.quantity} {alert.unit} on hand · reorder at {alert.reorderPoint} {alert.unit}</span></li>)}</ul></div>}
          <div className="panel erp-template-panel"><PanelTitle kicker="Starter worksheets" title="Download inventory templates" detail="These CSV examples are for planning and consistent data entry. They are not imported automatically and do not change business records." /><div className="page-head-actions"><button type="button" className="button button-secondary" onClick={() => downloadCsvTemplate('tailor-inventory-template.csv', [['kind', 'name', 'variant', 'sku', 'unit', 'reorderPoint', 'openingQuantity', 'openingUnitCost'], ['MATERIAL', 'Cotton fabric', 'Standard', 'FAB-001', 'metre', '20', '', '']])}>Inventory items</button><button type="button" className="button button-secondary" onClick={() => downloadCsvTemplate('tailor-suppliers-template.csv', [['name', 'contactName', 'phone', 'email', 'address', 'notes'], ['Example supplier', 'Contact name', '+92 300 0000000', 'supplier@example.test', 'Karachi', '']])}>Supplier list</button></div></div>
          <div className="erp-two-column">
            <form className="panel form-panel" onSubmit={handle(saveStockItem)}>
              <PanelTitle kicker="First-time setup" title="Add stock item" detail="An opening balance can only be entered during initial setup. Later corrections use audited stock movements." />
              <div className="form-grid">
                <label>Item name<input value={stockForm.name} onChange={(event) => setStockForm((current) => ({ ...current, name: event.target.value }))} required maxLength={160} /></label>
                <label>Kind<select value={stockForm.kind} onChange={(event) => setStockForm((current) => ({ ...current, kind: event.target.value as typeof current.kind }))}><option value="MATERIAL">Material</option><option value="SUPPLY">Supply</option><option value="PRODUCT">Product</option></select></label>
                <label>Unit<input value={stockForm.unit} onChange={(event) => setStockForm((current) => ({ ...current, unit: event.target.value }))} required placeholder="metre, piece, kg" /></label>
                <label>SKU (optional)<input value={stockForm.sku} onChange={(event) => setStockForm((current) => ({ ...current, sku: event.target.value }))} maxLength={80} /></label>
                <label>Reorder point<input type="number" min="0" step="0.000001" value={stockForm.reorderPoint} onChange={(event) => setStockForm((current) => ({ ...current, reorderPoint: event.target.value }))} /></label>
                <label>Opening quantity<input type="number" min="0.000001" step="0.000001" value={stockForm.openingQuantity} onChange={(event) => setStockForm((current) => ({ ...current, openingQuantity: event.target.value }))} /></label>
                <label>Opening unit cost ({currency})<input type="number" min="0" step="0.0001" value={stockForm.openingCost} onChange={(event) => setStockForm((current) => ({ ...current, openingCost: event.target.value }))} /></label>
              </div>
              <div className="platform-form-footer"><span className="fine-print">Opening stock is one-time and creates a ledger entry.</span><button className="button button-primary" disabled={working || !online || !writeAllowed('inventory:write')}>Save stock item</button></div>
            </form>
            <form className="panel form-panel" onSubmit={handle(saveMovement)}>
              <PanelTitle kicker="Stock ledger" title="Record a movement" detail="Receipts update weighted-average cost; consumption, returns and wastage post through the same stock ledger." />
              <div className="form-grid">
                <label className="span-all">Variant<select value={movementForm.variantId} onChange={(event) => setMovementForm((current) => ({ ...current, variantId: event.target.value }))}><option value="">Select stock item</option>{variantChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>
                <label>Movement<select value={movementForm.kind} onChange={(event) => setMovementForm((current) => ({ ...current, kind: event.target.value as typeof current.kind }))}><option value="RECEIPT">Receive stock</option><option value="CONSUMPTION">Consume / use</option><option value="CUSTOMER_RETURN">Customer return</option><option value="SUPPLIER_RETURN">Return to supplier</option><option value="WASTAGE">Wastage</option><option value="ADJUSTMENT">Manual adjustment</option></select></label>
                <label>Location<select value={movementForm.locationId} onChange={(event) => setMovementForm((current) => ({ ...current, locationId: event.target.value }))}><option value="">Default location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
                {movementForm.kind === 'ADJUSTMENT' && <label>Adjustment direction<select value={movementForm.direction} onChange={(event) => setMovementForm((current) => ({ ...current, direction: event.target.value as 'IN' | 'OUT' }))}><option value="IN">Add stock</option><option value="OUT">Remove stock</option></select></label>}
                <label>Quantity<input type="number" min="0.000001" step="0.000001" value={movementForm.quantity} onChange={(event) => setMovementForm((current) => ({ ...current, quantity: event.target.value }))} required /></label>
                {(['RECEIPT', 'CUSTOMER_RETURN'].includes(movementForm.kind) || (movementForm.kind === 'ADJUSTMENT' && movementForm.direction === 'IN')) && <label>{movementForm.kind === 'ADJUSTMENT' ? `Unit cost override (${currency}; ${adjustmentCostRequired ? 'required' : 'optional'})` : `Unit cost (${currency})`}<input type="number" min="0" step="0.0001" value={movementForm.unitCost} onChange={(event) => setMovementForm((current) => ({ ...current, unitCost: event.target.value }))} required={['RECEIPT', 'CUSTOMER_RETURN'].includes(movementForm.kind) || adjustmentCostRequired} />{movementForm.kind === 'ADJUSTMENT' && <span className="table-note">{adjustmentCostRequired ? 'A unit cost is required because this location has no stock.' : "Leave blank to use the location's current weighted-average cost."}</span>}</label>}
                <label className="span-all">Note<input value={movementForm.note} onChange={(event) => setMovementForm((current) => ({ ...current, note: event.target.value }))} maxLength={500} /></label>
              </div>
              <div className="platform-form-footer"><span className="fine-print">No unpaid customer sale is treated as cash received.</span><button className="button button-primary" disabled={working || !online || !writeAllowed('inventory:write')}>Post stock movement</button></div>
            </form>
          </div>
          <div className="erp-two-column">
            <form className="panel form-panel" onSubmit={handle(saveTransfer)}>
              <PanelTitle kicker="Multi-location stock" title="Transfer stock" detail="Transfer at the current carrying cost without changing total inventory value." />
              <div className="form-grid">
                <label className="span-all">Variant<select value={transferForm.variantId} onChange={(event) => setTransferForm((current) => ({ ...current, variantId: event.target.value }))}><option value="">Select item</option>{variantChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>
                <label>From<select value={transferForm.fromLocationId} onChange={(event) => setTransferForm((current) => ({ ...current, fromLocationId: event.target.value }))}><option value="">Choose location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
                <label>To<select value={transferForm.toLocationId} onChange={(event) => setTransferForm((current) => ({ ...current, toLocationId: event.target.value }))}><option value="">Choose location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
                <label>Quantity<input type="number" min="0.000001" step="0.000001" value={transferForm.quantity} onChange={(event) => setTransferForm((current) => ({ ...current, quantity: event.target.value }))} required /></label>
              </div>
              <div className="platform-form-footer"><span className="fine-print">Both locations must belong to this business.</span><button className="button button-secondary" disabled={working || !online || !writeAllowed('inventory:write')}>Transfer</button></div>
            </form>
            <form className="panel form-panel" onSubmit={handle(saveLocation)}>
              <PanelTitle kicker="Storage" title="Add location" detail="Create a shop, workshop, shelf or storage location." />
              <div className="form-grid"><label>Location code<input value={locationForm.code} onChange={(event) => setLocationForm((current) => ({ ...current, code: event.target.value }))} maxLength={40} required /></label><label>Location name<input value={locationForm.name} onChange={(event) => setLocationForm((current) => ({ ...current, name: event.target.value }))} maxLength={120} required /></label></div>
              <div className="platform-form-footer"><span className="fine-print">{locations.length} active locations</span><button className="button button-secondary" disabled={working || !online || !writeAllowed('inventory:write')}>Add location</button></div>
            </form>
          </div>
          <form className="panel form-panel" onSubmit={handle(saveVariant)}>
            <PanelTitle kicker="Stock catalog" title="Add a size, colour or material variant" detail="Variants keep their own stock balance and weighted-average cost. Opening stock is one-time for the new variant." />
            <div className="form-grid"><label>Stock item<select value={variantForm.itemId} onChange={(event) => setVariantForm((current) => ({ ...current, itemId: event.target.value }))}><option value="">Choose item</option>{inventoryItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Variant name<input value={variantForm.name} onChange={(event) => setVariantForm((current) => ({ ...current, name: event.target.value }))} required placeholder="Large / navy, premium fabric" /></label><label>SKU (optional)<input value={variantForm.sku} onChange={(event) => setVariantForm((current) => ({ ...current, sku: event.target.value }))} /></label><label>Opening quantity (optional)<input type="number" min="0.000001" step="0.000001" value={variantForm.openingQuantity} onChange={(event) => setVariantForm((current) => ({ ...current, openingQuantity: event.target.value }))} /></label><label>Opening unit cost ({currency})<input type="number" min="0" step="0.0001" value={variantForm.openingCost} onChange={(event) => setVariantForm((current) => ({ ...current, openingCost: event.target.value }))} /></label><label>Opening location<select value={variantForm.locationId} onChange={(event) => setVariantForm((current) => ({ ...current, locationId: event.target.value }))}><option value="">Default location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label></div>
            <div className="platform-form-footer"><span className="fine-print">The stock item and every variant remain tenant-scoped.</span><button className="button button-primary" disabled={working || !online || !writeAllowed('inventory:write')}>Save variant</button></div>
          </form>
          <PanelTitle kicker="On hand" title="Stock by variant and location" />
          <div className="table-wrap"><table><thead><tr><th>Item / variant</th><th>Location</th><th>On hand</th><th>Average cost</th><th>Value</th><th>Reorder point</th></tr></thead><tbody>
            {inventoryItems.flatMap((item) => item.variants.flatMap((variant) => variant.balances.map((balance) => <tr key={`${variant.id}:${balance.location.id}`}><td><strong>{item.name} · {variant.name}</strong><span className="table-note">{item.kind.toLowerCase()} · {variant.sku ?? 'No SKU'}</span></td><td>{balance.location.name}</td><td>{formatQuantity(balance.quantity)} {item.baseUnit}</td><td>{money(balance.averageUnitCost)}</td><td>{money(valuationRows.find((row) => row.variant.id === variant.id && row.location.id === balance.location.id)?.value ?? '0.00')}</td><td>{item.reorderPoint ?? '—'}</td></tr>)))}
            {!inventoryItems.length && <EmptyRow colSpan={6} text="No stock items yet. Add a material or supply to get started." />}
          </tbody></table></div>
          <PanelTitle kicker="Audit history" title="Recent movements" />
          <div className="table-wrap"><table><thead><tr><th>Date</th><th>Item</th><th>Movement</th><th>Quantity</th><th>Unit cost</th><th>Location</th><th>Note</th><th>Correction</th></tr></thead><tbody>{inventoryMovements.map((movement) => <tr key={movement.id}><td>{dateText(movement.occurredAt, timezone)}</td><td><strong>{movement.variant?.stockItem.name ?? 'Stock item'}</strong><span className="table-note">{movement.variant?.name}</span></td><td><span className="status-pill">{movement.kind.replaceAll('_', ' ').toLowerCase()}</span></td><td>{movement.quantity}</td><td>{money(movement.unitCost)}</td><td>{movement.location?.name ?? '—'}</td><td>{movement.note ?? '—'}</td><td>{movement.sourceType === 'MANUAL' ? <button type="button" className="button button-quiet" disabled={working || !online || !writeAllowed('inventory:write')} onClick={() => reverseStockMovement(movement)}>Reverse</button> : <span className="fine-print">Original workflow</span>}</td></tr>)}{!inventoryMovements.length && <EmptyRow colSpan={8} text="No stock activity posted yet." />}</tbody></table></div>
        </>
      )}

      {activeModule === 'suppliers' && accessibleActive && (
        <>
          <div className="metric-grid"><Metric label="Suppliers" value={String(suppliers.length)} icon="customers" /><Metric label="Active" value={String(suppliers.filter((supplier) => supplier.active).length)} icon="check" /><Metric label="Purchase orders" value={String(suppliers.reduce((total, supplier) => total + (supplier._count?.purchaseOrders ?? 0), 0))} icon="orders" /></div>
          <form className="panel form-panel" onSubmit={handle(saveSupplier)}>
            <PanelTitle kicker="Supplier directory" title={supplierEditingId ? 'Edit supplier' : 'Add supplier'} detail="Supplier details are stored only in this business workspace." />
            <div className="form-grid"><label>Name<input value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} required /></label><label>Contact name<input value={supplierForm.contactName} onChange={(event) => setSupplierForm((current) => ({ ...current, contactName: event.target.value }))} /></label><label>Phone<input type="tel" value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} /></label><label>Email<input type="email" value={supplierForm.email} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} /></label><label className="span-all">Address<input value={supplierForm.address} onChange={(event) => setSupplierForm((current) => ({ ...current, address: event.target.value }))} /></label></div>
            <div className="platform-form-footer"><span className="fine-print">{supplierEditingId ? 'Changes are version-checked and audited.' : 'Creation is idempotent; retrying does not duplicate the supplier.'}</span><div className="page-head-actions">{supplierEditingId && <button type="button" className="button button-secondary" onClick={() => { setSupplierEditingId(''); setSupplierForm({ name: '', contactName: '', phone: '', email: '', address: '' }); }}>Cancel edit</button>}<button className="button button-primary" disabled={working || !online || !writeAllowed('suppliers:write')}>{supplierEditingId ? 'Save changes' : 'Save supplier'}</button></div></div>
          </form>
          <div className="table-wrap"><table><thead><tr><th>Supplier</th><th>Contact</th><th>Phone / email</th><th>Purchases</th><th>Status</th><th>Action</th></tr></thead><tbody>{suppliers.map((supplier) => <tr key={supplier.id}><td><strong>{supplier.name}</strong><span className="table-note">{supplier.code}</span></td><td>{supplier.contactName ?? '—'}</td><td>{supplier.phone ?? supplier.email ?? '—'}</td><td>{supplier._count?.purchaseOrders ?? 0}</td><td><span className="status-pill">{supplier.active ? 'Active' : 'Inactive'}</span></td><td><div className="page-head-actions"><button type="button" className="button button-quiet" disabled={!online} onClick={() => void loadSupplierLedger(supplier.id)}>Ledger</button><button type="button" className="button button-quiet" disabled={working || !online || !writeAllowed('suppliers:write')} onClick={() => { setSupplierEditingId(supplier.id); setSupplierForm({ name: supplier.name, contactName: supplier.contactName ?? '', phone: supplier.phone ?? '', email: supplier.email ?? '', address: supplier.address ?? '' }); }}>Edit</button><button type="button" className="button button-quiet" disabled={working || !online || !writeAllowed('suppliers:write')} onClick={() => void mutate((token) => api.updateSupplier(token, supplier.id, { version: supplier.version, active: !supplier.active }), supplier.active ? 'Supplier deactivated.' : 'Supplier reactivated.')}>{supplier.active ? 'Deactivate' : 'Reactivate'}</button></div></td></tr>)}{!suppliers.length && <EmptyRow colSpan={6} text="No suppliers yet. Add the businesses that provide your materials." />}</tbody></table></div>
          {supplierLedger && <div className="panel"><PanelTitle kicker="Supplier subledger" title={`${supplierLedger.supplier.code} · ${supplierLedger.supplier.name}`} detail="Bills and settlements are shown in business-local time; payments reduce the outstanding payable." /><div className="erp-report-total is-total"><span>Supplier balance</span><strong>{money(supplierLedger.balance)}</strong></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Entry</th><th>Purchase order</th><th>Reference / note</th><th>Amount</th><th>Running balance</th></tr></thead><tbody>{supplierLedger.entries.map((entry) => <tr key={entry.id}><td>{dateText(entry.occurredAt, timezone)}</td><td>{entry.kind.toLowerCase()}</td><td>{entry.purchaseOrderNumber ?? '—'}</td><td>{entry.reference ?? entry.note ?? '—'}</td><td>{money(entry.amount)}</td><td>{money(entry.runningBalance)}</td></tr>)}{!supplierLedger.entries.length && <EmptyRow colSpan={6} text="No bills or settlements recorded for this supplier." />}</tbody></table></div><button type="button" className="button button-secondary" onClick={() => setSupplierLedger(null)}>Close ledger</button></div>}
        </>
      )}

      {activeModule === 'purchasing' && accessibleActive && (
        <>
          {(!enabledModules.includes('suppliers') || !enabledModules.includes('inventory')) && <div className="alert alert-info">Enable Suppliers and Inventory for this business before creating or receiving purchase orders.</div>}
          {enabledModules.includes('suppliers') && enabledModules.includes('inventory') && <div className="erp-two-column">
            <form className="panel form-panel" onSubmit={handle(savePurchase)}>
              <PanelTitle kicker="Supplier procurement" title="Create purchase order" detail="Choose a supplier, add a stock variant, and record the expected unit cost." />
              <div className="form-grid"><label className="span-all">Supplier<select value={purchaseForm.supplierId} onChange={(event) => setPurchaseForm((current) => ({ ...current, supplierId: event.target.value }))}><option value="">Choose supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className="span-all">Stock item<select value={purchaseForm.variantId} onChange={(event) => setPurchaseForm((current) => ({ ...current, variantId: event.target.value }))}><option value="">Choose item</option>{variantChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label><label>Quantity<input type="number" min="0.000001" step="0.000001" value={purchaseForm.quantity} onChange={(event) => setPurchaseForm((current) => ({ ...current, quantity: event.target.value }))} required /></label><label>Unit cost ({currency})<input type="number" min="0" step="0.0001" value={purchaseForm.unitCost} onChange={(event) => setPurchaseForm((current) => ({ ...current, unitCost: event.target.value }))} required /></label><label className="span-all">Notes<input value={purchaseForm.notes} onChange={(event) => setPurchaseForm((current) => ({ ...current, notes: event.target.value }))} /></label></div>
              <div className="platform-form-footer"><span className="fine-print">Receiving may be partial and is recorded separately.</span><button className="button button-primary" disabled={working || !online || !writeAllowed('purchasing:write', ['suppliers', 'inventory'])}>Create order</button></div>
            </form>
            <form className="panel form-panel" onSubmit={handle(saveReceipt)}>
              <PanelTitle kicker="Goods in" title="Receive a delivery" detail="Only received quantities increase stock. Receipts also create the corresponding purchase journal." />
              <div className="form-grid"><label className="span-all">Purchase order<select value={receiveForm.orderId} onChange={(event) => setReceiveForm({ orderId: event.target.value, lineId: '', quantity: '' })}><option value="">Choose open order</option>{purchases.filter((order) => !['RECEIVED', 'CANCELLED', 'DRAFT'].includes(order.status)).map((order) => <option key={order.id} value={order.id}>{order.orderNumber} · {order.supplier.name}</option>)}</select></label><label className="span-all">Order line<select value={receiveForm.lineId} onChange={(event) => setReceiveForm((current) => ({ ...current, lineId: event.target.value }))}><option value="">Choose outstanding line</option>{(purchases.find((order) => order.id === receiveForm.orderId)?.lines ?? []).filter((line) => line.hasRemainingQuantity).map((line) => <option key={line.id} value={line.id}>{line.variant.stockItem.name} · {line.remainingQuantity ?? '0.000000'} remaining</option>)}</select></label><label>Received quantity<input type="number" min="0.000001" step="0.000001" value={receiveForm.quantity} onChange={(event) => setReceiveForm((current) => ({ ...current, quantity: event.target.value }))} required /></label></div>
              <div className="platform-form-footer"><span className="fine-print">Over-receiving is rejected by the server.</span><button className="button button-primary" disabled={working || !online || !writeAllowed('purchasing:write', ['inventory', 'suppliers']) || !writeAllowed('inventory:write')}>Receive goods</button></div>
            </form>
          </div>}
          <form className="panel form-panel" onSubmit={handle(saveSettlement)}>
            <PanelTitle kicker="Supplier settlement" title="Pay a supplier or record a refund" detail="Each settlement reduces or reverses the supplier payable and posts against the selected cash/bank account." />
            <div className="form-grid"><label>Purchase order<select value={settlementForm.orderId} onChange={(event) => setSettlementForm((current) => ({ ...current, orderId: event.target.value }))}><option value="">Choose order</option>{purchases.filter((order) => settlementForm.kind === 'PAYMENT' ? order.hasOutstanding : order.hasRefundCapacity).map((order) => <option key={order.id} value={order.id}>{order.orderNumber} · {order.supplier.name}</option>)}</select></label><label>Action<select value={settlementForm.kind} onChange={(event) => setSettlementForm((current) => ({ ...current, kind: event.target.value as typeof current.kind }))}><option value="PAYMENT">Payment</option><option value="REFUND">Refund received</option></select></label><label>Cash / bank account<select value={settlementForm.financialAccountId} onChange={(event) => setSettlementForm((current) => ({ ...current, financialAccountId: event.target.value }))}><option value="">Choose account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label><label>Amount ({currency})<input type="number" min="0.01" step="0.01" value={settlementForm.amount} onChange={(event) => setSettlementForm((current) => ({ ...current, amount: event.target.value }))} required /></label><label className="span-all">Reference / note<input value={settlementForm.note} onChange={(event) => setSettlementForm((current) => ({ ...current, note: event.target.value }))} /></label></div>
            <div className="platform-form-footer"><span className="fine-print">Refunds are explicit reversals; prior supplier payment records are preserved.</span><button className="button button-primary" disabled={working || !online || !writeAllowed('purchasing:write') || !writeAllowed('cashbook:write') || !enabledModules.includes('cashbook') || !enabledModules.includes('suppliers')}>Post settlement</button></div>
          </form>
          <div className="table-wrap"><table><thead><tr><th>Purchase order</th><th>Supplier</th><th>Status</th><th>Ordered</th><th>Received</th><th>Supplier balance</th></tr></thead><tbody>{purchases.map((order) => <tr key={order.id}><td><strong>{order.orderNumber}</strong><span className="table-note">{order.lines.map((line) => `${line.variant.stockItem.name} ${line.receivedQuantity}/${line.orderedQuantity}`).join(' · ')}</span></td><td>{order.supplier.name}</td><td><span className="status-pill">{order.status.replaceAll('_', ' ').toLowerCase()}</span></td><td>{money(order.total)}</td><td>{money(order.receivedTotal ?? '0.00')}</td><td>{money(order.outstanding ?? order.total)}</td></tr>)}{!purchases.length && <EmptyRow colSpan={6} text="No purchase orders. Create an order before receiving goods." />}</tbody></table></div>
        </>
      )}

      {activeModule === 'cashbook' && accessibleActive && (
        <>
          {accounts.length === 0 && <div className="panel form-panel"><PanelTitle kicker="Cash and bank" title="Set up standard accounts" detail="Creates the standard cash, bank, digital wallet and ledger accounts without adding or changing any opening balances." /><button className="button button-primary" disabled={working || !online || !writeAllowed('cashbook:write')} onClick={() => void mutate((token) => api.cashbookSetup(token), 'Default cashbook accounts are ready.')}>Initialize cashbook accounts</button></div>}
          <div className="metric-grid">{accounts.map((account) => <Metric key={account.id} label={`${account.code} · ${account.name}`} value={money(account.balance)} icon="payments" />)}</div>
          <div className="panel">
            <PanelTitle kicker="Cash and bank accounts" title="Edit account names" detail="Account codes and posted history remain stable; rename accounts without changing balances." />
            <div className="table-wrap"><table><thead><tr><th>Account</th><th>Balance</th><th>Action</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id}><td><strong>{account.code} · {account.name}</strong></td><td>{money(account.balance)}</td><td><button type="button" className="button button-quiet" disabled={working || !online || !writeAllowed('cashbook:write')} onClick={() => setCashbookEditForm({ kind: 'ACCOUNT', accountId: account.id, name: account.name })}>Edit name</button></td></tr>)}{!accounts.length && <EmptyRow colSpan={3} text="Set up cash and bank accounts to get started." />}</tbody></table></div>
            {cashbookEditForm.kind === 'ACCOUNT' && <form className="form-grid" onSubmit={handle(saveCashbookName)}><label>Account name<input value={cashbookEditForm.name} onChange={(event) => setCashbookEditForm((current) => ({ ...current, name: event.target.value }))} required /></label><div className="page-head-actions"><button className="button button-primary" disabled={working || !online || !writeAllowed('cashbook:write')}>Save name</button><button type="button" className="button button-secondary" onClick={() => setCashbookEditForm({ kind: '', accountId: '', name: '' })}>Cancel</button></div></form>}
          </div>
          <div className="erp-two-column">
            <form className="panel form-panel" onSubmit={handle(saveOpening)}>
              <PanelTitle kicker="First-time setup" title="Record opening balance" detail="An opening balance is first-time setup, not a normal receipt. It cannot be posted a second time for the same account." />
              <div className="form-grid"><label>Cash / bank account<select value={openingForm.accountId} onChange={(event) => setOpeningForm((current) => ({ ...current, accountId: event.target.value }))}><option value="">Choose account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label>Balance ({currency})<input type="number" step="0.01" value={openingForm.amount} onChange={(event) => setOpeningForm((current) => ({ ...current, amount: event.target.value }))} required /></label><label>As of<input type="datetime-local" value={openingForm.asOf} onChange={(event) => setOpeningForm((current) => ({ ...current, asOf: event.target.value }))} required /></label></div>
              <div className="platform-form-footer"><span className="fine-print">Positive amounts are debit balances; negative amounts are credit balances.</span><button className="button button-secondary" disabled={working || !online || !writeAllowed('cashbook:write')}>Save opening balance</button></div>
            </form>
            <form className="panel form-panel" onSubmit={handle(saveCashTransaction)}>
              <PanelTitle kicker="Daily cashbook" title="Record receipt, expense or transfer" detail="Only money actually received or paid is recorded here." />
              <div className="form-grid"><label>Type<select value={cashForm.kind} onChange={(event) => setCashForm((current) => ({ ...current, kind: event.target.value as typeof current.kind }))}><option value="EXPENSE">Expense paid</option><option value="RECEIPT">Other income received</option><option value="TRANSFER">Cash / bank transfer</option></select></label><label>Cash / bank account<select value={cashForm.accountId} onChange={(event) => setCashForm((current) => ({ ...current, accountId: event.target.value }))}><option value="">Choose account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label>{cashForm.kind === 'TRANSFER' ? 'Destination account' : 'Category'}<select value={cashForm.contraAccountId} onChange={(event) => setCashForm((current) => ({ ...current, contraAccountId: event.target.value }))}><option value="">Choose category / account</option>{(cashForm.kind === 'TRANSFER' ? accounts.filter((account) => account.id !== cashForm.accountId) : categories.filter((category) => category.type === (cashForm.kind === 'EXPENSE' ? 'EXPENSE' : 'INCOME'))).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label><label>Amount ({currency})<input type="number" min="0.01" step="0.01" value={cashForm.amount} onChange={(event) => setCashForm((current) => ({ ...current, amount: event.target.value }))} required /></label><label className="span-all">Description<input value={cashForm.memo} onChange={(event) => setCashForm((current) => ({ ...current, memo: event.target.value }))} required maxLength={500} /></label></div>
              <div className="platform-form-footer"><span className="fine-print">Every transaction posts a balanced journal entry.</span><button className="button button-primary" disabled={working || !online || !writeAllowed('cashbook:write')}>Post cashbook transaction</button></div>
            </form>
          </div>
          <div className="erp-two-column">
            <div className="panel form-panel">
              <PanelTitle kicker="Editable categories" title="Income and expense categories" detail="Categories map cashbook entries to a general-ledger account and stay business-scoped." />
              <form onSubmit={handle(saveCategory)}><div className="form-grid"><label>Category name<input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} required /></label><label>Type<select value={categoryForm.type} onChange={(event) => setCategoryForm((current) => ({ ...current, type: event.target.value as typeof current.type }))}><option value="EXPENSE">Expense</option><option value="INCOME">Income</option></select></label></div><div className="platform-form-footer"><span className="fine-print">Categories remain business-scoped.</span><button className="button button-secondary" disabled={working || !online || !writeAllowed('cashbook:write')}>Add category</button></div></form>
              <div className="table-wrap"><table><thead><tr><th>Code / category</th><th>Type</th><th>Action</th></tr></thead><tbody>{categories.filter((category) => ['INCOME', 'EXPENSE'].includes(category.type)).map((category) => <tr key={category.id}><td><strong>{category.code} · {category.name}</strong></td><td>{category.type.toLowerCase()}</td><td><button type="button" className="button button-quiet" disabled={working || !online || !writeAllowed('cashbook:write')} onClick={() => setCashbookEditForm({ kind: 'CATEGORY', accountId: category.id, name: category.name })}>Edit name</button></td></tr>)}{!categories.length && <EmptyRow colSpan={3} text="No income or expense categories." />}</tbody></table></div>
              {cashbookEditForm.kind === 'CATEGORY' && <form className="form-grid" onSubmit={handle(saveCashbookName)}><label>Category name<input value={cashbookEditForm.name} onChange={(event) => setCashbookEditForm((current) => ({ ...current, name: event.target.value }))} required /></label><div className="page-head-actions"><button className="button button-primary" disabled={working || !online || !writeAllowed('cashbook:write')}>Save name</button><button type="button" className="button button-secondary" onClick={() => setCashbookEditForm({ kind: '', accountId: '', name: '' })}>Cancel</button></div></form>}
            </div>
            <form className="panel form-panel" onSubmit={handle(startReconciliation)}><PanelTitle kicker="Bank statement control" title="Start reconciliation" detail="Match posted cash/bank ledger lines with the statement, then close only when balances agree." /><div className="form-grid"><label>Account<select value={reconciliationForm.accountId} onChange={(event) => setReconciliationForm((current) => ({ ...current, accountId: event.target.value }))}><option value="">Choose account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label>Opening balance<input type="number" step="0.01" value={reconciliationForm.openingBalance} onChange={(event) => setReconciliationForm((current) => ({ ...current, openingBalance: event.target.value }))} /></label><label>Statement starts<input type="datetime-local" value={reconciliationForm.statementStart} onChange={(event) => setReconciliationForm((current) => ({ ...current, statementStart: event.target.value }))} required /></label><label>Statement ends<input type="datetime-local" value={reconciliationForm.statementEnd} onChange={(event) => setReconciliationForm((current) => ({ ...current, statementEnd: event.target.value }))} required /></label><label>Closing balance<input type="number" step="0.01" value={reconciliationForm.closingBalance} onChange={(event) => setReconciliationForm((current) => ({ ...current, closingBalance: event.target.value }))} /></label></div><div className="platform-form-footer"><span className="fine-print">Dates are submitted with explicit UTC offsets.</span><button className="button button-secondary" disabled={working || !online || !writeAllowed('cashbook:write')}>Start reconciliation</button></div></form>
          </div>
          <div className="erp-two-column">
            <div className="panel"><PanelTitle kicker="Statement matching" title="Open reconciliations" /><div className="erp-reconciliation-list">{reconciliations.map((item) => <button type="button" key={item.id} className={reconciliationId === item.id ? 'erp-reconciliation is-active' : 'erp-reconciliation'} onClick={() => void loadReconciliationLines(item.id)}><strong>{item.account.name}</strong><span>{dateText(item.statementStart, timezone)} – {dateText(item.statementEnd, timezone)} · {item._count.matches} matched</span><span className="status-pill">{item.status.toLowerCase()}</span></button>)}{!reconciliations.length && <p className="muted">No reconciliations created yet.</p>}</div>
              {reconciliationId && <><div className="table-wrap"><table><thead><tr><th>Match</th><th>Journal entry</th><th>Date</th><th>Memo</th><th>Signed amount</th></tr></thead><tbody>{reconciliationLines.map((line) => <tr key={line.id}><td><input type="checkbox" aria-label={`Match ${line.journalEntry.entryNumber}`} checked={line.matched || selectedLineIds.includes(line.id)} disabled={line.matched || !online || !writeAllowed('cashbook:write')} onChange={(event) => setSelectedLineIds((current) => event.target.checked ? [...current, line.id] : current.filter((id) => id !== line.id))} /></td><td>{line.journalEntry.entryNumber}</td><td>{dateText(line.journalEntry.entryDate, timezone)}</td><td><strong>{line.journalEntry.memo}</strong><span className="table-note">{line.journalEntry.sourceType}</span></td><td>{money(line.signedAmount)}</td></tr>)}{!reconciliationLines.length && <EmptyRow colSpan={5} text="No ledger lines in this statement period." />}</tbody></table></div><div className="platform-form-footer"><span className="fine-print">Closing is server-validated against statement opening + matched movements.</span><div className="page-head-actions"><button type="button" className="button button-secondary" onClick={matchSelectedLines} disabled={!online || !selectedLineIds.length || working || !writeAllowed('cashbook:write')}>Match selected</button><button type="button" className="button button-primary" onClick={closeReconciliation} disabled={!online || working || !writeAllowed('cashbook:write') || reconciliations.find((item) => item.id === reconciliationId)?.status === 'CLOSED'}>Close reconciliation</button></div></div></>}
            </div>
            <div className="table-wrap"><table><thead><tr><th>Date</th><th>Kind</th><th>Account</th><th>Category / contra</th><th>Description</th><th>Amount</th></tr></thead><tbody>{transactions.map((transaction) => <tr key={transaction.id}><td>{dateText(transaction.occurredAt, timezone)}</td><td><span className="status-pill">{transaction.kind.toLowerCase()}</span></td><td>{transaction.financialAccount?.name ?? '—'}</td><td>{transaction.contraAccount?.name ?? '—'}</td><td>{transaction.memo}</td><td>{money(transaction.amount)}</td></tr>)}{!transactions.length && <EmptyRow colSpan={6} text="Cash receipts, expenses and transfers will appear here." />}</tbody></table></div>
          </div>
        </>
      )}

      {activeModule === 'accounting' && accessibleActive && (
        <>
          {accounts.length === 0 && <div className="panel form-panel"><PanelTitle kicker="Getting started" title="Initialize the chart of accounts" detail="Creates a standard chart for inventory, purchasing, payments, expenses and owner equity. It does not post opening balances or change old records." /><button className="button button-primary" disabled={working || !online || !writeAllowed('accounting:manage')} onClick={() => void mutate((token) => api.accountingSetup(token), 'Starter chart of accounts created.')}>Set up starter chart</button></div>}
          <div className="section-heading"><div><h3>Financial reports</h3><p className="muted">Reports use posted journals and your business timezone ({timezone}). Unpaid sales are not counted as cash collected.</p></div><label className="erp-date-filter">As of<input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /></label></div>
          <div className="metric-grid"><Metric label="Income" value={money(profitLoss?.totalIncome)} icon="reports" /><Metric label="Expenses" value={money(profitLoss?.totalExpenses)} icon="payments" /><Metric label="Net profit" value={money(profitLoss?.netProfit)} icon="trendUp" /><Metric label="Total assets" value={money(balanceSheet?.totalAssets)} icon="home" /></div>
          <div className="erp-two-column">
            <div className="panel"><PanelTitle kicker="Performance" title="Profit & loss" /><div className="erp-report-total"><span>Income</span><strong>{money(profitLoss?.totalIncome)}</strong></div><div className="erp-report-total"><span>Expenses</span><strong>{money(profitLoss?.totalExpenses)}</strong></div><div className="erp-report-total is-total"><span>Net profit</span><strong>{money(profitLoss?.netProfit)}</strong></div><div className="erp-report-list"><h4>Income categories</h4>{profitLoss?.income.filter((row) => Number(row.amount) !== 0).map((row) => <div key={row.accountId}><span>{row.code} · {row.name}</span><strong>{money(row.amount)}</strong></div>)}<h4>Expense categories</h4>{profitLoss?.expenses.filter((row) => Number(row.amount) !== 0).map((row) => <div key={row.accountId}><span>{row.code} · {row.name}</span><strong>{money(row.amount)}</strong></div>)}</div></div>
            <div className="panel"><PanelTitle kicker="Position" title="Balance sheet" /><div className="erp-report-total"><span>Assets</span><strong>{money(balanceSheet?.totalAssets)}</strong></div><div className="erp-report-total"><span>Liabilities + equity</span><strong>{money(balanceSheet?.liabilitiesAndEquity)}</strong></div><div className="erp-report-total is-total"><span>Current earnings</span><strong>{money(balanceSheet?.currentEarnings)}</strong></div><div className="erp-report-list"><h4>Assets</h4>{balanceSheet?.assets.filter((row) => Number(row.balance) !== 0).map((row) => <div key={row.accountId}><span>{row.code} · {row.name}</span><strong>{money(row.balance)}</strong></div>)}</div></div>
          </div>
          <div className="erp-two-column">
            <div className="panel"><PanelTitle kicker="Control" title="Trial balance" detail="Debits and credits must remain balanced." /><div className="table-wrap"><table><thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>{trialRows.filter((row) => Number(row.debitBalance) || Number(row.creditBalance)).map((row) => <tr key={row.accountId}><td><strong>{row.name}</strong><span className="table-note">{row.code} · {row.type.toLowerCase()}</span></td><td>{money(row.debitBalance)}</td><td>{money(row.creditBalance)}</td></tr>)}<tr className="erp-total-row"><td><strong>Total</strong></td><td>{money(trialTotals.debitTotal)}</td><td>{money(trialTotals.creditTotal)}</td></tr></tbody></table></div></div>
            <div className="panel"><PanelTitle kicker="Chart of accounts" title="Accounts and categories" detail="Keep posted history intact; accounts can be deactivated, not deleted." /><div className="table-wrap"><table><thead><tr><th>Code / account</th><th>Type</th><th>Status</th><th>Cashbook</th><th>Action</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id}><td><strong>{account.code} · {account.name}</strong><span className="table-note">{account.systemKey ?? 'Custom account'}</span></td><td>{account.type.toLowerCase()}</td><td>{account.active === false ? 'Inactive' : 'Active'}</td><td>{account.cashbookEnabled ? 'Yes' : 'No'}</td><td>{account.isSystem ? <span className="fine-print">System</span> : <button className="button button-quiet" disabled={working || !online || !writeAllowed('accounting:manage')} onClick={() => { const name = window.prompt('Account name', account.name); if (name === null || !name.trim()) return; void mutate((token) => api.updateAccountingAccount(token, account.id, { version: account.version ?? 1, name: name.trim() }), 'Account updated.'); }}>{account.active === false ? 'Edit' : 'Edit'}</button>}</td></tr>)}{!accounts.length && <EmptyRow colSpan={5} text="Initialize the chart of accounts to view ledger accounts." />}</tbody></table></div></div>
          </div>
          <div className="panel">
            <PanelTitle kicker="Audit trail" title="Recent journal entries" detail="Posted entries are preserved. Correct mistakes with an audited reversal instead of editing posted history." />
            <div className="table-wrap"><table><thead><tr><th>Entry</th><th>Date</th><th>Source</th><th>Debit / credit lines</th><th>Status</th><th>Action</th></tr></thead><tbody>
              {journals.map((journal) => <tr key={journal.id}>
                <td><strong>{journal.entryNumber}</strong><span className="table-note">{journal.memo}</span></td>
                <td>{dateText(journal.entryDate, timezone)}</td>
                <td>{journal.sourceType.replaceAll('_', ' ').toLowerCase()}</td>
                <td>{journal.lines.map((line) => `${line.account.code} ${Number(line.debit) > 0 ? `Dr ${money(line.debit)}` : `Cr ${money(line.credit)}`}`).join(' · ')}</td>
                <td><span className="status-pill">{journal.status.toLowerCase()}</span></td>
                <td>{journal.status === 'POSTED' && !journal.reversalOfId
                  ? <button className="button button-quiet" disabled={working || !online || !writeAllowed('accounting:write')} onClick={() => reverseJournal(journal)}>Reverse</button>
                  : <span className="fine-print">—</span>}</td>
              </tr>)}
              {!journals.length && <EmptyRow colSpan={6} text="No journal entries have been posted yet." />}
            </tbody></table></div>
          </div>
          {writeAllowed('accounting:manage') && <div className="erp-two-column">
            <form className="panel form-panel" onSubmit={handle(saveAccount)}><PanelTitle kicker="Chart maintenance" title="Add account" detail="Use a new, unique code. Existing posted records are never deleted." /><div className="form-grid"><label>Code<input value={accountForm.code} onChange={(event) => setAccountForm((current) => ({ ...current, code: event.target.value }))} required /></label><label>Name<input value={accountForm.name} onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))} required /></label><label>Type<select value={accountForm.type} onChange={(event) => setAccountForm((current) => ({ ...current, type: event.target.value as typeof current.type }))}><option>ASSET</option><option>LIABILITY</option><option>EQUITY</option><option>INCOME</option><option>EXPENSE</option></select></label><label className="erp-checkbox"><input type="checkbox" checked={accountForm.cashbookEnabled} onChange={(event) => setAccountForm((current) => ({ ...current, cashbookEnabled: event.target.checked }))} /> Include as a cashbook account</label></div><div className="platform-form-footer"><span className="fine-print">Server permissions control chart edits.</span><button className="button button-secondary" disabled={working || !online}>Create account</button></div></form>
            <form className="panel form-panel" onSubmit={handle(saveJournal)}><PanelTitle kicker="Manual adjustment" title="Post a balanced journal" detail="Use only for documented adjustments. Normal sales, purchases and expenses are posted automatically by their workflows." /><div className="form-grid"><label className="span-all">Memo<input value={journalForm.memo} onChange={(event) => setJournalForm((current) => ({ ...current, memo: event.target.value }))} required /></label><label>Debit account<select value={journalForm.debitAccountId} onChange={(event) => setJournalForm((current) => ({ ...current, debitAccountId: event.target.value }))}><option value="">Choose account</option>{accounts.filter((account) => account.active !== false).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label><label>Credit account<select value={journalForm.creditAccountId} onChange={(event) => setJournalForm((current) => ({ ...current, creditAccountId: event.target.value }))}><option value="">Choose account</option>{accounts.filter((account) => account.active !== false).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label><label>Amount ({currency})<input type="number" min="0.01" step="0.01" value={journalForm.amount} onChange={(event) => setJournalForm((current) => ({ ...current, amount: event.target.value }))} required /></label></div><div className="platform-form-footer"><span className="fine-print">Two equal journal lines keep the entry balanced.</span><button className="button button-primary" disabled={working || !online || !writeAllowed('accounting:write')}>Post journal</button></div></form>
          </div>}
        </>
      )}
      {loading && <p className="fine-print">Refreshing reports and ledgers…</p>}
    </section>
  );
}

function PanelTitle({ kicker, title, detail }: { kicker?: string; title: string; detail?: string }) {
  return <div className="panel-heading">{kicker && <span className="panel-kicker">{kicker}</span>}<h3>{title}</h3>{detail && <p className="muted">{detail}</p>}</div>;
}
function Metric({ label, value, icon }: { label: string; value: string; icon: 'catalog' | 'orders' | 'warning' | 'home' | 'customers' | 'check' | 'payments' | 'reports' | 'trendUp' | 'inbox' }) {
  return <article className="metric-card"><span className="metric-icon"><Icon name={icon} /></span><span className="muted">{label}</span><strong>{value}</strong></article>;
}
function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return <tr><td colSpan={colSpan}><span className="muted">{text}</span></td></tr>;
}
function dateText(value: string, timezone: string) {
  try { return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: timezone }).format(new Date(value)); }
  catch { return new Date(value).toLocaleDateString(); }
}
