BEGIN;

-- Prisma requires the unique fields for a one-to-one composite relation to be
-- declared in the same order as the relation's `fields` list.
DROP INDEX "CashTransaction_businessId_journalEntryId_key";
CREATE UNIQUE INDEX "CashTransaction_journalEntryId_businessId_key"
  ON "CashTransaction"("journalEntryId", "businessId");

DROP INDEX "FinancialOpeningBalance_businessId_journalEntryId_key";
CREATE UNIQUE INDEX "FinancialOpeningBalance_journalEntryId_businessId_key"
  ON "FinancialOpeningBalance"("journalEntryId", "businessId");

COMMIT;
