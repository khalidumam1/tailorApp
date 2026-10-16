import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { createClientId } from '../local';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { ActionButton, EmptyState, StatusPill } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';

type ErpModule = 'inventory' | 'suppliers' | 'purchasing' | 'cashbook' | 'accounting';
type StockVariant = { id: string; name: string; sku: string | null; balances: Array<{ quantity: string; averageUnitCost: string; location: { id: string; name: string } }> };
type StockItem = { id: string; kind: string; name: string; baseUnit: string; reorderPoint: string | null; active?: boolean; version?: number; variants: StockVariant[] };
type InventoryLocation = { id: string; code: string; name: string; isDefault: boolean; active: boolean };
type InventoryMovement = { id: string; kind: string; quantity: string; unitCost: string; occurredAt: string; sourceType: string; sourceId: string; note: string | null; variant: { name: string; stockItem: { name: string; baseUnit: string } }; location: { name: string } };
type Supplier = { id: string; code: string; name: string; phone: string | null; active: boolean; version: number };
type SupplierLedger = { supplier: { id: string; code: string; name: string; phone: string | null; email: string | null }; entries: Array<{ id: string; kind: string; occurredAt: string; amount: string; reference: string | null; purchaseOrderNumber: string | null; note: string | null; runningBalance: string }>; balance: string };
type PurchaseLine = { id: string; variantId: string; orderedQuantity: string; receivedQuantity: string; remainingQuantity?: string; hasRemainingQuantity?: boolean; unitCost: string; variant: { name: string; stockItem: { name: string; baseUnit: string } } };
type PurchaseOrder = { id: string; orderNumber: string; status: string; total: string; outstanding?: string; hasOutstanding?: boolean; refundCapacity?: string; hasRefundCapacity?: boolean; receivedTotal?: string; supplier: { name: string }; lines: PurchaseLine[] };
type FinancialAccount = { id: string; code: string; name: string; type: string; balance?: string; systemKey?: string | null; cashbookEnabled?: boolean; active?: boolean; isSystem?: boolean; version?: number };
type CashTransaction = { id: string; kind: string; amount: string; occurredAt: string; memo: string; financialAccount: { name: string }; contraAccount: { name: string } };
type Reconciliation = { id: string; accountId: string; statementStart: string; statementEnd: string; openingBalance: string; closingBalance: string; status: 'OPEN' | 'CLOSED'; account: { name: string }; _count: { matches: number } };
type ReconciliationLine = { id: string; debit: string; credit: string; matched: boolean; signedAmount: string; journalEntry: { id: string; entryNumber: string; entryDate: string; memo: string; sourceType: string } };
type JournalRow = { accountId: string; code: string; name: string; type: string; debitBalance: string; creditBalance: string };
type JournalEntry = { id: string; entryNumber: string; entryDate: string; memo: string; sourceType: string; status: string; reversalOfId: string | null; lines: Array<{ id: string; debit: string; credit: string; account: { code: string; name: string } }> };
type IdempotencyAttempt = { scope: string; fingerprint: string; key: string };

const MODULES: Array<{ id: ErpModule; label: string; permission: string }> = [
  { id: 'inventory', label: 'Inventory', permission: 'inventory:read' },
  { id: 'suppliers', label: 'Suppliers', permission: 'suppliers:read' },
  { id: 'purchasing', label: 'Purchasing', permission: 'purchasing:read' },
  { id: 'cashbook', label: 'Cash & bank', permission: 'cashbook:read' },
  { id: 'accounting', label: 'Accounting', permission: 'accounting:read' },
];
const isZeroQuantity = (value: string | undefined) => value === undefined || /^0+(?:\.0+)?$/.test(value);
const formatQuantity = (value: string) => value.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');

