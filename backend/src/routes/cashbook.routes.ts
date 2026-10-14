import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, requireBusinessPermission } from '../middleware/auth.js';
import { ensureDefaultAccounts, postJournal, requireBusinessAccount } from '../domain/accounting.js';

const router = express.Router();
const uuidSchema = z.string().uuid();
const moneySchema = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/);
const signedMoneySchema = z.string().regex(/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/);
const transactionSchema = z.object({
  kind: z.enum(['RECEIPT', 'EXPENSE', 'TRANSFER']),
  financialAccountId: uuidSchema,
  contraAccountId: uuidSchema,
  amount: moneySchema.refine((value) => new Prisma.Decimal(value).greaterThan(0)),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  reference: z.string().trim().max(120).nullable().optional(),
  memo: z.string().trim().min(1).max(500),
}).strict().refine((input) => input.financialAccountId !== input.contraAccountId, 'Choose two different accounts');
const accountCreateSchema = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).nullable().optional(),
}).strict();
const openingSchema = z.object({
  amount: signedMoneySchema.refine((value) => !new Prisma.Decimal(value).isZero(), 'Opening balance cannot be zero'),
  asOf: z.string().datetime({ offset: true }),
}).strict();
const cashbookAccountUpdateSchema = z.object({
  version: z.number().int().positive(),
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(500).nullable().optional(),
}).strict().refine((input) => Object.keys(input).some((key) => key !== 'version'), 'Provide an account change');
const reconciliationSchema = z.object({
  accountId: uuidSchema,
  statementStart: z.string().datetime({ offset: true }),
  statementEnd: z.string().datetime({ offset: true }),
  openingBalance: signedMoneySchema,
  closingBalance: signedMoneySchema,
}).strict().refine((input) => new Date(input.statementEnd) >= new Date(input.statementStart), 'Statement end must be on or after its start');
const querySchema = z.object({ accountId: uuidSchema.optional(), from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) });

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
    if (error.code === 'P2002') throw new HttpError(409, 'This cashbook operation already exists; retry with the same idempotency key', 'CASHBOOK_CONFLICT');
    if (error.code === 'P2034' || error.code === 'P2028') throw new HttpError(409, 'A concurrent cashbook change occurred; retry with the same idempotency key', 'CASHBOOK_CONFLICT');
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

router.use(authenticate);

router.post('/setup', requireBusinessPermission('cashbook:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const accounts = await prisma.$transaction(async (tx) => {
    const created = await ensureDefaultAccounts(tx, businessId);
    await audit(tx, businessId, actorId, 'cashbook.accounts_initialized', 'financial_account', created.get('CASH')!.id, req.requestId, {
      systemCashAccountCount: [...created.values()].filter((account) => ['CASH', 'BANK', 'DIGITAL'].includes(account.systemKey ?? '')).length,
    });
    return [...created.values()];
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 30_000 });
  res.json({ data: { accounts } });
}));

router.get('/accounts', requireBusinessPermission('cashbook:read'), asyncHandler(async (req, res) => {
  const { businessId } = context(req);
  const accounts = await prisma.financialAccount.findMany({
    where: { businessId, active: true, cashbookEnabled: true },
    orderBy: [{ code: 'asc' }, { id: 'asc' }],
  });
  const accountIds = accounts.map((account) => account.id);
  const grouped = accountIds.length ? await prisma.journalLine.groupBy({
    by: ['accountId'], where: { businessId, accountId: { in: accountIds } }, _sum: { debit: true, credit: true },
  }) : [];
  const totals = new Map(grouped.map((row) => [row.accountId, {
    debit: row._sum.debit ?? new Prisma.Decimal(0), credit: row._sum.credit ?? new Prisma.Decimal(0),
  }]));
  const items = accounts.map((account) => {
    const balance = totals.get(account.id) ?? { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) };
    return { ...account, balance: balance.debit.minus(balance.credit).toFixed(2) };
  });
  res.json({ data: { items, setupRequired: accounts.length === 0 } });
}));

