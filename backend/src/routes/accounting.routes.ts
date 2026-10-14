import { Prisma } from '@prisma/client';
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';
import { ensureDefaultAccounts, postJournal } from '../domain/accounting.js';
import { businessDateBounds } from '../domain/business-time.js';

const router = express.Router();
const uuidSchema = z.string().uuid();
const moneySchema = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/);
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const accountCreateSchema = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(160),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
  description: z.string().trim().max(500).nullable().optional(),
  cashbookEnabled: z.boolean().default(false),
  parentId: uuidSchema.nullable().optional(),
}).strict();
const accountUpdateSchema = z.object({
  version: z.number().int().positive(),
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().optional(),
  cashbookEnabled: z.boolean().optional(),
  parentId: uuidSchema.nullable().optional(),
}).strict().refine((input) => Object.keys(input).some((key) => key !== 'version'), 'Provide an account change');
const journalInputSchema = z.object({
  entryDate: z.string().datetime({ offset: true }).optional(),
  memo: z.string().trim().min(1).max(500),
  lines: z.array(z.object({
    accountId: uuidSchema,
    debit: moneySchema.default('0.00'),
    credit: moneySchema.default('0.00'),
    memo: z.string().trim().max(300).optional(),
  }).strict()).min(2).max(100),
}).strict();
const journalQuerySchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  accountId: uuidSchema.optional(),
  sourceType: z.string().trim().max(40).optional(),
  cursor: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const reportRangeSchema = z.object({ from: dateOnlySchema.optional(), to: dateOnlySchema.optional() }).strict();

function context(req: express.Request): { businessId: string; actorId: string } {
  if (req.auth?.scope !== 'business' || !req.auth.business) {
    throw new HttpError(403, 'Business membership is required', 'BUSINESS_ACCESS_DENIED');
  }
  return { businessId: req.auth.business.id, actorId: req.auth.userId };
}
function idempotencyKey(req: express.Request): string {
  const parsed = uuidSchema.safeParse(req.header('Idempotency-Key'));
  if (!parsed.success) throw new HttpError(400, 'A UUID Idempotency-Key header is required', 'IDEMPOTENCY_KEY_REQUIRED');
  return parsed.data;
}
function mapConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw new HttpError(409, 'This account or journal entry already exists', 'ACCOUNTING_CONFLICT');
    if (error.code === 'P2034' || error.code === 'P2028') throw new HttpError(409, 'A concurrent accounting change occurred; retry with the same idempotency key', 'ACCOUNTING_CONFLICT');
  }
  throw error;
}
async function audit(
  tx: Prisma.TransactionClient,
  businessId: string,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  requestId: string,
  metadata: Prisma.InputJsonValue,
): Promise<void> {
  await tx.auditEvent.create({ data: { businessId, actorId, action, entityType, entityId, requestId, metadata } });
}
async function businessSettings(businessId: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { currency: true, timezone: true } });
  if (!business) throw new HttpError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
  return business;
}
async function accountBalances(
  businessId: string,
  entryDate: { gte?: Date; lte?: Date },
) {
  const [accounts, grouped] = await Promise.all([
    prisma.financialAccount.findMany({ where: { businessId }, orderBy: [{ code: 'asc' }, { id: 'asc' }] }),
    prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { businessId, journalEntry: { entryDate } },
      _sum: { debit: true, credit: true },
    }),
  ]);
  const totals = new Map(grouped.map((row) => [row.accountId, {
    debit: row._sum.debit ?? new Prisma.Decimal(0),
    credit: row._sum.credit ?? new Prisma.Decimal(0),
  }]));
  return accounts.map((account) => {
    const total = totals.get(account.id) ?? { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) };
    return { account, debit: total.debit, credit: total.credit, net: total.debit.minus(total.credit) };
  });
}

router.use(authenticate);

router.post('/setup', requireBusinessPermission('accounting:manage'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const accounts = await prisma.$transaction(async (tx) => {
    const created = await ensureDefaultAccounts(tx, businessId);
    await audit(tx, businessId, actorId, 'accounting.chart_initialized', 'financial_account', [...created.values()][0]!.id, req.requestId, {
      systemAccountCount: created.size,
    });
    return [...created.entries()].map(([systemKey, account]) => ({ systemKey, ...account }));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 30_000 });
  res.json({ data: { accounts } });
}));