export function ErpScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const available = useMemo(() => MODULES.filter((item) => ws.moduleEnabled(item.id) && ws.can(item.permission)), [ws.moduleEnabled, ws.can, ws.businessConfiguration?.enabledModules, ws.session?.permissions]);
  const [activeModule, setActiveModule] = useState<ErpModule>('inventory');
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [stockValue, setStockValue] = useState('0.00');
  const [reorderAlerts, setReorderAlerts] = useState<Array<{ itemName: string; variantName: string; quantity: string; reorderPoint: string; unit: string }>>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierLedger, setSupplierLedger] = useState<SupplierLedger | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [cashAccounts, setCashAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<FinancialAccount[]>([]);
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>([]);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [reconciliationId, setReconciliationId] = useState('');
  const [reconciliationLines, setReconciliationLines] = useState<ReconciliationLine[]>([]);
  const [selectedReconciliationLines, setSelectedReconciliationLines] = useState<string[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [trialBalance, setTrialBalance] = useState<JournalRow[]>([]);
  const [profitLoss, setProfitLoss] = useState<{ totalIncome: string; totalExpenses: string; netProfit: string } | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<{ totalAssets: string; liabilitiesAndEquity: string; currentEarnings: string } | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemUnit, setItemUnit] = useState('metre');
  const [selectedStockItemId, setSelectedStockItemId] = useState('');
  const [variantName, setVariantName] = useState('');
  const [variantSku, setVariantSku] = useState('');
  const [variantOpeningQuantity, setVariantOpeningQuantity] = useState('');
  const [variantOpeningCost, setVariantOpeningCost] = useState('');
  const [locationCode, setLocationCode] = useState('');
  const [locationName, setLocationName] = useState('');
  const [itemKind, setItemKind] = useState<'MATERIAL' | 'PRODUCT' | 'SUPPLY'>('MATERIAL');
  const [itemSku, setItemSku] = useState('');
  const [reorderPoint, setReorderPoint] = useState('');
  const [openingQuantity, setOpeningQuantity] = useState('');
  const [openingCost, setOpeningCost] = useState('');
  const [movementVariantId, setMovementVariantId] = useState('');
  const [movementLocationId, setMovementLocationId] = useState('');
  const [movementQuantity, setMovementQuantity] = useState('');
  const [movementCost, setMovementCost] = useState('');
  const [movementKind, setMovementKind] = useState<'RECEIPT' | 'CONSUMPTION' | 'CUSTOMER_RETURN' | 'SUPPLIER_RETURN' | 'WASTAGE' | 'ADJUSTMENT'>('RECEIPT');
  const [movementDirection, setMovementDirection] = useState<'IN' | 'OUT'>('IN');
  const [stockReversalId, setStockReversalId] = useState('');
  const [stockReversalReason, setStockReversalReason] = useState('');
  const [transferVariantId, setTransferVariantId] = useState('');
  const [transferFromLocationId, setTransferFromLocationId] = useState('');
  const [transferToLocationId, setTransferToLocationId] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierEditingId, setSupplierEditingId] = useState('');
  const [purchaseSupplierId, setPurchaseSupplierId] = useState('');
  const [purchaseVariantId, setPurchaseVariantId] = useState('');
  const [purchaseQuantity, setPurchaseQuantity] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [receiveLineId, setReceiveLineId] = useState('');
  const [receiveQuantity, setReceiveQuantity] = useState('');
  const [settlementOrderId, setSettlementOrderId] = useState('');
  const [settlementKind, setSettlementKind] = useState<'PAYMENT' | 'REFUND'>('PAYMENT');
  const [settlementAccountId, setSettlementAccountId] = useState('');
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementNote, setSettlementNote] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [cashMemo, setCashMemo] = useState('');
  const [cashKind, setCashKind] = useState<'RECEIPT' | 'EXPENSE' | 'TRANSFER'>('EXPENSE');
  const [cashAccountId, setCashAccountId] = useState('');
  const [cashContraAccountId, setCashContraAccountId] = useState('');
  const [cashCategoryId, setCashCategoryId] = useState('');
  const [openingBalanceAmount, setOpeningBalanceAmount] = useState('');
  const [openingBalanceAsOf, setOpeningBalanceAsOf] = useState(new Date().toISOString());
  const [reconciliationAccountId, setReconciliationAccountId] = useState('');
  const [reconciliationStart, setReconciliationStart] = useState(new Date(Date.now() - 30 * 86_400_000).toISOString());
  const [reconciliationEnd, setReconciliationEnd] = useState(new Date().toISOString());
  const [reconciliationOpening, setReconciliationOpening] = useState('0.00');
  const [reconciliationClosing, setReconciliationClosing] = useState('0.00');
  const [categoryName, setCategoryName] = useState('');
  const [categoryType, setCategoryType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [newCashAccountName, setNewCashAccountName] = useState('');
  const [cashbookEditKind, setCashbookEditKind] = useState<'ACCOUNT' | 'CATEGORY' | ''>('');
  const [cashbookEditId, setCashbookEditId] = useState('');
  const [cashbookEditName, setCashbookEditName] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountEditingId, setAccountEditingId] = useState('');
  const [accountType, setAccountType] = useState<'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'>('EXPENSE');
  const [journalMemo, setJournalMemo] = useState('');
  const [journalDebitAccountId, setJournalDebitAccountId] = useState('');
  const [journalCreditAccountId, setJournalCreditAccountId] = useState('');
  const [journalAmount, setJournalAmount] = useState('');
  const [reversalReason, setReversalReason] = useState('');
  const idempotencyAttempts = useRef(new Map<string, Map<string, string>>());

  const beginIdempotentMutation = (scope: string, body: unknown): IdempotencyAttempt => {
    const fingerprint = JSON.stringify(body);
    const scoped = idempotencyAttempts.current.get(scope) ?? new Map<string, string>();
    const key = scoped.get(fingerprint) ?? createClientId();
    scoped.set(fingerprint, key);
    idempotencyAttempts.current.set(scope, scoped);
    return { scope, fingerprint, key };
  };
  const completeIdempotentMutation = (attempt: IdempotencyAttempt) => {
    const scoped = idempotencyAttempts.current.get(attempt.scope);
    scoped?.delete(attempt.fingerprint);
    if (scoped?.size === 0) idempotencyAttempts.current.delete(attempt.scope);
  };
  const selectCashKind = (kind: 'RECEIPT' | 'EXPENSE' | 'TRANSFER') => {
    setCashKind(kind);
    if (kind !== 'TRANSFER') {
      const matching = categories.find((account) => account.type === (kind === 'EXPENSE' ? 'EXPENSE' : 'INCOME'));
      setCashCategoryId(matching?.id ?? '');
    }
  };

  useEffect(() => {
    if (available.length && !available.some((item) => item.id === activeModule)) setActiveModule(available[0]!.id);
  }, [available, activeModule]);

  const refresh = useCallback(async () => {
    if (!ws.session || !available.some((item) => item.id === activeModule)) return;
    setLoading(true);
    setLoadError('');
    try {
      if (activeModule === 'inventory') {
        const [items, valuation, alerts, movements, locationResult] = await Promise.all([
          ws.erpRequest<{ items: StockItem[] }>('/inventory/items'),
          ws.erpRequest<{ totalValue: string }>('/inventory/valuation'),
          ws.erpRequest<{ items: typeof reorderAlerts }>('/inventory/reorder-alerts'),
          ws.erpRequest<{ items: InventoryMovement[] }>('/inventory/movements?limit=30'),
          ws.erpRequest<{ items: InventoryLocation[] }>('/inventory/locations'),
        ]);
        setStockItems(items.items);
        setStockValue(valuation.totalValue);
        setReorderAlerts(alerts.items);
        setInventoryMovements(movements.items);
        setLocations(locationResult.items);
        if (!selectedStockItemId) setSelectedStockItemId(items.items[0]?.id ?? '');
        if (!movementVariantId) setMovementVariantId(items.items[0]?.variants[0]?.id ?? '');
        if (!transferVariantId) setTransferVariantId(items.items[0]?.variants[0]?.id ?? '');
        if (!movementLocationId) setMovementLocationId(locationResult.items.find((location) => location.isDefault)?.id ?? locationResult.items[0]?.id ?? '');
        if (!transferFromLocationId) setTransferFromLocationId(locationResult.items.find((location) => location.isDefault)?.id ?? locationResult.items[0]?.id ?? '');
        if (!transferToLocationId) setTransferToLocationId(locationResult.items.find((location) => location.id !== transferFromLocationId)?.id ?? '');
      } else if (activeModule === 'suppliers') {
        const result = await ws.erpRequest<{ items: Supplier[] }>('/suppliers?includeInactive=true');
        setSuppliers(result.items);
      } else if (activeModule === 'purchasing') {
        const [orders, supplierResult, inventory, cash] = await Promise.all([
          ws.erpRequest<{ items: PurchaseOrder[] }>('/purchases'),
          ws.moduleEnabled('suppliers') ? ws.erpRequest<{ items: Supplier[] }>('/suppliers') : Promise.resolve({ items: [] as Supplier[] }),
          ws.moduleEnabled('inventory') ? ws.erpRequest<{ items: StockItem[] }>('/inventory/items') : Promise.resolve({ items: [] as StockItem[] }),
          ws.moduleEnabled('cashbook') && ws.can('cashbook:read')
            ? ws.erpRequest<{ items: FinancialAccount[] }>('/cashbook/accounts') : Promise.resolve({ items: [] as FinancialAccount[] }),
        ]);
        setPurchaseOrders(orders.items);
        setSuppliers(supplierResult.items);
        setStockItems(inventory.items);
        setCashAccounts(cash.items);
        if (!purchaseSupplierId) setPurchaseSupplierId(supplierResult.items[0]?.id ?? '');
        if (!purchaseVariantId) setPurchaseVariantId(inventory.items[0]?.variants[0]?.id ?? '');
        if (!settlementAccountId) setSettlementAccountId(cash.items[0]?.id ?? '');
        const firstLine = orders.items.flatMap((order) => order.lines.map((line) => ({ order, line })))
          .find(({ line }) => line.hasRemainingQuantity);
        if (firstLine) setReceiveLineId(firstLine.line.id);
        const firstOwingOrder = orders.items.find((order) => order.hasOutstanding);
        if (firstOwingOrder && !settlementOrderId) setSettlementOrderId(firstOwingOrder.id);
      } else if (activeModule === 'cashbook') {
        const [accountResult, categoryResult, transactions, reconciliationResult] = await Promise.all([
          ws.erpRequest<{ items: FinancialAccount[]; setupRequired: boolean }>('/cashbook/accounts'),
          ws.erpRequest<{ items: FinancialAccount[] }>('/cashbook/categories'),
          ws.erpRequest<{ items: CashTransaction[] }>('/cashbook/transactions'),
          ws.erpRequest<{ items: Reconciliation[] }>('/cashbook/reconciliations'),
        ]);
        setAccounts(accountResult.items);
        setCashAccounts(accountResult.items);
        setCategories(categoryResult.items);
        setCashTransactions(transactions.items);
        setReconciliations(reconciliationResult.items);
        const primaryCashAccountId = cashAccountId || accountResult.items[0]?.id || '';
        if (!cashAccountId) setCashAccountId(primaryCashAccountId);
        if (!cashContraAccountId || cashContraAccountId === primaryCashAccountId) {
          setCashContraAccountId(accountResult.items.find((account) => account.id !== primaryCashAccountId)?.id ?? '');
        }
        if (!reconciliationAccountId) setReconciliationAccountId(accountResult.items.find((account) => account.type === 'ASSET')?.id ?? '');
        const openReconciliation = reconciliationResult.items.find((item) => item.status === 'OPEN');
        if (openReconciliation && !reconciliationId) setReconciliationId(openReconciliation.id);
        const matchingCategory = categoryResult.items.find((account) => account.type === (cashKind === 'EXPENSE' ? 'EXPENSE' : 'INCOME'));
        if (matchingCategory && !cashCategoryId) setCashCategoryId(matchingCategory.id);
      } else {
        const [accountResult, trial, pnl, balance, journals] = await Promise.all([
          ws.erpRequest<{ items: FinancialAccount[]; setupRequired: boolean }>('/accounting/accounts'),
          ws.erpRequest<{ items: JournalRow[]; debitTotal: string; creditTotal: string }>('/accounting/reports/trial-balance'),
          ws.erpRequest<{ totalIncome: string; totalExpenses: string; netProfit: string }>('/accounting/reports/profit-loss'),
          ws.erpRequest<{ totalAssets: string; liabilitiesAndEquity: string; currentEarnings: string }>('/accounting/reports/balance-sheet'),
          ws.erpRequest<{ items: JournalEntry[] }>('/accounting/journals?limit=50'),
        ]);
        setAccounts(accountResult.items);
        setTrialBalance(trial.items);
        setProfitLoss(pnl);
        setBalanceSheet(balance);
        setJournalEntries(journals.items);
        if (!journalDebitAccountId) setJournalDebitAccountId(accountResult.items.find((account) => account.active !== false)?.id ?? '');
        if (!journalCreditAccountId) setJournalCreditAccountId(accountResult.items.find((account) => account.id !== journalDebitAccountId && account.active !== false)?.id ?? '');
      }
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : ws.copy.error);
    } finally {
      setLoading(false);
    }
  }, [activeModule, available, ws.session, ws.erpRequest, ws.moduleEnabled, ws.can, ws.copy.error,
    selectedStockItemId, movementVariantId, movementLocationId, transferVariantId, transferFromLocationId, transferToLocationId,
    purchaseSupplierId, purchaseVariantId, settlementOrderId, settlementAccountId, cashAccountId, cashContraAccountId,
    cashCategoryId, cashKind, reconciliationAccountId, reconciliationId, journalDebitAccountId, journalCreditAccountId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (operation: () => Promise<unknown>, success: string, onSuccess?: () => void) => {
    setWorking(true);
    setLoadError('');
    setNotice('');
    try {
      await operation();
      onSuccess?.();
      setNotice(success);
      await refresh();
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : ws.copy.error);
    } finally {
      setWorking(false);
    }
  };

  const submitStockItem = () => {
    if (!itemName.trim()) return setLoadError('Enter an inventory item name.');
    if (Boolean(openingQuantity.trim()) !== Boolean(openingCost.trim())) {
      return setLoadError('Enter both opening quantity and unit cost, or leave both blank.');
    }
    const opening = openingQuantity.trim() && openingCost.trim()
      ? { quantity: openingQuantity.trim(), unitCost: openingCost.trim(), ...(movementLocationId ? { locationId: movementLocationId } : {}) }
      : undefined;
    const body = {
      kind: itemKind,
      name: itemName.trim(),
      baseUnit: itemUnit.trim() || 'unit',
      ...(reorderPoint.trim() ? { reorderPoint: reorderPoint.trim() } : {}),
      variant: {
        name: 'Standard',
        ...(itemSku.trim() ? { sku: itemSku.trim() } : {}),
        ...(opening ? { opening } : {}),
      },
    };
    const attempt = beginIdempotentMutation('inventory-item', body);
    return void run(() => ws.erpRequest('/inventory/items', {
      method: 'POST', idempotencyKey: attempt.key, body,
    }), 'Inventory item saved.', () => {
      completeIdempotentMutation(attempt);
      setItemName(''); setItemSku(''); setReorderPoint(''); setOpeningQuantity(''); setOpeningCost('');
    });
  };

  const submitMovement = () => {
    if (!movementVariantId || !movementQuantity.trim()) return setLoadError('Choose a stock variant and enter a quantity.');
    if (['RECEIPT', 'CUSTOMER_RETURN'].includes(movementKind) && !movementCost.trim()) return setLoadError('Enter the cost per unit for this receipt or customer return.');
    if (adjustmentCostRequired && !movementCost.trim()) return setLoadError('Enter a unit cost when adding stock to an empty location.');
    const body = {
      variantId: movementVariantId,
      locationId: movementLocationId || undefined,
      kind: movementKind,
      ...(movementKind === 'ADJUSTMENT' ? { direction: movementDirection } : {}),
      quantity: movementQuantity.trim(),
      ...(['RECEIPT', 'CUSTOMER_RETURN'].includes(movementKind)
        || (movementKind === 'ADJUSTMENT' && movementDirection === 'IN' && movementCost.trim())
        ? { unitCost: movementCost.trim() } : {}),
      note: `Mobile ${movementKind.toLowerCase().replace('_', ' ')}`,
    };
    const attempt = beginIdempotentMutation('inventory-movement', body);
    return void run(() => ws.erpRequest('/inventory/movements', {
      method: 'POST', idempotencyKey: attempt.key, body,
    }), 'Stock movement posted.', () => {
      completeIdempotentMutation(attempt);
      setMovementQuantity(''); setMovementCost('');
    });
  };

  const reverseStockMovement = () => {
    const movement = inventoryMovements.find((item) => item.id === stockReversalId);
    if (!movement || movement.sourceType !== 'MANUAL' || !stockReversalReason.trim()) {
      return setLoadError('Choose a manual movement and enter a reason for the reversal.');
    }
    const body = { reason: stockReversalReason.trim() };
    const attempt = beginIdempotentMutation(`inventory-reversal:${movement.id}`, body);
    return void run(() => ws.erpRequest(`/inventory/movements/${movement.id}/reversals`, {
      method: 'POST', idempotencyKey: attempt.key, body,
    }), 'Stock movement reversed with an audit record.', () => {
      completeIdempotentMutation(attempt); setStockReversalId(''); setStockReversalReason('');
    });
  };

  const submitVariant = () => {
    if (!selectedStockItemId || !variantName.trim()) return setLoadError('Choose a stock item and enter a variant name.');
    if (Boolean(variantOpeningQuantity.trim()) !== Boolean(variantOpeningCost.trim())) {
      return setLoadError('Enter both opening quantity and unit cost for this variant, or leave both blank.');
    }
    const opening = variantOpeningQuantity.trim() && variantOpeningCost.trim()
      ? { quantity: variantOpeningQuantity.trim(), unitCost: variantOpeningCost.trim(), ...(movementLocationId ? { locationId: movementLocationId } : {}) }
      : undefined;
    const body = {
      name: variantName.trim(),
      ...(variantSku.trim() ? { sku: variantSku.trim() } : {}),
      ...(opening ? { opening } : {}),
    };
    const attempt = beginIdempotentMutation(`inventory-variant:${selectedStockItemId}`, body);
    return void run(() => ws.erpRequest(`/inventory/items/${selectedStockItemId}/variants`, {
      method: 'POST', idempotencyKey: attempt.key, body,
    }), 'Variant saved.', () => {
      completeIdempotentMutation(attempt); setVariantName(''); setVariantSku(''); setVariantOpeningQuantity(''); setVariantOpeningCost('');
    });
  };

  const createInventoryLocation = () => {
    if (locationCode.trim().length < 2 || !locationName.trim()) return setLoadError('Enter a location code (at least 2 characters) and name.');
    const body = { code: locationCode.trim(), name: locationName.trim() };
    return void run(() => ws.erpRequest('/inventory/locations', { method: 'POST', body }), 'Inventory location created.', () => {
      setLocationCode(''); setLocationName('');
    });
  };

  const submitTransfer = () => {
    if (!transferVariantId || !transferFromLocationId || !transferToLocationId || !transferQuantity.trim()) {
      return setLoadError('Choose a variant, both locations, and the transfer quantity.');
    }
    if (transferFromLocationId === transferToLocationId) return setLoadError('Choose two different locations.');
    const body = {
      variantId: transferVariantId,
      fromLocationId: transferFromLocationId,
      toLocationId: transferToLocationId,
      quantity: transferQuantity.trim(),
      note: 'Mobile inventory transfer',
    };
    const attempt = beginIdempotentMutation('inventory-transfer', body);
    return void run(() => ws.erpRequest('/inventory/transfers', {
      method: 'POST', idempotencyKey: attempt.key, body,
    }), 'Stock transferred between locations.', () => {
      completeIdempotentMutation(attempt); setTransferQuantity('');
    });
  };

  const submitSupplier = () => {
    if (!supplierName.trim()) return setLoadError('Enter a supplier name.');
    const body = { name: supplierName.trim(), phone: supplierPhone.trim() || null };
    const attempt = beginIdempotentMutation('supplier-create', body);
    return void run(() => ws.erpRequest('/suppliers', {
      method: 'POST', idempotencyKey: attempt.key, body,
    }), 'Supplier saved.', () => {
      completeIdempotentMutation(attempt); setSupplierName(''); setSupplierPhone('');
    });
  };

  const submitSupplierUpdate = () => {
    const supplier = suppliers.find((item) => item.id === supplierEditingId);
    if (!supplier || !supplierName.trim()) return setLoadError('Choose a supplier and enter a name.');
    const body = { version: supplier.version, name: supplierName.trim(), phone: supplierPhone.trim() || null };
    return void run(() => ws.erpRequest(`/suppliers/${supplier.id}`, { method: 'PATCH', body }), 'Supplier updated.', () => {
      setSupplierEditingId(''); setSupplierName(''); setSupplierPhone('');
    });
  };

  const toggleSupplierActive = (supplier: Supplier) => void run(
    () => ws.erpRequest(`/suppliers/${supplier.id}`, { method: 'PATCH', body: { version: supplier.version, active: !supplier.active } }),
    supplier.active ? 'Supplier archived.' : 'Supplier restored.',
    () => { if (supplierEditingId === supplier.id) setSupplierEditingId(''); },
  );

  const loadSupplierLedger = async (supplierId: string) => {
    setWorking(true); setLoadError('');
    try {
      const result = await ws.erpRequest<SupplierLedger>(`/suppliers/${supplierId}/ledger`);
      setSupplierLedger(result);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : ws.copy.error);
    } finally { setWorking(false); }
  };

  const submitPurchaseOrder = () => {
    if (!purchaseSupplierId || !purchaseVariantId || !purchaseQuantity.trim() || !purchaseCost.trim()) {
      return setLoadError('Choose a supplier and stock item, then enter quantity and unit cost.');
    }
    const body = { supplierId: purchaseSupplierId, lines: [{ variantId: purchaseVariantId, quantity: purchaseQuantity.trim(), unitCost: purchaseCost.trim() }] };
    const attempt = beginIdempotentMutation('purchase-order', body);
    return void run(() => ws.erpRequest('/purchases', {
      method: 'POST', idempotencyKey: attempt.key, body,
    }), 'Purchase order created.', () => {
      completeIdempotentMutation(attempt); setPurchaseQuantity(''); setPurchaseCost('');
    });
  };

  const submitReceipt = () => {
    const target = purchaseOrders.flatMap((order) => order.lines.map((line) => ({ order, line }))).find(({ line }) => line.id === receiveLineId);
    if (!target || !receiveQuantity.trim()) return setLoadError('Choose an outstanding purchase line and enter the received quantity.');
    const body = { lines: [{ purchaseOrderLineId: target.line.id, quantity: receiveQuantity.trim() }] };
    const attempt = beginIdempotentMutation(`purchase-receipt:${target.order.id}`, body);
    return void run(() => ws.erpRequest(`/purchases/${target.order.id}/receive`, {
      method: 'POST', idempotencyKey: attempt.key, body,
    }), 'Goods received into inventory.', () => {
      completeIdempotentMutation(attempt); setReceiveQuantity('');
    });
  };

  const submitSupplierSettlement = () => {
    if (!settlementOrderId || !settlementOrders.some((order) => order.id === settlementOrderId) || !settlementAccountId || !settlementAmount.trim()) {
      return setLoadError('Choose an eligible purchase order and cash or bank account, then enter an amount.');
    }
    const body = {
      kind: settlementKind,
      financialAccountId: settlementAccountId,
      amount: settlementAmount.trim(),
      note: settlementNote.trim() || null,
    };
    const attempt = beginIdempotentMutation(`supplier-settlement:${settlementOrderId}`, body);
    return void run(() => ws.erpRequest(`/purchases/${settlementOrderId}/settlements`, {
      method: 'POST', idempotencyKey: attempt.key, body,
    }), settlementKind === 'PAYMENT' ? 'Supplier payment recorded.' : 'Supplier refund recorded.', () => {
      completeIdempotentMutation(attempt); setSettlementAmount(''); setSettlementNote('');
    });
  };

  const submitCashTransaction = () => {
    const contraAccountId = cashKind === 'TRANSFER' ? cashContraAccountId : cashCategoryId;
    if (!cashAccountId || !contraAccountId || !cashAmount.trim() || !cashMemo.trim()) {
      return setLoadError('Choose the required account and category, then enter an amount and description.');
    }
    if (cashKind === 'TRANSFER' && cashAccountId === contraAccountId) return setLoadError('Choose two different cash or bank accounts.');
    const body = { kind: cashKind, financialAccountId: cashAccountId, contraAccountId, amount: cashAmount.trim(), memo: cashMemo.trim() };
    const attempt = beginIdempotentMutation('cashbook-transaction', body);
    return void run(() => ws.erpRequest('/cashbook/transactions', {
      method: 'POST', idempotencyKey: attempt.key, body,
    }), cashKind === 'TRANSFER' ? 'Account transfer posted.' : 'Cashbook transaction posted.', () => {
      completeIdempotentMutation(attempt); setCashAmount(''); setCashMemo('');
    });
  };

  const submitOpeningBalance = () => {
    if (!cashAccountId || !openingBalanceAmount.trim() || Number(openingBalanceAmount) === 0) {
      return setLoadError('Choose an account and enter a non-zero opening balance.');
    }
    const body = { amount: openingBalanceAmount.trim(), asOf: openingBalanceAsOf };
    const attempt = beginIdempotentMutation(`cash-opening:${cashAccountId}`, body);
    return void run(() => ws.erpRequest(`/cashbook/accounts/${cashAccountId}/opening`, {
      method: 'POST', idempotencyKey: attempt.key, body,
    }), 'Opening balance recorded.', () => {
      completeIdempotentMutation(attempt); setOpeningBalanceAmount('');
    });
  };

  const createCashAccount = () => {
    if (!newCashAccountName.trim()) return setLoadError('Enter an account name.');
    const code = `C${Date.now().toString().slice(-7)}`;
    return void run(() => ws.erpRequest('/cashbook/accounts', {
      method: 'POST', body: { code, name: newCashAccountName.trim() },
    }), 'Cash or bank account created.', () => setNewCashAccountName(''));
  };

  const createCategory = () => {
    if (!categoryName.trim()) return setLoadError('Enter a category name.');
    const code = `X${Date.now().toString().slice(-7)}`;
    return void run(() => ws.erpRequest('/cashbook/categories', {
      method: 'POST', body: { code, name: categoryName.trim(), type: categoryType },
    }), 'Category created.', () => setCategoryName(''));
  };

  const updateCashbookName = () => {
    const record = (cashbookEditKind === 'ACCOUNT' ? cashAccounts : categories).find((item) => item.id === cashbookEditId);
    if (!record || !cashbookEditName.trim()) return setLoadError('Choose an account or category and enter its name.');
    const route = cashbookEditKind === 'ACCOUNT' ? `/cashbook/accounts/${record.id}` : `/cashbook/categories/${record.id}`;
    const body = { version: record.version ?? 1, name: cashbookEditName.trim() };
    return void run(() => ws.erpRequest(route, { method: 'PATCH', body }), 'Cashbook account or category updated.', () => {
      setCashbookEditKind(''); setCashbookEditId(''); setCashbookEditName('');
    });
  };

  const submitReconciliation = () => {
    if (!reconciliationAccountId) return setLoadError('Choose a cash or bank account to reconcile.');
    const body = {
      accountId: reconciliationAccountId,
      statementStart: reconciliationStart,
      statementEnd: reconciliationEnd,
      openingBalance: reconciliationOpening.trim(),
      closingBalance: reconciliationClosing.trim(),
    };
    const attempt = beginIdempotentMutation('bank-reconciliation', body);
    return void run(async () => {
      const created = await ws.erpRequest<{ id: string }>('/cashbook/reconciliations', {
        method: 'POST', idempotencyKey: attempt.key, body,
      });
      setReconciliationId(created.id);
      const lines = await ws.erpRequest<{ items: ReconciliationLine[] }>(`/cashbook/reconciliations/${created.id}/lines`);
      setReconciliationLines(lines.items); setSelectedReconciliationLines([]);
    }, 'Reconciliation started.', () => completeIdempotentMutation(attempt));
  };

  const loadReconciliationLines = async (id = reconciliationId) => {
    if (!id) return setLoadError('Choose a reconciliation to review.');
    setWorking(true); setLoadError('');
    try {
      const result = await ws.erpRequest<{ items: ReconciliationLine[] }>(`/cashbook/reconciliations/${id}/lines`);
      setReconciliationId(id); setReconciliationLines(result.items); setSelectedReconciliationLines([]);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : ws.copy.error);
    } finally { setWorking(false); }
  };

  const matchReconciliationLines = () => {
    if (!reconciliationId || !selectedReconciliationLines.length) return setLoadError('Select one or more statement lines to match.');
    return void run(async () => {
      await ws.erpRequest(`/cashbook/reconciliations/${reconciliationId}/matches`, {
        method: 'POST', body: { journalLineIds: selectedReconciliationLines },
      });
      const result = await ws.erpRequest<{ items: ReconciliationLine[] }>(`/cashbook/reconciliations/${reconciliationId}/lines`);
      setReconciliationLines(result.items); setSelectedReconciliationLines([]);
    }, 'Selected statement lines matched.');
  };

  const closeReconciliation = () => {
    if (!reconciliationId) return setLoadError('Choose a reconciliation to close.');
    return void run(async () => {
      await ws.erpRequest(`/cashbook/reconciliations/${reconciliationId}/close`, { method: 'POST', body: {} });
      const result = await ws.erpRequest<{ items: ReconciliationLine[] }>(`/cashbook/reconciliations/${reconciliationId}/lines`);
      setReconciliationLines(result.items);
    }, 'Reconciliation closed.');
  };

  const createAccountingAccount = () => {
    if (!accountCode.trim() || !accountName.trim()) return setLoadError('Enter an account code and name.');
    const body = { code: accountCode.trim(), name: accountName.trim(), type: accountType };
    return void run(() => ws.erpRequest('/accounting/accounts', { method: 'POST', body }), 'Account created.', () => {
      setAccountCode(''); setAccountName('');
    });
  };

  const saveAccountingAccountName = () => {
    const account = accounts.find((item) => item.id === accountEditingId);
    if (!account || !accountName.trim()) return setLoadError('Choose an account and enter its name.');
    return void run(() => ws.erpRequest(`/accounting/accounts/${account.id}`, {
      method: 'PATCH', body: { version: account.version ?? 1, name: accountName.trim() },
    }), 'Account name updated.', () => { setAccountEditingId(''); setAccountName(''); });
  };

  const toggleAccountingAccount = (account: FinancialAccount) => void run(
    () => ws.erpRequest(`/accounting/accounts/${account.id}`, {
      method: 'PATCH', body: { version: account.version ?? 1, active: account.active === false },
    }),
    account.active === false ? 'Account activated.' : 'Account deactivated.',
  );

  const submitManualJournal = () => {
    if (!journalMemo.trim() || !journalDebitAccountId || !journalCreditAccountId || !journalAmount.trim()) {
      return setLoadError('Enter a memo, select two accounts, and provide the journal amount.');
    }
    if (journalDebitAccountId === journalCreditAccountId) return setLoadError('Choose two different accounts for a balanced journal.');
    const body = {
      memo: journalMemo.trim(),
      lines: [
        { accountId: journalDebitAccountId, debit: journalAmount.trim(), credit: '0.00' },
        { accountId: journalCreditAccountId, debit: '0.00', credit: journalAmount.trim() },
      ],
    };
    const attempt = beginIdempotentMutation('manual-journal', body);
    return void run(() => ws.erpRequest('/accounting/journals', {
      method: 'POST', idempotencyKey: attempt.key, body,
    }), 'Manual journal posted.', () => {
      completeIdempotentMutation(attempt); setJournalMemo(''); setJournalAmount('');
    });
  };

  const reverseJournal = (entryId: string) => {
    const reason = reversalReason.trim();
    if (!reason) return setLoadError('Enter a reason for this journal reversal.');
    const body = { reason };
    const attempt = beginIdempotentMutation(`journal-reversal:${entryId}`, body);
    return void run(() => ws.erpRequest(`/accounting/journals/${entryId}/reversals`, {
      method: 'POST', idempotencyKey: attempt.key, body,
    }), 'Journal reversed with an audit entry.', () => {
      completeIdempotentMutation(attempt); setReversalReason('');
    });
  };

  const setupChart = (module: 'cashbook' | 'accounting') => void run(
    () => ws.erpRequest(module === 'cashbook' ? '/cashbook/setup' : '/accounting/setup', { method: 'POST' }),
    'Default accounts are ready.',
  );

  const currency = ws.businessConfiguration?.business.currency ?? 'PKR';
  const formatMoney = (value: string | undefined) => value === undefined
    ? '—' : new Intl.NumberFormat('en-PK', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value));
  const variantOptions = stockItems.flatMap((item) => item.variants.map((variant) => ({ id: variant.id, label: `${item.name} · ${variant.name}` })));
  const selectedMovementVariant = stockItems.flatMap((item) => item.variants).find((variant) => variant.id === movementVariantId);
  const selectedMovementLocationId = movementLocationId || locations.find((location) => location.isDefault)?.id || locations[0]?.id;
  const movementBalance = selectedMovementVariant?.balances.find((balance) => balance.location.id === selectedMovementLocationId);
  const adjustmentCostRequired = movementKind === 'ADJUSTMENT' && movementDirection === 'IN' && isZeroQuantity(movementBalance?.quantity);
  const openLines = purchaseOrders.flatMap((order) => order.lines.map((line) => ({ order, line })))
    .filter(({ line }) => line.hasRemainingQuantity);
  const settlementOrders = purchaseOrders.filter((order) => settlementKind === 'PAYMENT'
    ? order.hasOutstanding
    : order.hasRefundCapacity);
  const selectedReconciliation = reconciliations.find((item) => item.id === reconciliationId);
  const selectedCashAccount = cashAccounts.find((item) => item.id === cashAccountId);
  if (!available.length) {
    return <EmptyState title="No ERP modules enabled" detail="Ask your business administrator to enable the modules you need. Platform administrators must allow each module first." />;
  }

  return (
    <View>
      <View style={styles.pageHeadingRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>Operations & finance</Text>
          <Text style={styles.pageSubtitle}>Manage stock, suppliers, purchasing, cash and accounts in one place.</Text>
        </View>
      </View>
      <View style={styles.chipWrap}>
        {available.map((item) => (
          <Pressable key={item.id} onPress={() => { setActiveModule(item.id); setNotice(''); setLoadError(''); }} style={[styles.chip, activeModule === item.id && styles.chipSelected]}>
            <Text style={[styles.chipText, activeModule === item.id && styles.chipTextSelected]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
{loadError ? <Text accessibilityRole="alert" style={styles.errorBanner}>{loadError}</Text> : null}
      {notice ? <View style={styles.card}><Text style={{ color: palette.success }}>{notice}</Text></View> : null}
      {loading ? <View style={styles.centered}><ActivityIndicator color={palette.primary} /></View> : null}

      {activeModule === 'inventory' ? (
        <>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Stock value · {currency}</Text>
            <Text style={styles.heroAmount}>{formatMoney(stockValue)}</Text>
            <Text style={styles.heroSubLabel}>Weighted-average cost valuation</Text>
          </View>
          {reorderAlerts.length > 0 ? (
            <View style={[styles.card, styles.cardAccentAmber]}>
              <Text style={styles.sectionTitle}>Reorder alerts · {reorderAlerts.length}</Text>
              {reorderAlerts.slice(0, 5).map((alert, index) => <Text key={`${alert.itemName}:${index}`} style={styles.listMeta}>{alert.itemName} · {alert.variantName}: {alert.quantity} {alert.unit} (reorder at {alert.reorderPoint})</Text>)}
            </View>
          ) : null}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Add stock item</Text>
            <Text style={styles.fieldLabel}>Item type</Text>
            <View style={styles.chipWrap}>{(['MATERIAL', 'PRODUCT', 'SUPPLY'] as const).map((kind) => <Pressable key={kind} onPress={() => setItemKind(kind)} style={[styles.chip, itemKind === kind && styles.chipSelected]}><Text style={[styles.chipText, itemKind === kind && styles.chipTextSelected]}>{kind.toLowerCase()}</Text></Pressable>)}</View>
            <Field label="Material / item name" value={itemName} onChangeText={setItemName} />
            <Field label="Variant SKU (optional)" value={itemSku} onChangeText={setItemSku} />
            <Field label="Unit" value={itemUnit} onChangeText={setItemUnit} placeholder="metre, piece, kg" />
            <Field label="Reorder alert at (optional)" value={reorderPoint} onChangeText={setReorderPoint} keyboardType="decimal-pad" />
            {locations.length > 1 ? <><Text style={styles.fieldLabel}>Opening stock location</Text><HorizontalPicker options={locations.map((location) => ({ id: location.id, label: location.name }))} selected={movementLocationId} onSelect={setMovementLocationId} /></> : null}
            <Field label="Opening quantity (optional, first-time only)" value={openingQuantity} onChangeText={setOpeningQuantity} keyboardType="decimal-pad" />
            <Field label={`Opening unit cost (${currency})`} value={openingCost} onChangeText={setOpeningCost} keyboardType="decimal-pad" />
            <Text style={styles.listMeta}>Opening balances can only be posted once. Later corrections must use an audited stock adjustment.</Text>
            <ActionButton title="Save item" onPress={submitStockItem} loading={working} disabled={!ws.can('inventory:write')} />
          </View>
          {stockItems.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.listRow}><Text style={styles.listTitle}>{item.name}</Text><StatusPill tone="muted">{item.kind}</StatusPill></View>
              {item.variants.map((variant) => (
                <View key={variant.id} style={styles.listRow}>
                  <Text style={styles.listMeta}>{variant.name}{variant.sku ? ` · ${variant.sku}` : ''}</Text>
                  <Text style={styles.listPrice}>{variant.balances.map((balance) => `${balance.location.name}: ${formatQuantity(balance.quantity)} ${item.baseUnit}`).join(' · ') || 'No recorded balance'}</Text>
                </View>
              ))}
            </View>
          ))}
          {stockItems.length > 0 ? <View style={styles.card}>
            <Text style={styles.sectionTitle}>Add a variant</Text>
            <Text style={styles.fieldLabel}>Stock item</Text>
            <HorizontalPicker options={stockItems.map((item) => ({ id: item.id, label: item.name }))} selected={selectedStockItemId} onSelect={setSelectedStockItemId} />
            <Field label="Variant name (size, colour, type)" value={variantName} onChangeText={setVariantName} placeholder="e.g. Large / Navy" />
            <Field label="SKU (optional)" value={variantSku} onChangeText={setVariantSku} />
            <Field label="Opening quantity (optional)" value={variantOpeningQuantity} onChangeText={setVariantOpeningQuantity} keyboardType="decimal-pad" />
            <Field label={`Opening unit cost (${currency})`} value={variantOpeningCost} onChangeText={setVariantOpeningCost} keyboardType="decimal-pad" />
            <ActionButton title="Save variant" onPress={submitVariant} secondary loading={working} disabled={!ws.can('inventory:write')} />
          </View> : null}
          {variantOptions.length > 0 ? <View style={styles.card}>
            <Text style={styles.sectionTitle}>Record stock movement</Text>
            <View style={styles.chipWrap}>{(['RECEIPT', 'CONSUMPTION', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN', 'WASTAGE', 'ADJUSTMENT'] as const).map((kind) => <Pressable key={kind} onPress={() => setMovementKind(kind)} style={[styles.chip, movementKind === kind && styles.chipSelected]}><Text style={[styles.chipText, movementKind === kind && styles.chipTextSelected]}>{kind.toLowerCase().replaceAll('_', ' ')}</Text></Pressable>)}</View>
            <HorizontalPicker options={variantOptions} selected={movementVariantId} onSelect={setMovementVariantId} />
            {locations.length > 1 ? <><Text style={styles.fieldLabel}>Location</Text><HorizontalPicker options={locations.map((location) => ({ id: location.id, label: location.name }))} selected={movementLocationId} onSelect={setMovementLocationId} /></> : null}
            {movementKind === 'ADJUSTMENT' ? <><Text style={styles.fieldLabel}>Adjustment direction</Text><View style={styles.chipWrap}>{(['IN', 'OUT'] as const).map((direction) => <Pressable key={direction} onPress={() => setMovementDirection(direction)} style={[styles.chip, movementDirection === direction && styles.chipSelected]}><Text style={[styles.chipText, movementDirection === direction && styles.chipTextSelected]}>{direction === 'IN' ? 'Add stock' : 'Remove stock'}</Text></Pressable>)}</View></> : null}
            <Field label="Quantity" value={movementQuantity} onChangeText={setMovementQuantity} keyboardType="decimal-pad" />
            {(['RECEIPT', 'CUSTOMER_RETURN'].includes(movementKind) || (movementKind === 'ADJUSTMENT' && movementDirection === 'IN')) ? <Field label={movementKind === 'ADJUSTMENT' ? `Unit cost override (${currency}${adjustmentCostRequired ? '; required' : '; optional'})` : `${movementKind === 'RECEIPT' ? 'Purchase' : 'Return'} unit cost (${currency})`} value={movementCost} onChangeText={setMovementCost} keyboardType="decimal-pad" /> : null}
            <ActionButton title="Post movement" onPress={submitMovement} loading={working} disabled={!ws.can('inventory:write')} />
          </View> : null}
          {locations.length > 1 && variantOptions.length > 0 ? <View style={styles.card}>
            <Text style={styles.sectionTitle}>Transfer between locations</Text>
            <HorizontalPicker options={variantOptions} selected={transferVariantId} onSelect={setTransferVariantId} />
            <Text style={styles.fieldLabel}>From location</Text><HorizontalPicker options={locations.map((location) => ({ id: location.id, label: location.name }))} selected={transferFromLocationId} onSelect={setTransferFromLocationId} />
            <Text style={styles.fieldLabel}>To location</Text><HorizontalPicker options={locations.map((location) => ({ id: location.id, label: location.name }))} selected={transferToLocationId} onSelect={setTransferToLocationId} />
            <Field label="Quantity to transfer" value={transferQuantity} onChangeText={setTransferQuantity} keyboardType="decimal-pad" />
            <ActionButton title="Transfer stock" onPress={submitTransfer} loading={working} disabled={!ws.can('inventory:write')} />
          </View> : null}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Inventory locations</Text>
            <Text style={styles.listMeta}>{locations.map((location) => `${location.name}${location.isDefault ? ' · default' : ''}`).join(' · ') || 'The first stock activity creates a default location automatically.'}</Text>
            <Field label="Location code" value={locationCode} onChangeText={setLocationCode} placeholder="e.g. SHOP-2" />
            <Field label="Location name" value={locationName} onChangeText={setLocationName} placeholder="Workshop, storage room" />
            <ActionButton title="Add location" onPress={createInventoryLocation} secondary loading={working} disabled={!ws.can('inventory:write')} />
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Recent stock history</Text>
            {inventoryMovements.slice(0, 15).map((movement) => <View key={movement.id} style={styles.card}>
              <View style={styles.listRow}><View style={{ flex: 1 }}><Text style={styles.listTitle}>{movement.variant.stockItem.name} · {movement.kind.toLowerCase().replaceAll('_', ' ')}</Text><Text style={styles.listMeta}>{movement.location.name} · {new Date(movement.occurredAt).toLocaleString()}{movement.note ? ` · ${movement.note}` : ''}</Text></View><Text style={styles.listPrice}>{movement.quantity} {movement.variant.stockItem.baseUnit}</Text></View>
              {movement.sourceType === 'MANUAL' ? <ActionButton title={stockReversalId === movement.id ? 'Selected for reversal' : 'Reverse movement'} onPress={() => setStockReversalId((current) => current === movement.id ? '' : movement.id)} secondary disabled={working || !ws.can('inventory:write')} /> : null}
              {stockReversalId === movement.id ? <><Field label="Reason for stock reversal" value={stockReversalReason} onChangeText={setStockReversalReason} /><ActionButton title="Confirm reversal" onPress={reverseStockMovement} loading={working} disabled={!ws.can('inventory:write') || !stockReversalReason.trim()} /><ActionButton title="Cancel" onPress={() => { setStockReversalId(''); setStockReversalReason(''); }} secondary disabled={working} /></> : null}
            </View>)}
            {!inventoryMovements.length && !loading ? <Text style={styles.listMeta}>Stock receipts, adjustments and consumption will appear here.</Text> : null}
          </View>
        </>
      ) : null}

      {activeModule === 'suppliers' ? (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{supplierEditingId ? 'Edit supplier' : 'Add supplier'}</Text>
            <Field label="Supplier name" value={supplierName} onChangeText={setSupplierName} />
            <Field label="Phone (optional)" value={supplierPhone} onChangeText={setSupplierPhone} keyboardType="phone-pad" />
            <ActionButton title={supplierEditingId ? 'Save supplier changes' : 'Save supplier'} onPress={supplierEditingId ? submitSupplierUpdate : submitSupplier} loading={working} disabled={!ws.can('suppliers:write')} />
            {supplierEditingId ? <ActionButton title="Cancel edit" onPress={() => { setSupplierEditingId(''); setSupplierName(''); setSupplierPhone(''); }} secondary disabled={working} /> : null}
          </View>
          {suppliers.map((supplier) => <View key={supplier.id} style={styles.card}><View style={styles.listRow}><View style={styles.listMain}><Text style={styles.listTitle}>{supplier.name}</Text><Text style={styles.listMeta}>{supplier.code}{supplier.phone ? ` · ${supplier.phone}` : ''}</Text></View><StatusPill tone={supplier.active ? 'mint' : 'muted'}>{supplier.active ? 'Active' : 'Inactive'}</StatusPill></View><View style={styles.listRow}><ActionButton title="Ledger" onPress={() => void loadSupplierLedger(supplier.id)} secondary loading={working} disabled={false} /><ActionButton title="Edit" onPress={() => { setSupplierEditingId(supplier.id); setSupplierName(supplier.name); setSupplierPhone(supplier.phone ?? ''); }} secondary disabled={working || !ws.can('suppliers:write')} /><ActionButton title={supplier.active ? 'Archive' : 'Restore'} onPress={() => toggleSupplierActive(supplier)} secondary loading={working} disabled={!ws.can('suppliers:write')} /></View></View>)}
          {supplierLedger ? <View style={styles.card}><Text style={styles.sectionTitle}>{supplierLedger.supplier.code} · {supplierLedger.supplier.name}</Text><Text style={styles.listMeta}>Supplier balance: {formatMoney(supplierLedger.balance)}</Text>{supplierLedger.entries.map((entry) => <View key={entry.id} style={styles.listRow}><View style={{ flex: 1 }}><Text style={styles.listTitle}>{entry.kind} · {entry.purchaseOrderNumber ?? entry.reference ?? 'Supplier transaction'}</Text><Text style={styles.listMeta}>{new Date(entry.occurredAt).toLocaleDateString()}{entry.note ? ` · ${entry.note}` : ''}</Text></View><View><Text style={styles.listPrice}>{formatMoney(entry.amount)}</Text><Text style={styles.listMeta}>Balance {formatMoney(entry.runningBalance)}</Text></View></View>)}<ActionButton title="Close ledger" onPress={() => setSupplierLedger(null)} secondary /></View> : null}
          {!suppliers.length && !loading ? <EmptyState title="No suppliers yet" detail="Add the people and businesses that provide your materials." /> : null}
        </>
      ) : null}

      {activeModule === 'purchasing' ? (
        <>
          {!ws.moduleEnabled('suppliers') || !ws.moduleEnabled('inventory') ? <View style={[styles.card, styles.cardAccentAmber]}><Text style={styles.listTitle}>Purchasing setup</Text><Text style={styles.listMeta}>Enable Suppliers and Inventory for your business to create and receive purchase orders.</Text></View> : null}
          {ws.moduleEnabled('suppliers') && ws.moduleEnabled('inventory') ? <View style={styles.card}>
            <Text style={styles.sectionTitle}>New purchase order</Text>
            <Text style={styles.fieldLabel}>Supplier</Text>
            <HorizontalPicker options={suppliers.map((supplier) => ({ id: supplier.id, label: supplier.name }))} selected={purchaseSupplierId} onSelect={setPurchaseSupplierId} />
            <Text style={styles.fieldLabel}>Stock item</Text>
            <HorizontalPicker options={variantOptions} selected={purchaseVariantId} onSelect={setPurchaseVariantId} />
            <Field label="Quantity" value={purchaseQuantity} onChangeText={setPurchaseQuantity} keyboardType="decimal-pad" />
            <Field label="Unit cost" value={purchaseCost} onChangeText={setPurchaseCost} keyboardType="decimal-pad" />
            <ActionButton title="Create purchase order" onPress={submitPurchaseOrder} loading={working} disabled={!ws.can('purchasing:write')} />
          </View> : null}
          {openLines.length > 0 ? <View style={styles.card}>
            <Text style={styles.sectionTitle}>Receive goods</Text>
            <HorizontalPicker options={openLines.map(({ order, line }) => ({ id: line.id, label: `${order.orderNumber} · ${line.variant.stockItem.name} (${line.remainingQuantity ?? '0.000000'} ${line.variant.stockItem.baseUnit} left)` }))} selected={receiveLineId} onSelect={setReceiveLineId} />
            <Field label="Received quantity" value={receiveQuantity} onChangeText={setReceiveQuantity} keyboardType="decimal-pad" />
            <ActionButton title="Receive into inventory" onPress={submitReceipt} loading={working} disabled={!ws.can('purchasing:write') || !ws.moduleEnabled('inventory')} />
          </View> : null}
          {ws.moduleEnabled('cashbook') && ws.can('cashbook:write') ? <View style={styles.card}>
            <Text style={styles.sectionTitle}>Supplier payment or refund</Text>
            <View style={styles.chipWrap}>{(['PAYMENT', 'REFUND'] as const).map((kind) => <Pressable key={kind} onPress={() => setSettlementKind(kind)} style={[styles.chip, settlementKind === kind && styles.chipSelected]}><Text style={[styles.chipText, settlementKind === kind && styles.chipTextSelected]}>{kind.toLowerCase()}</Text></Pressable>)}</View>
            <Text style={styles.fieldLabel}>Purchase order</Text>
            <HorizontalPicker options={settlementOrders.map((order) => ({ id: order.id, label: `${order.orderNumber} · ${order.supplier.name} · ${formatMoney(settlementKind === 'PAYMENT' ? order.outstanding : order.refundCapacity)} ${settlementKind === 'PAYMENT' ? 'due' : 'paid'}` }))} selected={settlementOrderId} onSelect={setSettlementOrderId} />
            <Text style={styles.fieldLabel}>Pay from / refund to</Text>
            <HorizontalPicker options={cashAccounts.map((account) => ({ id: account.id, label: account.name }))} selected={settlementAccountId} onSelect={setSettlementAccountId} />
            <Field label="Amount" value={settlementAmount} onChangeText={setSettlementAmount} keyboardType="decimal-pad" />
            <Field label="Note (optional)" value={settlementNote} onChangeText={setSettlementNote} />
            <ActionButton title={settlementKind === 'PAYMENT' ? 'Record supplier payment' : 'Record supplier refund'} onPress={submitSupplierSettlement} loading={working} disabled={!ws.can('purchasing:write') || !ws.can('cashbook:write') || !ws.moduleEnabled('cashbook') || !ws.moduleEnabled('suppliers') || !cashAccounts.length || !settlementOrders.length} />
          </View> : <View style={styles.card}><Text style={styles.listTitle}>Supplier settlements need Cash & Bank</Text><Text style={styles.listMeta}>Enable Cash & Bank and grant cashbook write permission to record supplier payments or refunds.</Text></View>}
          {purchaseOrders.map((order) => <View key={order.id} style={styles.listCard}><View style={styles.listMain}><Text style={styles.listTitle}>{order.orderNumber} · {order.supplier.name}</Text><Text style={styles.listMeta}>{order.lines.map((line) => `${line.variant.stockItem.name}: ${line.receivedQuantity}/${line.orderedQuantity}`).join(' · ')}{order.receivedTotal !== undefined ? ` · received ${formatMoney(order.receivedTotal)}` : ''}</Text><Text style={styles.listMeta}>Outstanding: {formatMoney(order.outstanding)}</Text></View><View><StatusPill tone={order.status === 'RECEIVED' ? 'mint' : 'amber'}>{order.status.replaceAll('_', ' ')}</StatusPill><Text style={styles.listPrice}>{formatMoney(order.total)}</Text></View></View>)}
          {!purchaseOrders.length && !loading ? <EmptyState title="No purchases yet" detail="Create a purchase order, then receive goods as deliveries arrive." /> : null}
        </>
      ) : null}

      {activeModule === 'cashbook' ? (
        <>
          {accounts.length === 0 ? <View style={styles.card}><Text style={styles.sectionTitle}>Set up cash and bank accounts</Text><Text style={styles.listMeta}>This creates the standard cash, bank and digital-wallet accounts. Existing business balances are not changed.</Text><ActionButton title="Set up accounts" onPress={() => setupChart('cashbook')} loading={working} disabled={!ws.can('cashbook:write')} /></View> : null}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Accounts</Text>
            {accounts.map((account) => <View key={account.id} style={styles.listRow}><Pressable onPress={() => setCashAccountId(account.id)} style={{ flex: 1 }}><Text style={[styles.listTitle, cashAccountId === account.id && { color: palette.primaryText }]}>{account.name}</Text><Text style={styles.listPrice}>{formatMoney(account.balance)}</Text></Pressable><ActionButton title="Edit" onPress={() => { setCashbookEditKind('ACCOUNT'); setCashbookEditId(account.id); setCashbookEditName(account.name); }} secondary disabled={working || !ws.can('cashbook:write')} /></View>)}
            <Field label="Add cash / bank account" value={newCashAccountName} onChangeText={setNewCashAccountName} />
            <ActionButton title="Add account" onPress={createCashAccount} secondary loading={working} disabled={!ws.can('cashbook:write')} />
            {cashbookEditKind === 'ACCOUNT' ? <><Field label="Edit account name" value={cashbookEditName} onChangeText={setCashbookEditName} /><ActionButton title="Save account name" onPress={updateCashbookName} loading={working} disabled={!ws.can('cashbook:write')} /><ActionButton title="Cancel edit" onPress={() => { setCashbookEditKind(''); setCashbookEditId(''); setCashbookEditName(''); }} secondary disabled={working} /></> : null}
          </View>
          {selectedCashAccount ? <View style={styles.card}>
            <Text style={styles.sectionTitle}>First-time opening balance</Text>
            <Text style={styles.listMeta}>{selectedCashAccount.name}. This posts once to opening equity. If this account already has activity, use an audited transaction or journal correction instead.</Text>
            <Field label="Balance (negative for overdraft)" value={openingBalanceAmount} onChangeText={setOpeningBalanceAmount} keyboardType="decimal-pad" />
            <Field label="As of (ISO date/time)" value={openingBalanceAsOf} onChangeText={setOpeningBalanceAsOf} />
            <ActionButton title="Record opening balance" onPress={submitOpeningBalance} loading={working} disabled={!ws.can('cashbook:write')} />
          </View> : null}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Record cashbook activity</Text>
            <View style={styles.chipWrap}>{(['EXPENSE', 'RECEIPT', 'TRANSFER'] as const).map((kind) => <Pressable key={kind} onPress={() => selectCashKind(kind)} style={[styles.chip, cashKind === kind && styles.chipSelected]}><Text style={[styles.chipText, cashKind === kind && styles.chipTextSelected]}>{kind.toLowerCase()}</Text></Pressable>)}</View>
            <Text style={styles.fieldLabel}>{cashKind === 'EXPENSE' ? 'Pay from' : cashKind === 'RECEIPT' ? 'Receive into' : 'Transfer from'}</Text>
            <HorizontalPicker options={cashAccounts.map((account) => ({ id: account.id, label: account.name }))} selected={cashAccountId} onSelect={(id) => { setCashAccountId(id); if (cashContraAccountId === id) setCashContraAccountId(cashAccounts.find((account) => account.id !== id)?.id ?? ''); }} />
            {cashKind === 'TRANSFER' ? <><Text style={styles.fieldLabel}>Transfer to</Text><HorizontalPicker options={cashAccounts.filter((account) => account.id !== cashAccountId).map((account) => ({ id: account.id, label: account.name }))} selected={cashContraAccountId} onSelect={setCashContraAccountId} /></> : <>
              <Text style={styles.fieldLabel}>Category</Text>
              <HorizontalPicker options={categories.filter((category) => category.type === (cashKind === 'EXPENSE' ? 'EXPENSE' : 'INCOME')).map((category) => ({ id: category.id, label: category.name }))} selected={cashCategoryId} onSelect={setCashCategoryId} />
            </>}
            <Field label="Amount" value={cashAmount} onChangeText={setCashAmount} keyboardType="decimal-pad" />
            <Field label="Description" value={cashMemo} onChangeText={setCashMemo} />
            {cashKind !== 'TRANSFER' ? <>
              <Text style={styles.fieldLabel}>New category type</Text>
              <View style={styles.chipWrap}>{(['EXPENSE', 'INCOME'] as const).map((type) => <Pressable key={type} onPress={() => setCategoryType(type)} style={[styles.chip, categoryType === type && styles.chipSelected]}><Text style={[styles.chipText, categoryType === type && styles.chipTextSelected]}>{type.toLowerCase()}</Text></Pressable>)}</View>
              <Field label="New category name" value={categoryName} onChangeText={setCategoryName} />
              <ActionButton title="Add category" onPress={createCategory} secondary loading={working} disabled={!ws.can('cashbook:write')} />
              <Text style={styles.fieldLabel}>Existing categories</Text>
              {categories.filter((category) => ['INCOME', 'EXPENSE'].includes(category.type)).map((category) => <View key={category.id} style={styles.listRow}><Text style={styles.listMeta}>{category.type.toLowerCase()} · {category.name}</Text><ActionButton title="Edit" onPress={() => { setCashbookEditKind('CATEGORY'); setCashbookEditId(category.id); setCashbookEditName(category.name); }} secondary disabled={working || !ws.can('cashbook:write')} /></View>)}
              {cashbookEditKind === 'CATEGORY' ? <><Field label="Edit category name" value={cashbookEditName} onChangeText={setCashbookEditName} /><ActionButton title="Save category name" onPress={updateCashbookName} loading={working} disabled={!ws.can('cashbook:write')} /><ActionButton title="Cancel edit" onPress={() => { setCashbookEditKind(''); setCashbookEditId(''); setCashbookEditName(''); }} secondary disabled={working} /></> : null}
            </> : null}
            <ActionButton title={cashKind === 'TRANSFER' ? 'Post transfer' : cashKind === 'EXPENSE' ? 'Record expense' : 'Record receipt'} onPress={submitCashTransaction} loading={working} disabled={!ws.can('cashbook:write')} />
          </View>
          {cashTransactions.map((transaction) => <View key={transaction.id} style={styles.listCard}><View style={styles.listMain}><Text style={styles.listTitle}>{transaction.memo} · {transaction.kind.toLowerCase()}</Text><Text style={styles.listMeta}>{transaction.financialAccount.name} · {transaction.contraAccount.name} · {new Date(transaction.occurredAt).toLocaleDateString()}</Text></View><Text style={styles.listPrice}>{formatMoney(transaction.amount)}</Text></View>)}
          {!cashTransactions.length && !loading ? <EmptyState title="No cashbook entries" detail="Recorded receipts, expenses and transfers will appear here." /> : null}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Bank reconciliation</Text>
            <Text style={styles.listMeta}>Match posted account activity against a statement. Closing is allowed only when the selected lines reconcile exactly.</Text>
            <Text style={styles.fieldLabel}>Cash / bank account</Text>
            <HorizontalPicker options={cashAccounts.map((account) => ({ id: account.id, label: account.name }))} selected={reconciliationAccountId} onSelect={setReconciliationAccountId} />
            <Field label="Statement starts (ISO date/time)" value={reconciliationStart} onChangeText={setReconciliationStart} />
            <Field label="Statement ends (ISO date/time)" value={reconciliationEnd} onChangeText={setReconciliationEnd} />
            <Field label="Statement opening balance" value={reconciliationOpening} onChangeText={setReconciliationOpening} keyboardType="decimal-pad" />
            <Field label="Statement closing balance" value={reconciliationClosing} onChangeText={setReconciliationClosing} keyboardType="decimal-pad" />
            <ActionButton title="Start reconciliation" onPress={submitReconciliation} loading={working} disabled={!ws.can('cashbook:write')} />
            <Text style={styles.fieldLabel}>Existing reconciliations</Text>
            {reconciliations.map((reconciliation) => <Pressable key={reconciliation.id} onPress={() => void loadReconciliationLines(reconciliation.id)} style={[styles.listRow, { paddingVertical: 6 }]}><Text style={[styles.listTitle, reconciliationId === reconciliation.id && { color: palette.primaryText }]}>{reconciliation.account.name} · {new Date(reconciliation.statementEnd).toLocaleDateString()}</Text><StatusPill tone={reconciliation.status === 'CLOSED' ? 'mint' : 'amber'}>{reconciliation.status}</StatusPill></Pressable>)}
            {selectedReconciliation ? <>
              <Text style={styles.listMeta}>Opening {formatMoney(selectedReconciliation.openingBalance)} · closing {formatMoney(selectedReconciliation.closingBalance)} · {selectedReconciliation._count.matches} matched</Text>
              {reconciliationLines.map((line) => <Pressable key={line.id} disabled={line.matched} onPress={() => setSelectedReconciliationLines((current) => current.includes(line.id) ? current.filter((id) => id !== line.id) : [...current, line.id])} style={[styles.listRow, { paddingVertical: 6, opacity: line.matched ? 0.55 : 1 }]}><View style={{ flex: 1 }}><Text style={styles.listTitle}>{line.journalEntry.memo}</Text><Text style={styles.listMeta}>{line.journalEntry.entryNumber} · {new Date(line.journalEntry.entryDate).toLocaleDateString()} · {line.matched ? 'Matched' : 'Tap to select'}</Text></View><Text style={styles.listPrice}>{formatMoney(line.signedAmount)}</Text></Pressable>)}
              {selectedReconciliation.status === 'OPEN' ? <>
                <ActionButton title={`Match selected (${selectedReconciliationLines.length})`} onPress={matchReconciliationLines} secondary loading={working} disabled={!ws.can('cashbook:write') || !selectedReconciliationLines.length} />
                <ActionButton title="Close reconciliation" onPress={closeReconciliation} loading={working} disabled={!ws.can('cashbook:write')} />
              </> : null}
            </> : null}
          </View>
        </>
      ) : null}

      {activeModule === 'accounting' ? (
        <>
          {accounts.length === 0 ? <View style={styles.card}><Text style={styles.sectionTitle}>Initialize the chart of accounts</Text><Text style={styles.listMeta}>Set up a practical starter chart. This does not add opening balances or alter existing records.</Text><ActionButton title="Set up chart" onPress={() => setupChart('accounting')} loading={working} disabled={!ws.can('accounting:manage')} /></View> : null}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Manage accounts</Text>
            <Text style={styles.listMeta}>Add a business-specific account category or balance-sheet account. Posted history is preserved when accounts are deactivated.</Text>
            <Field label="Account code" value={accountCode} onChangeText={setAccountCode} />
            <Field label="Account name" value={accountName} onChangeText={setAccountName} />
            <Text style={styles.fieldLabel}>Account type</Text>
            <View style={styles.chipWrap}>{(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] as const).map((type) => <Pressable key={type} onPress={() => setAccountType(type)} style={[styles.chip, accountType === type && styles.chipSelected]}><Text style={[styles.chipText, accountType === type && styles.chipTextSelected]}>{type.toLowerCase()}</Text></Pressable>)}</View>
            <ActionButton title="Create account" onPress={createAccountingAccount} secondary loading={working} disabled={!ws.can('accounting:manage')} />
            {accountEditingId ? <><Field label="Rename selected account" value={accountName} onChangeText={setAccountName} /><ActionButton title="Save account name" onPress={saveAccountingAccountName} loading={working} disabled={!ws.can('accounting:manage')} /><ActionButton title="Cancel edit" onPress={() => { setAccountEditingId(''); setAccountName(''); }} secondary disabled={working} /></> : null}
            <Text style={styles.fieldLabel}>Existing accounts</Text>
            {accounts.map((account) => <View key={account.id} style={styles.listRow}><View style={{ flex: 1 }}><Text style={styles.listTitle}>{account.code} · {account.name}</Text><Text style={styles.listMeta}>{account.type.toLowerCase()} · {account.active === false ? 'inactive' : 'active'}{account.cashbookEnabled ? ' · cashbook' : ''}</Text></View><ActionButton title="Edit" onPress={() => { setAccountEditingId(account.id); setAccountName(account.name); }} secondary disabled={working || !ws.can('accounting:manage')} />{account.isSystem ? null : <ActionButton title={account.active === false ? 'Restore' : 'Archive'} onPress={() => toggleAccountingAccount(account)} secondary loading={working} disabled={!ws.can('accounting:manage')} />}</View>)}
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Manual journal</Text>
            <Text style={styles.listMeta}>Each entry must balance. Use this for documented corrections and opening adjustments, never to overwrite posted history.</Text>
            <Field label="Journal memo" value={journalMemo} onChangeText={setJournalMemo} />
            <Text style={styles.fieldLabel}>Debit account</Text>
            <HorizontalPicker options={accounts.filter((account) => account.active !== false).map((account) => ({ id: account.id, label: `${account.code} · ${account.name}` }))} selected={journalDebitAccountId} onSelect={setJournalDebitAccountId} />
            <Text style={styles.fieldLabel}>Credit account</Text>
            <HorizontalPicker options={accounts.filter((account) => account.active !== false).map((account) => ({ id: account.id, label: `${account.code} · ${account.name}` }))} selected={journalCreditAccountId} onSelect={setJournalCreditAccountId} />
            <Field label={`Amount (${currency})`} value={journalAmount} onChangeText={setJournalAmount} keyboardType="decimal-pad" />
            <ActionButton title="Post balanced journal" onPress={submitManualJournal} loading={working} disabled={!ws.can('accounting:write')} />
          </View>
          {profitLoss ? <View style={styles.card}><Text style={styles.sectionTitle}>Profit & loss · all time</Text><View style={styles.listRow}><Text style={styles.listMeta}>Income</Text><Text style={styles.listPrice}>{formatMoney(profitLoss.totalIncome)}</Text></View><View style={styles.listRow}><Text style={styles.listMeta}>Expenses</Text><Text style={styles.listPrice}>{formatMoney(profitLoss.totalExpenses)}</Text></View><View style={styles.listRow}><Text style={styles.listTitle}>Net profit</Text><Text style={styles.listPrice}>{formatMoney(profitLoss.netProfit)}</Text></View></View> : null}
          {balanceSheet ? <View style={styles.card}><Text style={styles.sectionTitle}>Balance sheet · today</Text><View style={styles.listRow}><Text style={styles.listMeta}>Assets</Text><Text style={styles.listPrice}>{formatMoney(balanceSheet.totalAssets)}</Text></View><View style={styles.listRow}><Text style={styles.listMeta}>Liabilities & equity</Text><Text style={styles.listPrice}>{formatMoney(balanceSheet.liabilitiesAndEquity)}</Text></View><View style={styles.listRow}><Text style={styles.listMeta}>Current earnings</Text><Text style={styles.listPrice}>{formatMoney(balanceSheet.currentEarnings)}</Text></View></View> : null}
          <View style={styles.card}><Text style={styles.sectionTitle}>Trial balance</Text>{trialBalance.filter((row) => Number(row.debitBalance) || Number(row.creditBalance)).slice(0, 12).map((row) => <View key={row.code} style={styles.listRow}><View style={{ flex: 1 }}><Text style={styles.listTitle}>{row.name}</Text><Text style={styles.listMeta}>{row.code} · {row.type.toLowerCase()}</Text></View><Text style={styles.listPrice}>{formatMoney(Number(row.debitBalance) ? row.debitBalance : row.creditBalance)}</Text></View>)}{!trialBalance.length && !loading ? <Text style={styles.listMeta}>No posted journal activity yet.</Text> : null}</View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Recent journal entries · audit trail</Text>
            <Field label="Reason for reversal" value={reversalReason} onChangeText={setReversalReason} />
            {journalEntries.map((entry) => <View key={entry.id} style={[styles.card, { marginTop: 8, marginBottom: 0 }]}>
              <View style={styles.listRow}><View style={{ flex: 1 }}><Text style={styles.listTitle}>#{entry.entryNumber} · {entry.memo}</Text><Text style={styles.listMeta}>{entry.sourceType.replaceAll('_', ' ')} · {new Date(entry.entryDate).toLocaleString()}</Text></View><StatusPill tone={entry.status === 'POSTED' ? 'mint' : 'muted'}>{entry.status}</StatusPill></View>
              {entry.lines.map((line) => <View key={line.id} style={styles.listRow}><Text style={styles.listMeta}>{line.account.code} · {line.account.name}</Text><Text style={styles.listMeta}>{Number(line.debit) ? `Dr ${formatMoney(line.debit)}` : `Cr ${formatMoney(line.credit)}`}</Text></View>)}
              {entry.status === 'POSTED' && !entry.reversalOfId ? <ActionButton title="Reverse this entry" onPress={() => reverseJournal(entry.id)} secondary loading={working} disabled={!ws.can('accounting:write') || !reversalReason.trim()} /> : null}
            </View>)}
            {!journalEntries.length && !loading ? <Text style={styles.listMeta}>No journal entries have been posted yet.</Text> : null}
          </View>
        </>
      ) : null}

      <ActionButton title="Refresh" onPress={() => void refresh()} secondary disabled={loading || working} />
    </View>
  );
}

function Field({ label, value, onChangeText, keyboardType = 'default', placeholder }: { label: string; value: string; onChangeText: (value: string) => void; keyboardType?: 'default' | 'decimal-pad' | 'phone-pad'; placeholder?: string }) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} keyboardType={keyboardType} placeholder={placeholder ?? label} placeholderTextColor={palette.mutedText} style={styles.input} /></View>;
}

function HorizontalPicker({ options, selected, onSelect }: { options: Array<{ id: string; label: string }>; selected: string; onSelect: (id: string) => void }) {
  const styles = useAppStyles();
  return <View style={styles.chipWrap}>{options.length ? options.map((option) => <Pressable key={option.id} onPress={() => onSelect(option.id)} style={[styles.chip, selected === option.id && styles.chipSelected]}><Text style={[styles.chipText, selected === option.id && styles.chipTextSelected]} numberOfLines={1}>{option.label}</Text></Pressable>) : <Text style={styles.listMeta}>No options available.</Text>}</View>;
}