router.post('/accounts', requireBusinessPermission('cashbook:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const input = accountCreateSchema.parse(req.body);
  try {
    const account = await prisma.$transaction(async (tx) => {
      const created = await tx.financialAccount.create({
        data: { businessId, ...input, type: 'ASSET', cashbookEnabled: true, isSystem: false },
      });
      await audit(tx, businessId, actorId, 'cashbook.account_created', 'financial_account', created.id, req.requestId, {
        code: created.code, name: created.name,
      });
      return created;
    });
    res.status(201).json({ data: account });
  } catch (error) { mapConflict(error); }
}));

router.patch('/accounts/:accountId', requireBusinessPermission('cashbook:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const accountId = uuidSchema.parse(req.params.accountId);
  const { version, ...changes } = cashbookAccountUpdateSchema.parse(req.body);
  const account = await prisma.$transaction(async (tx) => {
    const existing = await tx.financialAccount.findFirst({ where: { id: accountId, businessId } });
    if (!existing || existing.type !== 'ASSET' || !existing.cashbookEnabled) {
      throw new HttpError(404, 'Cash or bank account not found', 'CASHBOOK_ACCOUNT_NOT_FOUND');
    }
    const updated = await tx.financialAccount.updateMany({
      where: { id: accountId, businessId, version },
      data: { ...changes, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new HttpError(409, 'Cash or bank account changed; refresh and retry', 'VERSION_CONFLICT');
    const refreshed = await tx.financialAccount.findFirstOrThrow({ where: { id: accountId, businessId } });
    await audit(tx, businessId, actorId, 'cashbook.account_updated', 'financial_account', accountId, req.requestId, { changes });
    return refreshed;
  });
  res.json({ data: account });
}));

router.post('/accounts/:accountId/opening', requireBusinessPermission('cashbook:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const accountId = uuidSchema.parse(req.params.accountId);
  const input = openingSchema.parse(req.body);
  const key = idempotencyKey(req);
  try {
    const opening = await prisma.$transaction(async (tx) => {
      const replay = await tx.financialOpeningBalance.findUnique({ where: { businessId_idempotencyKey: { businessId, idempotencyKey: key } } });
      if (replay) {
        if (replay.accountId !== accountId || !replay.amount.equals(input.amount)
          || replay.asOf.getTime() !== new Date(input.asOf).getTime()) {
          throw new HttpError(409, 'Idempotency key was already used for a different opening balance', 'IDEMPOTENCY_CONFLICT');
        }
        return replay;
      }
      const account = await requireBusinessAccount(tx, businessId, accountId, { types: ['ASSET'], mustBeCashbook: true });
      const existingLines = await tx.journalLine.count({ where: { businessId, accountId } });
      const existingOpening = await tx.financialOpeningBalance.findUnique({ where: { businessId_accountId: { businessId, accountId } } });
      if (existingLines > 0 || existingOpening) {
        throw new HttpError(409, 'Opening balance is first-time setup only; use an audited cashbook transaction or journal correction instead', 'OPENING_BALANCE_ALREADY_SET');
      }
      const amount = new Prisma.Decimal(input.amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const accounts = await ensureDefaultAccounts(tx, businessId);
      const equityId = accounts.get('OPENING_EQUITY')!.id;
      const id = randomUUID();
      const lines = amount.greaterThan(0)
        ? [{ accountId: account.id, debit: amount, credit: 0 }, { accountId: equityId, debit: 0, credit: amount }]
        : [{ accountId: equityId, debit: amount.negated(), credit: 0 }, { accountId: account.id, debit: 0, credit: amount.negated() }];
      const journal = await postJournal(tx, {
        businessId, actorId, sourceType: 'FINANCIAL_OPENING', sourceId: id, idempotencyKey: `opening:${key}`,
        entryDate: new Date(input.asOf), memo: `Opening balance: ${account.name}`, lines,
      });
      const created = await tx.financialOpeningBalance.create({
        data: { id, businessId, accountId, amount, asOf: new Date(input.asOf), idempotencyKey: key, actorId, journalEntryId: journal.id },
      });
      await audit(tx, businessId, actorId, 'cashbook.opening_balance_posted', 'financial_opening_balance', created.id, req.requestId, {
        accountId, amount: amount.toFixed(2), asOf: input.asOf,
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 30_000 });
    res.status(201).json({ data: opening });
  } catch (error) { mapConflict(error); }
}));

router.get('/transactions', requireBusinessPermission('cashbook:read'), asyncHandler(async (req, res) => {
  const { businessId } = context(req);
  const query = querySchema.parse(req.query);
  const transactions = await prisma.cashTransaction.findMany({
    where: {
      businessId,
      ...(query.accountId ? { OR: [{ financialAccountId: query.accountId }, { contraAccountId: query.accountId }] } : {}),
      ...(query.from || query.to ? { occurredAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}),
      } } : {}),
    },
    include: {
      financialAccount: { select: { id: true, code: true, name: true } },
      contraAccount: { select: { id: true, code: true, name: true } },
      journalEntry: { select: { id: true, entryNumber: true } },
    },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    take: query.limit,
  });
  res.json({ data: { items: transactions } });
}));

router.get('/categories', requireBusinessPermission('cashbook:read'), asyncHandler(async (req, res) => {
  const { businessId } = context(req);
  const accounts = await prisma.financialAccount.findMany({
    where: { businessId, active: true, type: { in: ['INCOME', 'EXPENSE', 'LIABILITY', 'EQUITY'] } },
    orderBy: [{ type: 'asc' }, { code: 'asc' }],
  });
  res.json({ data: { items: accounts } });
}));

router.post('/categories', requireBusinessPermission('cashbook:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const input = z.object({
    code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).transform((value) => value.toUpperCase()),
    name: z.string().trim().min(1).max(160),
    type: z.enum(['INCOME', 'EXPENSE']),
  }).strict().parse(req.body);
  try {
    const account = await prisma.$transaction(async (tx) => {
      const created = await tx.financialAccount.create({ data: { businessId, ...input, isSystem: false } });
      await audit(tx, businessId, actorId, 'cashbook.category_created', 'financial_account', created.id, req.requestId, {
        code: created.code, name: created.name, type: created.type,
      });
      return created;
    });
    res.status(201).json({ data: account });
  } catch (error) { mapConflict(error); }
}));

