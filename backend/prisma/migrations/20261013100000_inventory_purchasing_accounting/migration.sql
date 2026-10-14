BEGIN;

CREATE TYPE "StockMovementKind" AS ENUM ('OPENING', 'RECEIPT', 'CONSUMPTION', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN', 'WASTAGE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT');
CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
CREATE TYPE "JournalEntryStatus" AS ENUM ('POSTED', 'REVERSED');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
CREATE TYPE "SupplierSettlementKind" AS ENUM ('PAYMENT', 'REFUND');
CREATE TYPE "CashTransactionKind" AS ENUM ('RECEIPT', 'EXPENSE', 'TRANSFER');
CREATE TYPE "ReconciliationStatus" AS ENUM ('OPEN', 'CLOSED');

ALTER TABLE "Business"
  ADD COLUMN "purchaseSequence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "supplierSequence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "journalSequence" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Order"
  ADD COLUMN "idempotencyKey" VARCHAR(120),
  ADD COLUMN "idempotencyRequestHash" CHAR(64);
CREATE UNIQUE INDEX "Order_businessId_idempotencyKey_key" ON "Order"("businessId", "idempotencyKey");

ALTER TABLE "BusinessItem" ADD COLUMN "stockVariantId" UUID;
ALTER TABLE "Payment" ADD COLUMN "financialAccountId" UUID;

CREATE TABLE "StockItem" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "kind" VARCHAR(24) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" VARCHAR(1000),
  "baseUnit" VARCHAR(40) NOT NULL,
  "reorderPoint" DECIMAL(20,6),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "idempotencyKey" VARCHAR(120),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockItem_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StockItem_id_businessId_key" ON "StockItem"("id", "businessId");
CREATE UNIQUE INDEX "StockItem_businessId_name_key" ON "StockItem"("businessId", "name");
CREATE UNIQUE INDEX "StockItem_businessId_idempotencyKey_key" ON "StockItem"("businessId", "idempotencyKey");
CREATE INDEX "StockItem_businessId_active_kind_name_idx" ON "StockItem"("businessId", "active", "kind", "name");

CREATE TABLE "StockVariant" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "stockItemId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "sku" VARCHAR(80),
  "attributes" JSONB NOT NULL DEFAULT '{}',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "idempotencyKey" VARCHAR(120),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "StockVariant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockVariant_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockVariant_stockItemId_businessId_fkey" FOREIGN KEY ("stockItemId", "businessId") REFERENCES "StockItem"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StockVariant_id_businessId_key" ON "StockVariant"("id", "businessId");
CREATE UNIQUE INDEX "StockVariant_businessId_sku_key" ON "StockVariant"("businessId", "sku");
CREATE UNIQUE INDEX "StockVariant_businessId_stockItemId_name_key" ON "StockVariant"("businessId", "stockItemId", "name");
CREATE UNIQUE INDEX "StockVariant_businessId_idempotencyKey_key" ON "StockVariant"("businessId", "idempotencyKey");
CREATE INDEX "StockVariant_businessId_stockItemId_active_idx" ON "StockVariant"("businessId", "stockItemId", "active");

CREATE TABLE "InventoryLocation" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "code" VARCHAR(40) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryLocation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InventoryLocation_id_businessId_key" ON "InventoryLocation"("id", "businessId");
CREATE UNIQUE INDEX "InventoryLocation_businessId_code_key" ON "InventoryLocation"("businessId", "code");
CREATE INDEX "InventoryLocation_businessId_active_name_idx" ON "InventoryLocation"("businessId", "active", "name");

CREATE TABLE "InventoryBalance" (
  "businessId" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "averageUnitCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "lastMovementId" UUID,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("businessId", "variantId", "locationId"),
  CONSTRAINT "InventoryBalance_quantity_check" CHECK ("quantity" >= 0),
  CONSTRAINT "InventoryBalance_averageUnitCost_check" CHECK ("averageUnitCost" >= 0),
  CONSTRAINT "InventoryBalance_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryBalance_variantId_businessId_fkey" FOREIGN KEY ("variantId", "businessId") REFERENCES "StockVariant"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryBalance_locationId_businessId_fkey" FOREIGN KEY ("locationId", "businessId") REFERENCES "InventoryLocation"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "InventoryBalance_businessId_locationId_quantity_idx" ON "InventoryBalance"("businessId", "locationId", "quantity");

CREATE TABLE "InventoryMovement" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "kind" "StockMovementKind" NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL,
  "unitCost" DECIMAL(14,4) NOT NULL,
  "totalCost" DECIMAL(14,2) NOT NULL,
  "balanceBefore" DECIMAL(20,6) NOT NULL,
  "balanceAfter" DECIMAL(20,6) NOT NULL,
  "averageCostBefore" DECIMAL(14,4) NOT NULL,
  "averageCostAfter" DECIMAL(14,4) NOT NULL,
  "sourceType" VARCHAR(40) NOT NULL,
  "sourceId" VARCHAR(100) NOT NULL,
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "note" VARCHAR(500),
  "actorId" UUID NOT NULL,
  "reversalOfId" UUID,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryMovement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryMovement_variantId_businessId_fkey" FOREIGN KEY ("variantId", "businessId") REFERENCES "StockVariant"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryMovement_locationId_businessId_fkey" FOREIGN KEY ("locationId", "businessId") REFERENCES "InventoryLocation"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryMovement_reversalOfId_businessId_fkey" FOREIGN KEY ("reversalOfId", "businessId") REFERENCES "InventoryMovement"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InventoryMovement_id_businessId_key" ON "InventoryMovement"("id", "businessId");
CREATE UNIQUE INDEX "InventoryMovement_businessId_idempotencyKey_key" ON "InventoryMovement"("businessId", "idempotencyKey");
CREATE INDEX "InventoryMovement_businessId_variantId_locationId_occurredAt_idx" ON "InventoryMovement"("businessId", "variantId", "locationId", "occurredAt");
CREATE INDEX "InventoryMovement_businessId_sourceType_sourceId_idx" ON "InventoryMovement"("businessId", "sourceType", "sourceId");

CREATE TABLE "Supplier" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "code" VARCHAR(40) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "contactName" VARCHAR(160),
  "phone" VARCHAR(32),
  "email" VARCHAR(254),
  "address" VARCHAR(1000),
  "notes" VARCHAR(2000),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "idempotencyKey" VARCHAR(120),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Supplier_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Supplier_id_businessId_key" ON "Supplier"("id", "businessId");
CREATE UNIQUE INDEX "Supplier_businessId_code_key" ON "Supplier"("businessId", "code");
CREATE UNIQUE INDEX "Supplier_businessId_idempotencyKey_key" ON "Supplier"("businessId", "idempotencyKey");
CREATE INDEX "Supplier_businessId_active_name_idx" ON "Supplier"("businessId", "active", "name");

CREATE TABLE "PurchaseOrder" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "supplierId" UUID NOT NULL,
  "orderNumber" VARCHAR(40) NOT NULL,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "orderedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt" TIMESTAMPTZ(3),
  "subtotal" DECIMAL(14,2) NOT NULL,
  "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL,
  "notes" VARCHAR(2000),
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrder_supplierId_businessId_fkey" FOREIGN KEY ("supplierId", "businessId") REFERENCES "Supplier"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PurchaseOrder_id_businessId_key" ON "PurchaseOrder"("id", "businessId");
CREATE UNIQUE INDEX "PurchaseOrder_businessId_orderNumber_key" ON "PurchaseOrder"("businessId", "orderNumber");
CREATE UNIQUE INDEX "PurchaseOrder_businessId_idempotencyKey_key" ON "PurchaseOrder"("businessId", "idempotencyKey");
CREATE INDEX "PurchaseOrder_businessId_status_orderedAt_idx" ON "PurchaseOrder"("businessId", "status", "orderedAt");
CREATE INDEX "PurchaseOrder_businessId_supplierId_orderedAt_idx" ON "PurchaseOrder"("businessId", "supplierId", "orderedAt");

CREATE TABLE "PurchaseOrderLine" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "purchaseOrderId" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "description" VARCHAR(240) NOT NULL,
  "orderedQuantity" DECIMAL(20,6) NOT NULL,
  "receivedQuantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(14,4) NOT NULL,
  "lineTotal" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseOrderLine_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrderLine_purchaseOrderId_businessId_fkey" FOREIGN KEY ("purchaseOrderId", "businessId") REFERENCES "PurchaseOrder"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrderLine_variantId_businessId_fkey" FOREIGN KEY ("variantId", "businessId") REFERENCES "StockVariant"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PurchaseOrderLine_id_businessId_key" ON "PurchaseOrderLine"("id", "businessId");
CREATE INDEX "PurchaseOrderLine_businessId_purchaseOrderId_idx" ON "PurchaseOrderLine"("businessId", "purchaseOrderId");

CREATE TABLE "PurchaseReceipt" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "purchaseOrderId" UUID NOT NULL,
  "receiptNumber" VARCHAR(40) NOT NULL,
  "invoiceReference" VARCHAR(120),
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "total" DECIMAL(14,2) NOT NULL,
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "actorId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseReceipt_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReceipt_purchaseOrderId_businessId_fkey" FOREIGN KEY ("purchaseOrderId", "businessId") REFERENCES "PurchaseOrder"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PurchaseReceipt_id_businessId_key" ON "PurchaseReceipt"("id", "businessId");
CREATE UNIQUE INDEX "PurchaseReceipt_businessId_receiptNumber_key" ON "PurchaseReceipt"("businessId", "receiptNumber");
CREATE UNIQUE INDEX "PurchaseReceipt_businessId_idempotencyKey_key" ON "PurchaseReceipt"("businessId", "idempotencyKey");
CREATE INDEX "PurchaseReceipt_businessId_receivedAt_idx" ON "PurchaseReceipt"("businessId", "receivedAt");

CREATE TABLE "PurchaseReceiptLine" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "receiptId" UUID NOT NULL,
  "purchaseOrderLineId" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL,
  "unitCost" DECIMAL(14,4) NOT NULL,
  "totalCost" DECIMAL(14,2) NOT NULL,
  CONSTRAINT "PurchaseReceiptLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseReceiptLine_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReceiptLine_receiptId_businessId_fkey" FOREIGN KEY ("receiptId", "businessId") REFERENCES "PurchaseReceipt"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReceiptLine_purchaseOrderLineId_businessId_fkey" FOREIGN KEY ("purchaseOrderLineId", "businessId") REFERENCES "PurchaseOrderLine"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReceiptLine_variantId_businessId_fkey" FOREIGN KEY ("variantId", "businessId") REFERENCES "StockVariant"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReceiptLine_locationId_businessId_fkey" FOREIGN KEY ("locationId", "businessId") REFERENCES "InventoryLocation"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PurchaseReceiptLine_id_businessId_key" ON "PurchaseReceiptLine"("id", "businessId");
CREATE INDEX "PurchaseReceiptLine_businessId_receiptId_idx" ON "PurchaseReceiptLine"("businessId", "receiptId");

CREATE TABLE "FinancialAccount" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "code" VARCHAR(40) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "type" "LedgerAccountType" NOT NULL,
  "systemKey" VARCHAR(40),
  "description" VARCHAR(500),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "cashbookEnabled" BOOLEAN NOT NULL DEFAULT false,
  "parentId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinancialAccount_parentId_businessId_fkey" FOREIGN KEY ("parentId", "businessId") REFERENCES "FinancialAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FinancialAccount_id_businessId_key" ON "FinancialAccount"("id", "businessId");
CREATE UNIQUE INDEX "FinancialAccount_businessId_code_key" ON "FinancialAccount"("businessId", "code");
CREATE UNIQUE INDEX "FinancialAccount_businessId_systemKey_key" ON "FinancialAccount"("businessId", "systemKey");
CREATE INDEX "FinancialAccount_businessId_type_active_code_idx" ON "FinancialAccount"("businessId", "type", "active", "code");

CREATE TABLE "JournalEntry" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "entryNumber" VARCHAR(40) NOT NULL,
  "entryDate" TIMESTAMPTZ(3) NOT NULL,
  "memo" VARCHAR(500) NOT NULL,
  "sourceType" VARCHAR(40) NOT NULL,
  "sourceId" VARCHAR(120) NOT NULL,
  "idempotencyKey" VARCHAR(160) NOT NULL,
  "status" "JournalEntryStatus" NOT NULL DEFAULT 'POSTED',
  "reversalOfId" UUID,
  "actorId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JournalEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JournalEntry_reversalOfId_businessId_fkey" FOREIGN KEY ("reversalOfId", "businessId") REFERENCES "JournalEntry"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "JournalEntry_id_businessId_key" ON "JournalEntry"("id", "businessId");
CREATE UNIQUE INDEX "JournalEntry_businessId_entryNumber_key" ON "JournalEntry"("businessId", "entryNumber");
CREATE UNIQUE INDEX "JournalEntry_businessId_idempotencyKey_key" ON "JournalEntry"("businessId", "idempotencyKey");
CREATE UNIQUE INDEX "JournalEntry_businessId_sourceType_sourceId_key" ON "JournalEntry"("businessId", "sourceType", "sourceId");
CREATE INDEX "JournalEntry_businessId_entryDate_entryNumber_idx" ON "JournalEntry"("businessId", "entryDate", "entryNumber");

CREATE TABLE "JournalLine" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "journalEntryId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "memo" VARCHAR(300),
  CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JournalLine_amount_check" CHECK ("debit" >= 0 AND "credit" >= 0 AND NOT ("debit" > 0 AND "credit" > 0)),
  CONSTRAINT "JournalLine_journalEntryId_businessId_fkey" FOREIGN KEY ("journalEntryId", "businessId") REFERENCES "JournalEntry"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JournalLine_accountId_businessId_fkey" FOREIGN KEY ("accountId", "businessId") REFERENCES "FinancialAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "JournalLine_id_businessId_key" ON "JournalLine"("id", "businessId");
CREATE INDEX "JournalLine_businessId_accountId_journalEntryId_idx" ON "JournalLine"("businessId", "accountId", "journalEntryId");

CREATE TABLE "SupplierSettlement" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "supplierId" UUID NOT NULL,
  "purchaseOrderId" UUID,
  "financialAccountId" UUID NOT NULL,
  "kind" "SupplierSettlementKind" NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "reference" VARCHAR(120),
  "note" VARCHAR(500),
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierSettlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierSettlement_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "SupplierSettlement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierSettlement_supplierId_businessId_fkey" FOREIGN KEY ("supplierId", "businessId") REFERENCES "Supplier"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierSettlement_purchaseOrderId_businessId_fkey" FOREIGN KEY ("purchaseOrderId", "businessId") REFERENCES "PurchaseOrder"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierSettlement_financialAccountId_businessId_fkey" FOREIGN KEY ("financialAccountId", "businessId") REFERENCES "FinancialAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SupplierSettlement_id_businessId_key" ON "SupplierSettlement"("id", "businessId");
CREATE UNIQUE INDEX "SupplierSettlement_businessId_idempotencyKey_key" ON "SupplierSettlement"("businessId", "idempotencyKey");
CREATE INDEX "SupplierSettlement_businessId_supplierId_occurredAt_idx" ON "SupplierSettlement"("businessId", "supplierId", "occurredAt");

CREATE TABLE "CashTransaction" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "kind" "CashTransactionKind" NOT NULL,
  "financialAccountId" UUID NOT NULL,
  "contraAccountId" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reference" VARCHAR(120),
  "memo" VARCHAR(500) NOT NULL,
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "actorId" UUID NOT NULL,
  "journalEntryId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashTransaction_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "CashTransaction_distinct_accounts_check" CHECK ("financialAccountId" <> "contraAccountId"),
  CONSTRAINT "CashTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CashTransaction_financialAccountId_businessId_fkey" FOREIGN KEY ("financialAccountId", "businessId") REFERENCES "FinancialAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CashTransaction_contraAccountId_businessId_fkey" FOREIGN KEY ("contraAccountId", "businessId") REFERENCES "FinancialAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CashTransaction_journalEntryId_businessId_fkey" FOREIGN KEY ("journalEntryId", "businessId") REFERENCES "JournalEntry"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CashTransaction_id_businessId_key" ON "CashTransaction"("id", "businessId");
CREATE UNIQUE INDEX "CashTransaction_businessId_idempotencyKey_key" ON "CashTransaction"("businessId", "idempotencyKey");
CREATE UNIQUE INDEX "CashTransaction_businessId_journalEntryId_key" ON "CashTransaction"("businessId", "journalEntryId");
CREATE INDEX "CashTransaction_businessId_financialAccountId_occurredAt_idx" ON "CashTransaction"("businessId", "financialAccountId", "occurredAt");

CREATE TABLE "FinancialOpeningBalance" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "asOf" TIMESTAMPTZ(3) NOT NULL,
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "actorId" UUID NOT NULL,
  "journalEntryId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialOpeningBalance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialOpeningBalance_amount_check" CHECK ("amount" <> 0),
  CONSTRAINT "FinancialOpeningBalance_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinancialOpeningBalance_accountId_businessId_fkey" FOREIGN KEY ("accountId", "businessId") REFERENCES "FinancialAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinancialOpeningBalance_journalEntryId_businessId_fkey" FOREIGN KEY ("journalEntryId", "businessId") REFERENCES "JournalEntry"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FinancialOpeningBalance_businessId_accountId_key" ON "FinancialOpeningBalance"("businessId", "accountId");
CREATE UNIQUE INDEX "FinancialOpeningBalance_businessId_idempotencyKey_key" ON "FinancialOpeningBalance"("businessId", "idempotencyKey");
CREATE UNIQUE INDEX "FinancialOpeningBalance_businessId_journalEntryId_key" ON "FinancialOpeningBalance"("businessId", "journalEntryId");

CREATE TABLE "BankReconciliation" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "statementStart" TIMESTAMPTZ(3) NOT NULL,
  "statementEnd" TIMESTAMPTZ(3) NOT NULL,
  "openingBalance" DECIMAL(14,2) NOT NULL,
  "closingBalance" DECIMAL(14,2) NOT NULL,
  "status" "ReconciliationStatus" NOT NULL DEFAULT 'OPEN',
  "idempotencyKey" VARCHAR(120),
  "actorId" UUID NOT NULL,
  "closedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BankReconciliation_statement_range_check" CHECK ("statementEnd" >= "statementStart"),
  CONSTRAINT "BankReconciliation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BankReconciliation_accountId_businessId_fkey" FOREIGN KEY ("accountId", "businessId") REFERENCES "FinancialAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BankReconciliation_id_businessId_key" ON "BankReconciliation"("id", "businessId");
CREATE UNIQUE INDEX "BankReconciliation_businessId_idempotencyKey_key" ON "BankReconciliation"("businessId", "idempotencyKey");
CREATE INDEX "BankReconciliation_businessId_accountId_statementEnd_idx" ON "BankReconciliation"("businessId", "accountId", "statementEnd");

CREATE TABLE "BankReconciliationMatch" (
  "id" UUID NOT NULL,
  "businessId" UUID NOT NULL,
  "reconciliationId" UUID NOT NULL,
  "journalLineId" UUID NOT NULL,
  "matchedById" UUID NOT NULL,
  "matchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankReconciliationMatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BankReconciliationMatch_reconciliationId_businessId_fkey" FOREIGN KEY ("reconciliationId", "businessId") REFERENCES "BankReconciliation"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BankReconciliationMatch_journalLineId_businessId_fkey" FOREIGN KEY ("journalLineId", "businessId") REFERENCES "JournalLine"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BankReconciliationMatch_businessId_reconciliationId_journalLineId_key" ON "BankReconciliationMatch"("businessId", "reconciliationId", "journalLineId");
CREATE UNIQUE INDEX "BankReconciliationMatch_businessId_journalLineId_key" ON "BankReconciliationMatch"("businessId", "journalLineId");
CREATE INDEX "BankReconciliationMatch_businessId_reconciliationId_idx" ON "BankReconciliationMatch"("businessId", "reconciliationId");

ALTER TABLE "BusinessItem"
  ADD CONSTRAINT "BusinessItem_stockVariantId_businessId_fkey"
  FOREIGN KEY ("stockVariantId", "businessId") REFERENCES "StockVariant"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_financialAccountId_businessId_fkey"
  FOREIGN KEY ("financialAccountId", "businessId") REFERENCES "FinancialAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'inventory:read', 'View inventory, valuation and stock history'),
  (gen_random_uuid(), 'inventory:write', 'Receive, consume, return, transfer and adjust stock'),
  (gen_random_uuid(), 'suppliers:read', 'View supplier records and balances'),
  (gen_random_uuid(), 'suppliers:write', 'Create and update supplier records'),
  (gen_random_uuid(), 'purchasing:read', 'View purchase orders and receiving history'),
  (gen_random_uuid(), 'purchasing:write', 'Create purchase orders, receive goods and settle suppliers'),
  (gen_random_uuid(), 'cashbook:read', 'View cash and bank accounts, transactions and reconciliation'),
  (gen_random_uuid(), 'cashbook:write', 'Record receipts, expenses and account transfers'),
  (gen_random_uuid(), 'accounting:read', 'View accounts, journals and financial statements'),
  (gen_random_uuid(), 'accounting:write', 'Post journal adjustments and financial openings'),
  (gen_random_uuid(), 'accounting:manage', 'Manage account categories and bank reconciliations')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

UPDATE "BusinessTemplate"
SET "enabledModules" = ARRAY(
  SELECT DISTINCT module
  FROM unnest("enabledModules" || ARRAY['inventory', 'suppliers', 'purchasing', 'cashbook', 'accounting']::TEXT[]) AS module
  ORDER BY module
);

INSERT INTO "RolePermissionGrant" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."key" IN (
  'inventory:read', 'inventory:write', 'suppliers:read', 'suppliers:write',
  'purchasing:read', 'purchasing:write', 'cashbook:read', 'cashbook:write',
  'accounting:read', 'accounting:write', 'accounting:manage'
)
WHERE r."businessId" IS NOT NULL AND LOWER(r."name") IN ('owner', 'admin', 'business admin')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "BusinessSetting" ("id", "businessId", "key", "value", "updatedAt")
SELECT gen_random_uuid(), b."id", 'platform_enabled_modules', to_jsonb(t."enabledModules"), CURRENT_TIMESTAMP
FROM "Business" b
JOIN "BusinessTemplate" t ON t."id" = b."templateId"
ON CONFLICT ("businessId", "key") DO NOTHING;

INSERT INTO "InventoryLocation" ("id", "businessId", "code", "name", "isDefault", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid(), b."id", 'MAIN', 'Main store', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Business" b
ON CONFLICT ("businessId", "code") DO NOTHING;

COMMIT;