router.get('/accounts', requireBusinessPermission('accounting:read'), asyncHandler(async (req, res) => {
  const { businessId } = context(req);
  const accounts = await prisma.financialAccount.findMany({
    where: { businessId },
    include: { parent: { select: { id: true, code: true, name: true, type: true } } },
    orderBy: [{ code: 'asc' }, { id: 'asc' }],
  });
  res.json({ data: { items: accounts, setupRequired: accounts.length === 0 } });
}));

router.post('/accounts', requireBusinessPermission('accounting:manage'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const input = accountCreateSchema.parse(req.body);
  try {
    const account = await prisma.$transaction(async (tx) => {
      if (input.parentId) {
        const parent = await tx.financialAccount.findFirst({ where: { id: input.parentId, businessId, active: true } });
        if (!parent) throw new HttpError(404, 'Active parent account not found', 'PARENT_ACCOUNT_NOT_FOUND');
        if (parent.type !== input.type) throw new HttpError(400, 'Parent account must use the same account type', 'ACCOUNT_TYPE_MISMATCH');
      }
      const created = await tx.financialAccount.create({ data: { businessId, ...input, systemKey: null, isSystem: false } });
      await audit(tx, businessId, actorId, 'accounting.account_created', 'financial_account', created.id, req.requestId, {
        code: created.code, name: created.name, type: created.type,
      });
      return created;
    });
    res.status(201).json({ data: account });
  } catch (error) { mapConflict(error); }
}));

router.patch('/accounts/:accountId', requireBusinessPermission('accounting:manage'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const accountId = uuidSchema.parse(req.params.accountId);
  const { version, ...changes } = accountUpdateSchema.parse(req.body);
  try {
    const account = await prisma.$transaction(async (tx) => {
      const existing = await tx.financialAccount.findFirst({ where: { id: accountId, businessId } });
      if (!existing) throw new HttpError(404, 'Financial account not found', 'FINANCIAL_ACCOUNT_NOT_FOUND');
      if (existing.isSystem && changes.active === false) {
        throw new HttpError(409, 'System accounts cannot be deactivated because operational postings depend on them', 'SYSTEM_ACCOUNT_REQUIRED');
      }
      if (changes.parentId) {
        const parent = await tx.financialAccount.findFirst({ where: { id: changes.parentId, businessId, active: true } });
        if (!parent) throw new HttpError(404, 'Active parent account not found', 'PARENT_ACCOUNT_NOT_FOUND');
        if (parent.type !== existing.type) throw new HttpError(400, 'Parent account must use the same account type', 'ACCOUNT_TYPE_MISMATCH');
        if (parent.id === existing.id) throw new HttpError(400, 'An account cannot be its own parent', 'INVALID_ACCOUNT_PARENT');
      }
      const updated = await tx.financialAccount.updateMany({
        where: { id: accountId, businessId, version },
        data: { ...changes, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new HttpError(409, 'Account changed; refresh and retry', 'VERSION_CONFLICT');
      const refreshed = await tx.financialAccount.findFirstOrThrow({ where: { id: accountId, businessId } });
      await audit(tx, businessId, actorId, 'accounting.account_updated', 'financial_account', accountId, req.requestId, { changes });
      return refreshed;
    });
    res.json({ data: account });
  } catch (error) { mapConflict(error); }
}));

router.get('/journals', requireBusinessPermission('accounting:read'), asyncHandler(async (req, res) => {
  const { businessId } = context(req);
  const query = journalQuerySchema.parse(req.query);
  const business = await businessSettings(businessId);
  const entryDate = businessDateBounds({ from: query.from, to: query.to, timezone: business.timezone });
  if (query.cursor) {
    const cursor = await prisma.journalEntry.findFirst({ where: { id: query.cursor, businessId }, select: { id: true } });
    if (!cursor) throw new HttpError(400, 'Pagination cursor is invalid', 'INVALID_CURSOR');
  }
  const entries = await prisma.journalEntry.findMany({
    where: {
      businessId,
      ...(Object.keys(entryDate).length ? { entryDate } : {}),
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
      ...(query.accountId ? { lines: { some: { accountId: query.accountId } } } : {}),
    },
    include: { lines: { include: { account: { select: { id: true, code: true, name: true, type: true } } } } },
    orderBy: [{ entryDate: 'desc' }, { entryNumber: 'desc' }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    take: query.limit + 1,
  });
  const hasMore = entries.length > query.limit;
  const items = hasMore ? entries.slice(0, query.limit) : entries;
  res.json({ data: { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null }, currency: business.currency });
}));

router.post('/journals', requireBusinessPermission('accounting:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const input = journalInputSchema.parse(req.body);
  const key = idempotencyKey(req);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const posting = {
        businessId, actorId, sourceType: 'MANUAL_JOURNAL', sourceId: key,
        idempotencyKey: `manual-journal:${key}`, entryDate: input.entryDate ? new Date(input.entryDate) : new Date(),
        memo: input.memo, lines: input.lines,
      };
      const existing = await tx.journalEntry.findUnique({
        where: { businessId_idempotencyKey: { businessId, idempotencyKey: posting.idempotencyKey } },
      });
      const posted = await postJournal(tx, posting);
      if (existing) return { entry: posted, replayed: true };
      await audit(tx, businessId, actorId, 'accounting.manual_journal_posted', 'journal_entry', posted.id, req.requestId, {
        memo: input.memo, lineCount: input.lines.length,
      });
      return { entry: posted, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 30_000 });
    res.status(result.replayed ? 200 : 201).json({ data: result.entry, replayed: result.replayed });
  } catch (error) { mapConflict(error); }
}));