router.patch('/categories/:accountId', requireBusinessPermission('cashbook:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const accountId = uuidSchema.parse(req.params.accountId);
  const { version, ...changes } = cashbookAccountUpdateSchema.parse(req.body);
  const account = await prisma.$transaction(async (tx) => {
    const existing = await tx.financialAccount.findFirst({ where: { id: accountId, businessId } });
    if (!existing || !['INCOME', 'EXPENSE'].includes(existing.type)) {
      throw new HttpError(404, 'Income or expense category not found', 'CASHBOOK_CATEGORY_NOT_FOUND');
    }
    const updated = await tx.financialAccount.updateMany({
      where: { id: accountId, businessId, version },
      data: { ...changes, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new HttpError(409, 'Category changed; refresh and retry', 'VERSION_CONFLICT');
    const refreshed = await tx.financialAccount.findFirstOrThrow({ where: { id: accountId, businessId } });
    await audit(tx, businessId, actorId, 'cashbook.category_updated', 'financial_account', accountId, req.requestId, { changes });
    return refreshed;
  });
  res.json({ data: account });
}));

router.post('/transactions', requireBusinessPermission('cashbook:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const input = transactionSchema.parse(req.body);
  const key = idempotencyKey(req);
  const amount = new Prisma.Decimal(input.amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const replay = await tx.cashTransaction.findUnique({ where: { businessId_idempotencyKey: { businessId, idempotencyKey: key } } });
      if (replay) {
        if (replay.kind !== input.kind || replay.financialAccountId !== input.financialAccountId
          || replay.contraAccountId !== input.contraAccountId || !replay.amount.equals(amount)
          || replay.memo !== input.memo || replay.reference !== (input.reference ?? null)
          || (input.occurredAt !== undefined && replay.occurredAt.getTime() !== new Date(input.occurredAt).getTime())) {
          throw new HttpError(409, 'Idempotency key was already used for a different cashbook transaction', 'IDEMPOTENCY_CONFLICT');
        }
        return { transaction: replay, replayed: true };
      }
      const [cashAccount, contraAccount] = await Promise.all([
        requireBusinessAccount(tx, businessId, input.financialAccountId, { types: ['ASSET'], mustBeCashbook: true }),
        requireBusinessAccount(tx, businessId, input.contraAccountId),
      ]);
      if (input.kind === 'RECEIPT' && !['INCOME', 'LIABILITY', 'EQUITY'].includes(contraAccount.type)) {
        throw new HttpError(400, 'A cash receipt needs an income, liability or equity category', 'INVALID_RECEIPT_CATEGORY');
      }
      if (input.kind === 'EXPENSE' && contraAccount.type !== 'EXPENSE') {
        throw new HttpError(400, 'Choose an expense category', 'INVALID_EXPENSE_CATEGORY');
      }
      if (input.kind === 'TRANSFER' && (contraAccount.type !== 'ASSET' || !contraAccount.cashbookEnabled)) {
        throw new HttpError(400, 'Transfers must move money between cashbook-enabled asset accounts', 'INVALID_TRANSFER_ACCOUNT');
      }
      const transactionId = randomUUID();
      const lines = input.kind === 'RECEIPT'
        ? [{ accountId: cashAccount.id, debit: amount, credit: 0 }, { accountId: contraAccount.id, debit: 0, credit: amount }]
        : input.kind === 'EXPENSE'
          ? [{ accountId: contraAccount.id, debit: amount, credit: 0 }, { accountId: cashAccount.id, debit: 0, credit: amount }]
          : [{ accountId: contraAccount.id, debit: amount, credit: 0 }, { accountId: cashAccount.id, debit: 0, credit: amount }];
      const journal = await postJournal(tx, {
        businessId, actorId, sourceType: 'CASHBOOK_TRANSACTION', sourceId: transactionId,
        idempotencyKey: `cashbook:${key}`, entryDate: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        memo: input.memo, lines,
      });
      const created = await tx.cashTransaction.create({
        data: {
          id: transactionId, businessId, kind: input.kind, financialAccountId: cashAccount.id,
          contraAccountId: contraAccount.id, amount, occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
          reference: input.reference, memo: input.memo, idempotencyKey: key, actorId, journalEntryId: journal.id,
        },
      });
      await audit(tx, businessId, actorId, `cashbook.${input.kind.toLowerCase()}_posted`, 'cash_transaction', created.id, req.requestId, {
        amount: amount.toFixed(2), financialAccountId: cashAccount.id, contraAccountId: contraAccount.id,
      });
      return { transaction: created, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 30_000 });
    res.status(result.replayed ? 200 : 201).json({ data: result.transaction, replayed: result.replayed });
  } catch (error) { mapConflict(error); }
}));

