import { Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { HttpError } from '../errors.js';
import { assertJournalBalanced } from './erp-finance.js';

export const SYSTEM_ACCOUNT_KEYS = [
  'CASH', 'BANK', 'DIGITAL', 'ACCOUNTS_RECEIVABLE', 'INVENTORY', 'ACCOUNTS_PAYABLE',
  'OPENING_EQUITY', 'SALES_REVENUE', 'COST_OF_GOODS_SOLD', 'INVENTORY_ADJUSTMENT',
  'OTHER_INCOME', 'GENERAL_EXPENSE',
] as const;
export type SystemAccountKey = typeof SYSTEM_ACCOUNT_KEYS[number];

const DEFAULT_ACCOUNTS: ReadonlyArray<{
  systemKey: SystemAccountKey;
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  cashbookEnabled?: boolean;
}> = [
  { systemKey: 'CASH', code: '1000', name: 'Cash on hand', type: 'ASSET', cashbookEnabled: true },
  { systemKey: 'BANK', code: '1010', name: 'Bank accounts', type: 'ASSET', cashbookEnabled: true },
  { systemKey: 'DIGITAL', code: '1020', name: 'Digital wallets', type: 'ASSET', cashbookEnabled: true },
  { systemKey: 'ACCOUNTS_RECEIVABLE', code: '1100', name: 'Accounts receivable', type: 'ASSET' },
  { systemKey: 'INVENTORY', code: '1200', name: 'Inventory', type: 'ASSET' },
  { systemKey: 'ACCOUNTS_PAYABLE', code: '2000', name: 'Accounts payable', type: 'LIABILITY' },
  { systemKey: 'OPENING_EQUITY', code: '3000', name: 'Opening balance equity', type: 'EQUITY' },
  { systemKey: 'SALES_REVENUE', code: '4000', name: 'Sales revenue', type: 'INCOME' },
  { systemKey: 'COST_OF_GOODS_SOLD', code: '5000', name: 'Cost of goods sold', type: 'EXPENSE' },
  { systemKey: 'INVENTORY_ADJUSTMENT', code: '5900', name: 'Inventory adjustments', type: 'EXPENSE' },
  { systemKey: 'OTHER_INCOME', code: '7000', name: 'Other income', type: 'INCOME' },
  { systemKey: 'GENERAL_EXPENSE', code: '8000', name: 'General expense', type: 'EXPENSE' },
];

export type ErpTransaction = PrismaTypes.TransactionClient;
export type JournalPostingLine = {
  accountId: string;
  debit: Prisma.Decimal | string | number;
  credit: Prisma.Decimal | string | number;
  memo?: string;
};
export type JournalPostingInput = {
  businessId: string;
  actorId: string;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  entryDate: Date;
  memo: string;
  lines: readonly JournalPostingLine[];
  reversalOfId?: string;
  allowInactiveAccounts?: boolean;
};

export async function ensureDefaultAccounts(tx: ErpTransaction, businessId: string) {
  const accounts = new Map<SystemAccountKey, { id: string; type: string; active: boolean; systemKey: string | null }>();
  for (const account of DEFAULT_ACCOUNTS) {
    const createdOrExisting = await tx.financialAccount.upsert({
      where: { businessId_systemKey: { businessId, systemKey: account.systemKey } },
      create: {
        businessId,
        code: account.code,
        name: account.name,
        type: account.type,
        systemKey: account.systemKey,
        isSystem: true,
        cashbookEnabled: account.cashbookEnabled ?? false,
      },
      update: {},
      select: { id: true, type: true, active: true, systemKey: true },
    });
    if (!createdOrExisting.active) {
      throw new HttpError(409, `Required system account ${account.name} is inactive`, 'SYSTEM_ACCOUNT_INACTIVE');
    }
    accounts.set(account.systemKey, createdOrExisting);
  }
  return accounts;
}

export async function requireBusinessAccount(
  tx: ErpTransaction,
  businessId: string,
  accountId: string,
  options: { types?: readonly string[]; mustBeCashbook?: boolean } = {},
) {
  const account = await tx.financialAccount.findFirst({
    where: { id: accountId, businessId, active: true },
    select: { id: true, code: true, name: true, type: true, systemKey: true, isSystem: true, cashbookEnabled: true },
  });
  if (!account) throw new HttpError(404, 'Financial account not found or inactive', 'FINANCIAL_ACCOUNT_NOT_FOUND');
  if (options.types && !options.types.includes(account.type)) {
    throw new HttpError(400, `Account ${account.code} cannot be used for this transaction`, 'INVALID_ACCOUNT_TYPE');
  }
  if (options.mustBeCashbook && !account.cashbookEnabled) {
    throw new HttpError(400, 'Choose an account enabled for the cashbook', 'CASHBOOK_ACCOUNT_REQUIRED');
  }
  return account;
}

function lineSignature(line: { accountId: string; debit: Prisma.Decimal | string | number; credit: Prisma.Decimal | string | number; memo?: string | null }): string {
  return `${line.accountId}|${new Prisma.Decimal(line.debit).toFixed(2)}|${new Prisma.Decimal(line.credit).toFixed(2)}|${line.memo ?? ''}`;
}

function ensureSamePosting(
  existing: { sourceType: string; sourceId: string; memo: string; reversalOfId: string | null; lines: Array<{ accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal; memo: string | null }> },
  input: JournalPostingInput,
  lines: readonly { accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal; memo?: string }[],
): void {
  const existingLines = existing.lines.map(lineSignature).sort();
  const requestedLines = lines.map(lineSignature).sort();
  if (existing.sourceType !== input.sourceType || existing.sourceId !== input.sourceId
    || existing.memo !== input.memo || existing.reversalOfId !== (input.reversalOfId ?? null)
    || existingLines.length !== requestedLines.length
    || existingLines.some((line, index) => line !== requestedLines[index])) {
    throw new HttpError(409, 'Idempotency key was already used for a different journal posting', 'IDEMPOTENCY_CONFLICT');
  }
}

export async function postJournal(tx: ErpTransaction, input: JournalPostingInput) {
  const lines = input.lines.map((line) => ({
    accountId: line.accountId,
    debit: new Prisma.Decimal(line.debit).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
    credit: new Prisma.Decimal(line.credit).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
    ...(line.memo ? { memo: line.memo } : {}),
  }));
  try {
    assertJournalBalanced(lines.map((line) => ({ debit: line.debit.toFixed(2), credit: line.credit.toFixed(2) })));
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Journal is not balanced', 'UNBALANCED_JOURNAL');
  }
  if (lines.some((line) => line.debit.isZero() && line.credit.isZero())) {
    throw new HttpError(400, 'Journal lines must have a non-zero debit or credit', 'EMPTY_JOURNAL_LINE');
  }

  const existing = await tx.journalEntry.findUnique({
    where: { businessId_idempotencyKey: { businessId: input.businessId, idempotencyKey: input.idempotencyKey } },
    include: { lines: true },
  });
  if (existing) {
    ensureSamePosting(existing, input, lines);
    return existing;
  }

  const accountIds = [...new Set(lines.map((line) => line.accountId))];
  const accounts = await tx.financialAccount.findMany({
    where: {
      businessId: input.businessId, id: { in: accountIds },
      ...(!input.allowInactiveAccounts ? { active: true } : {}),
    },
    select: { id: true },
  });
  if (accounts.length !== accountIds.length) {
    throw new HttpError(400, 'Every journal account must belong to this business and be active for new postings', 'JOURNAL_ACCOUNT_TENANT_MISMATCH');
  }

  const sequence = await tx.business.update({
    where: { id: input.businessId },
    data: { journalSequence: { increment: 1 } },
    select: { slug: true, journalSequence: true },
  });
  const entryNumber = `J-${sequence.slug.slice(0, 8).toUpperCase()}-${String(sequence.journalSequence).padStart(6, '0')}`;
  try {
    return await tx.journalEntry.create({
      data: {
        businessId: input.businessId,
        entryNumber,
        entryDate: input.entryDate,
        memo: input.memo,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        idempotencyKey: input.idempotencyKey,
        ...(input.reversalOfId ? { reversalOfId: input.reversalOfId } : {}),
        actorId: input.actorId,
        lines: { create: lines },
      },
      include: { lines: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'A journal entry already exists for this source; retry with its original idempotency key', 'JOURNAL_SOURCE_CONFLICT');
    }
    throw error;
  }
}

export function zeroMoney(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}