router.post('/journals/:entryId/reversals', requireBusinessPermission('accounting:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const entryId = uuidSchema.parse(req.params.entryId);
  const input = z.object({ reason: z.string().trim().min(1).max(500) }).strict().parse(req.body);
  const key = idempotencyKey(req);
  try {
    const reversal = await prisma.$transaction(async (tx) => {
      const original = await tx.journalEntry.findFirst({
        where: { id: entryId, businessId }, include: { lines: true },
      });
      if (!original) throw new HttpError(404, 'Journal entry not found', 'JOURNAL_ENTRY_NOT_FOUND');
      if (original.reversalOfId) throw new HttpError(409, 'A reversal entry cannot itself be reversed; post a correcting journal instead', 'JOURNAL_REVERSAL_NOT_ALLOWED');
      const replay = await tx.journalEntry.findUnique({
        where: { businessId_idempotencyKey: { businessId, idempotencyKey: `journal-reversal:${key}` } },
        include: { lines: true },
      });
      if (replay) {
        if (replay.sourceType !== 'JOURNAL_REVERSAL' || replay.sourceId !== original.id
          || replay.reversalOfId !== original.id || replay.memo !== `Reversal: ${input.reason}`) {
          throw new HttpError(409, 'Idempotency key was already used for a different journal reversal', 'IDEMPOTENCY_CONFLICT');
        }
        return { entry: replay, replayed: true };
      }
      const previous = await tx.journalEntry.findFirst({ where: { businessId, reversalOfId: original.id } });
      if (previous) throw new HttpError(409, 'This journal entry has already been reversed', 'JOURNAL_ALREADY_REVERSED');
      const entry = await postJournal(tx, {
        businessId, actorId, sourceType: 'JOURNAL_REVERSAL', sourceId: original.id,
        idempotencyKey: `journal-reversal:${key}`, entryDate: new Date(), memo: `Reversal: ${input.reason}`,
        reversalOfId: original.id,
        allowInactiveAccounts: true,
        lines: original.lines.map((line) => ({ accountId: line.accountId, debit: line.credit, credit: line.debit, memo: line.memo ?? undefined })),
      });
      await tx.journalEntry.update({ where: { id: original.id }, data: { status: 'REVERSED' } });
      await audit(tx, businessId, actorId, 'accounting.journal_reversed', 'journal_entry', entry.id, req.requestId, {
        reversalOfId: original.id, reason: input.reason,
      });
      return { entry, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 30_000 });
    res.status(reversal.replayed ? 200 : 201).json({ data: reversal.entry, replayed: reversal.replayed });
  } catch (error) { mapConflict(error); }
}));

router.get('/reports/trial-balance', requireBusinessPermission('accounting:read'), asyncHandler(async (req, res) => {
  const { businessId } = context(req);
  const query = z.object({ asOf: dateOnlySchema.optional() }).strict().parse(req.query);
  const business = await businessSettings(businessId);
  const bounds = businessDateBounds({ to: query.asOf, timezone: business.timezone });
  const rows = await accountBalances(businessId, bounds);
  const items = rows.map(({ account, net }) => ({
    accountId: account.id, code: account.code, name: account.name, type: account.type,
    debitBalance: net.greaterThan(0) ? net.toFixed(2) : '0.00',
    creditBalance: net.lessThan(0) ? net.negated().toFixed(2) : '0.00',
  }));
  const debitTotal = rows.reduce((sum, row) => sum.plus(row.net.greaterThan(0) ? row.net : 0), new Prisma.Decimal(0));
  const creditTotal = rows.reduce((sum, row) => sum.plus(row.net.lessThan(0) ? row.net.negated() : 0), new Prisma.Decimal(0));
  res.json({ data: { asOf: query.asOf ?? null, items, debitTotal: debitTotal.toFixed(2), creditTotal: creditTotal.toFixed(2), currency: business.currency } });
}));