router.get('/reconciliations', requireBusinessPermission('cashbook:read'), asyncHandler(async (req, res) => {
  const { businessId } = context(req);
  const reconciliations = await prisma.bankReconciliation.findMany({
    where: { businessId }, include: { account: { select: { id: true, code: true, name: true } }, _count: { select: { matches: true } } },
    orderBy: [{ statementEnd: 'desc' }, { id: 'desc' }], take: 50,
  });
  res.json({ data: { items: reconciliations } });
}));

router.post('/reconciliations', requireBusinessPermission('cashbook:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const input = reconciliationSchema.parse(req.body);
  const key = idempotencyKey(req);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const replay = await tx.bankReconciliation.findUnique({ where: { businessId_idempotencyKey: { businessId, idempotencyKey: key } } });
      if (replay) {
        if (replay.accountId !== input.accountId
          || !replay.openingBalance.equals(input.openingBalance)
          || !replay.closingBalance.equals(input.closingBalance)
          || replay.statementStart.getTime() !== new Date(input.statementStart).getTime()
          || replay.statementEnd.getTime() !== new Date(input.statementEnd).getTime()) {
          throw new HttpError(409, 'Idempotency key was already used for a different reconciliation', 'IDEMPOTENCY_CONFLICT');
        }
        return { reconciliation: replay, replayed: true };
      }
      const account = await requireBusinessAccount(tx, businessId, input.accountId, { types: ['ASSET'], mustBeCashbook: true });
      const reconciliation = await tx.bankReconciliation.create({
        data: {
          businessId, accountId: account.id, statementStart: new Date(input.statementStart), statementEnd: new Date(input.statementEnd),
          openingBalance: new Prisma.Decimal(input.openingBalance), closingBalance: new Prisma.Decimal(input.closingBalance),
          idempotencyKey: key, actorId,
        },
      });
      await audit(tx, businessId, actorId, 'cashbook.reconciliation_started', 'bank_reconciliation', reconciliation.id, req.requestId, {
        accountId: account.id, statementStart: input.statementStart, statementEnd: input.statementEnd,
      });
      return { reconciliation, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 30_000 });
    res.status(result.replayed ? 200 : 201).json({ data: result.reconciliation, replayed: result.replayed });
  } catch (error) { mapConflict(error); }
}));

router.get('/reconciliations/:reconciliationId/lines', requireBusinessPermission('cashbook:read'), asyncHandler(async (req, res) => {
  const { businessId } = context(req);
  const reconciliationId = uuidSchema.parse(req.params.reconciliationId);
  const reconciliation = await prisma.bankReconciliation.findFirst({ where: { id: reconciliationId, businessId } });
  if (!reconciliation) throw new HttpError(404, 'Bank reconciliation not found', 'RECONCILIATION_NOT_FOUND');
  const [lines, matched] = await Promise.all([
    prisma.journalLine.findMany({
      where: {
        businessId, accountId: reconciliation.accountId,
        journalEntry: { entryDate: { gte: reconciliation.statementStart, lte: reconciliation.statementEnd } },
      },
      include: { journalEntry: { select: { id: true, entryNumber: true, entryDate: true, memo: true, sourceType: true } } },
      orderBy: [{ journalEntry: { entryDate: 'asc' } }, { id: 'asc' }],
    }),
    prisma.bankReconciliationMatch.findMany({ where: { businessId, reconciliationId }, select: { journalLineId: true } }),
  ]);
  const matchedIds = new Set(matched.map((match) => match.journalLineId));
  res.json({ data: {
    reconciliation,
    items: lines.map((line) => ({ ...line, matched: matchedIds.has(line.id), signedAmount: line.debit.minus(line.credit).toFixed(2) })),
  } });
}));