router.get('/reports/profit-loss', requireBusinessPermission('accounting:read'), asyncHandler(async (req, res) => {
  const { businessId } = context(req);
  const query = reportRangeSchema.parse(req.query);
  const business = await businessSettings(businessId);
  const bounds = businessDateBounds({ from: query.from, to: query.to, timezone: business.timezone });
  const rows = await accountBalances(businessId, bounds);
  const income = rows.filter((row) => row.account.type === 'INCOME').map((row) => ({
    accountId: row.account.id, code: row.account.code, name: row.account.name,
    amount: row.credit.minus(row.debit).toFixed(2),
  }));
  const expenses = rows.filter((row) => row.account.type === 'EXPENSE').map((row) => ({
    accountId: row.account.id, code: row.account.code, name: row.account.name,
    amount: row.debit.minus(row.credit).toFixed(2),
  }));
  const totalIncome = rows.filter((row) => row.account.type === 'INCOME')
    .reduce((sum, row) => sum.plus(row.credit.minus(row.debit)), new Prisma.Decimal(0));
  const totalExpenses = rows.filter((row) => row.account.type === 'EXPENSE')
    .reduce((sum, row) => sum.plus(row.debit.minus(row.credit)), new Prisma.Decimal(0));
  res.json({ data: {
    from: query.from ?? null, to: query.to ?? null, income, expenses,
    totalIncome: totalIncome.toFixed(2), totalExpenses: totalExpenses.toFixed(2),
    netProfit: totalIncome.minus(totalExpenses).toFixed(2), currency: business.currency,
  } });
}));

router.get('/reports/balance-sheet', requireBusinessPermission('accounting:read'), asyncHandler(async (req, res) => {
  const { businessId } = context(req);
  const query = z.object({ asOf: dateOnlySchema.optional() }).strict().parse(req.query);
  const business = await businessSettings(businessId);
  const bounds = businessDateBounds({ to: query.asOf, timezone: business.timezone });
  const rows = await accountBalances(businessId, bounds);
  const assets = rows.filter((row) => row.account.type === 'ASSET').map((row) => ({
    accountId: row.account.id, code: row.account.code, name: row.account.name, balance: row.net.toFixed(2),
  }));
  const liabilities = rows.filter((row) => row.account.type === 'LIABILITY').map((row) => ({
    accountId: row.account.id, code: row.account.code, name: row.account.name, balance: row.credit.minus(row.debit).toFixed(2),
  }));
  const equity = rows.filter((row) => row.account.type === 'EQUITY').map((row) => ({
    accountId: row.account.id, code: row.account.code, name: row.account.name, balance: row.credit.minus(row.debit).toFixed(2),
  }));
  const totalAssets = rows.filter((row) => row.account.type === 'ASSET')
    .reduce((sum, row) => sum.plus(row.debit.minus(row.credit)), new Prisma.Decimal(0));
  const totalLiabilities = rows.filter((row) => row.account.type === 'LIABILITY')
    .reduce((sum, row) => sum.plus(row.credit.minus(row.debit)), new Prisma.Decimal(0));
  const totalEquityBeforeEarnings = rows.filter((row) => row.account.type === 'EQUITY')
    .reduce((sum, row) => sum.plus(row.credit.minus(row.debit)), new Prisma.Decimal(0));
  const currentEarnings = rows.filter((row) => ['INCOME', 'EXPENSE'].includes(row.account.type))
    .reduce((sum, row) => sum.plus(row.account.type === 'INCOME' ? row.credit.minus(row.debit) : row.credit.minus(row.debit)), new Prisma.Decimal(0));
  const totalEquity = totalEquityBeforeEarnings.plus(currentEarnings);
  res.json({ data: {
    asOf: query.asOf ?? null, assets, liabilities, equity,
    currentEarnings: currentEarnings.toFixed(2), totalAssets: totalAssets.toFixed(2),
    totalLiabilities: totalLiabilities.toFixed(2), totalEquity: totalEquity.toFixed(2),
    liabilitiesAndEquity: totalLiabilities.plus(totalEquity).toFixed(2), currency: business.currency,
  } });
}));

export default router;