router.post('/reconciliations/:reconciliationId/matches', requireBusinessPermission('cashbook:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const reconciliationId = uuidSchema.parse(req.params.reconciliationId);
  const input = z.object({ journalLineIds: z.array(uuidSchema).min(1).max(200) }).strict().parse(req.body);
  if (new Set(input.journalLineIds).size !== input.journalLineIds.length) {
    throw new HttpError(400, 'A statement line can only be matched once', 'DUPLICATE_RECONCILIATION_LINE');
  }
  const result = await prisma.$transaction(async (tx) => {
    const reconciliation = await tx.bankReconciliation.findFirst({ where: { id: reconciliationId, businessId } });
    if (!reconciliation) throw new HttpError(404, 'Bank reconciliation not found', 'RECONCILIATION_NOT_FOUND');
    const lines = await tx.journalLine.findMany({
      where: {
        id: { in: input.journalLineIds }, businessId, accountId: reconciliation.accountId,
        journalEntry: { entryDate: { gte: reconciliation.statementStart, lte: reconciliation.statementEnd } },
      },
      select: { id: true },
    });
    if (lines.length !== input.journalLineIds.length) {
      throw new HttpError(400, 'Every journal line must belong to the reconciled account and statement period', 'INVALID_RECONCILIATION_LINE');
    }
    const existing = await tx.bankReconciliationMatch.findMany({
      where: { businessId, journalLineId: { in: input.journalLineIds } },
      select: { journalLineId: true, reconciliationId: true },
    });
    if (existing.some((match) => match.reconciliationId !== reconciliationId)) {
      throw new HttpError(409, 'One or more journal lines are already reconciled in another statement', 'RECONCILIATION_LINE_ALREADY_MATCHED');
    }
    const alreadyMatched = new Set(existing.map((match) => match.journalLineId));
    const newLineIds = input.journalLineIds.filter((journalLineId) => !alreadyMatched.has(journalLineId));
    if (newLineIds.length === 0) {
      return { matchedCount: input.journalLineIds.length, replayed: true };
    }
    if (reconciliation.status !== 'OPEN') throw new HttpError(409, 'Closed reconciliations cannot be changed', 'RECONCILIATION_CLOSED');
    const created = await tx.bankReconciliationMatch.createMany({
      data: newLineIds.map((journalLineId) => ({ businessId, reconciliationId, journalLineId, matchedById: actorId })),
    });
    await audit(tx, businessId, actorId, 'cashbook.reconciliation_lines_matched', 'bank_reconciliation', reconciliationId, req.requestId, {
      journalLineIds: newLineIds,
    });
    return { matchedCount: created.count, replayed: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 30_000 });
  res.status(result.replayed ? 200 : 201).json({ data: { matchedCount: result.matchedCount }, replayed: result.replayed });
}));

router.post('/reconciliations/:reconciliationId/close', requireBusinessPermission('cashbook:write'), asyncHandler(async (req, res) => {
  const { businessId, actorId } = context(req);
  const reconciliationId = uuidSchema.parse(req.params.reconciliationId);
  const reconciliation = await prisma.$transaction(async (tx) => {
    const current = await tx.bankReconciliation.findFirst({ where: { id: reconciliationId, businessId } });
    if (!current) throw new HttpError(404, 'Bank reconciliation not found', 'RECONCILIATION_NOT_FOUND');
    if (current.status === 'CLOSED') return current;
    const matches = await tx.bankReconciliationMatch.findMany({
      where: { businessId, reconciliationId }, include: { journalLine: { select: { debit: true, credit: true } } },
    });
    const netMovement = matches.reduce((sum, match) => sum.plus(match.journalLine.debit).minus(match.journalLine.credit), new Prisma.Decimal(0));
    const expectedClosing = current.openingBalance.plus(netMovement).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    if (!expectedClosing.equals(current.closingBalance)) {
      throw new HttpError(409, `Matched statement lines reconcile to ${expectedClosing.toFixed(2)}, not ${current.closingBalance.toFixed(2)}`, 'RECONCILIATION_OUT_OF_BALANCE');
    }
    const closed = await tx.bankReconciliation.update({
      where: { id: current.id }, data: { status: 'CLOSED', closedAt: new Date() },
    });
    await audit(tx, businessId, actorId, 'cashbook.reconciliation_closed', 'bank_reconciliation', closed.id, req.requestId, {
      matchedCount: matches.length, closingBalance: closed.closingBalance.toFixed(2),
    });
    return closed;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 30_000 });
  res.json({ data: reconciliation });
}));

export default router;
