import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { HttpError } from '../errors.js';
import { ensureDefaultAccounts, postJournal, requireBusinessAccount } from './accounting.js';
import { inventoryValue, weightedAverageUnitCost } from './erp-finance.js';
import { resolvePositiveAdjustmentCost } from './inventory-costing.js';

export type InventoryDirection = 'IN' | 'OUT';
export type InventoryMovementInput = {
  businessId: string;
  actorId: string;
  variantId: string;
  locationId: string;
  kind: 'OPENING' | 'RECEIPT' | 'CONSUMPTION' | 'CUSTOMER_RETURN' | 'SUPPLIER_RETURN' | 'WASTAGE' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'ADJUSTMENT';
  direction?: InventoryDirection;
  quantity: string;
  unitCost?: string;
  counterAccountId?: string;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  note?: string;
  occurredAt?: Date;
  reversalOfId?: string;
  postLedger?: boolean;
  allowInactiveVariant?: boolean;
};

export type InventoryTransaction = PrismaTypes.TransactionClient;

export async function getOrCreateDefaultLocation(tx: InventoryTransaction, businessId: string) {
  return tx.inventoryLocation.upsert({
    where: { businessId_code: { businessId, code: 'MAIN' } },
    create: { businessId, code: 'MAIN', name: 'Main store', isDefault: true },
    update: {},
  });
}

function isIncoming(input: InventoryMovementInput): boolean {
  if (input.kind === 'ADJUSTMENT') return input.direction === 'IN';
  return ['OPENING', 'RECEIPT', 'CUSTOMER_RETURN', 'TRANSFER_IN'].includes(input.kind);
}

function isOutgoing(input: InventoryMovementInput): boolean {
  if (input.kind === 'ADJUSTMENT') return input.direction === 'OUT';
  return ['CONSUMPTION', 'SUPPLIER_RETURN', 'WASTAGE', 'TRANSFER_OUT'].includes(input.kind);
}

function normalizedAmount(value: string, label: string, maxPlaces: number): Prisma.Decimal {
  if (!new RegExp(`^(?:0|[1-9]\\d*)(?:\\.\\d{1,${maxPlaces}})?$`).test(value)) {
    throw new HttpError(400, `${label} must be a non-negative decimal with at most ${maxPlaces} decimal places`, 'INVALID_DECIMAL');
  }
  return new Prisma.Decimal(value);
}

export async function postInventoryMovement(tx: InventoryTransaction, input: InventoryMovementInput) {
  const existing = await tx.inventoryMovement.findUnique({
    where: { businessId_idempotencyKey: { businessId: input.businessId, idempotencyKey: input.idempotencyKey } },
  });
  if (existing) {
    const replayQuantity = normalizedAmount(input.quantity, 'Quantity', 6);
    const signedQuantity = isOutgoing(input) ? replayQuantity.negated() : replayQuantity;
    const replayUnitCost = input.unitCost === undefined ? undefined : normalizedAmount(input.unitCost, 'Unit cost', 4);
    if (existing.variantId !== input.variantId || existing.locationId !== input.locationId
      || existing.kind !== input.kind || !existing.quantity.equals(signedQuantity)
      || existing.sourceType !== input.sourceType || existing.sourceId !== input.sourceId
      || existing.note !== (input.note ?? null)
      || (replayUnitCost !== undefined && !existing.unitCost.equals(replayUnitCost))
      || (input.occurredAt !== undefined && existing.occurredAt.getTime() !== input.occurredAt.getTime())) {
      throw new HttpError(409, 'Idempotency key was already used for a different inventory movement', 'IDEMPOTENCY_CONFLICT');
    }
    return existing;
  }

  const incoming = isIncoming(input);
  const outgoing = isOutgoing(input);
  if (incoming === outgoing) throw new HttpError(400, 'Choose a valid stock movement direction', 'INVALID_MOVEMENT_DIRECTION');
  const quantity = normalizedAmount(input.quantity, 'Quantity', 6);
  if (quantity.isZero()) throw new HttpError(400, 'Quantity must be greater than zero', 'INVALID_QUANTITY');
  const requestedUnitCost = input.unitCost === undefined ? undefined : normalizedAmount(input.unitCost, 'Unit cost', 4);
  if (incoming && requestedUnitCost === undefined && !['TRANSFER_IN', 'ADJUSTMENT'].includes(input.kind)) {
    throw new HttpError(400, 'Unit cost is required for stock received into inventory', 'UNIT_COST_REQUIRED');
  }

  const [variant, location] = await Promise.all([
    tx.stockVariant.findFirst({
      where: {
        id: input.variantId,
        businessId: input.businessId,
        ...(!input.allowInactiveVariant ? { active: true, stockItem: { active: true } } : {}),
      },
      include: { stockItem: { select: { id: true, name: true, baseUnit: true, active: true } } },
    }),
    tx.inventoryLocation.findFirst({
      where: { id: input.locationId, businessId: input.businessId, active: true },
      select: { id: true },
    }),
  ]);
  if (!variant || (!input.allowInactiveVariant && !variant.stockItem.active)) {
    throw new HttpError(404, 'Active stock item variant not found', 'STOCK_VARIANT_NOT_FOUND');
  }
  if (!location) throw new HttpError(404, 'Active inventory location not found', 'INVENTORY_LOCATION_NOT_FOUND');

  const balanceKey = { businessId_variantId_locationId: {
    businessId: input.businessId, variantId: input.variantId, locationId: input.locationId,
  } };
  const balance = await tx.inventoryBalance.upsert({
    where: balanceKey,
    create: {
      businessId: input.businessId,
      variantId: input.variantId,
      locationId: input.locationId,
      quantity: new Prisma.Decimal(0),
      averageUnitCost: new Prisma.Decimal(0),
    },
    update: {},
  });
  const quantityBefore = new Prisma.Decimal(balance.quantity);
  const averageCostBefore = new Prisma.Decimal(balance.averageUnitCost);
  if (input.kind === 'OPENING') {
    const priorMovements = await tx.inventoryMovement.count({
      where: { businessId: input.businessId, variantId: input.variantId },
    });
    if (priorMovements > 0 || !quantityBefore.isZero()) {
      throw new HttpError(409, 'Opening inventory is first-time setup only; use an audited stock adjustment after any movement', 'OPENING_STOCK_ALREADY_SET');
    }
  }
  if (input.kind === 'TRANSFER_IN' && requestedUnitCost === undefined) {
    throw new HttpError(400, 'Transfer-in movements require the source weighted-average cost', 'UNIT_COST_REQUIRED');
  }
  const adjustmentCost = input.kind === 'ADJUSTMENT' && incoming
    ? resolvePositiveAdjustmentCost({
      quantityBefore: quantityBefore.toFixed(6),
      averageCostBefore: averageCostBefore.toFixed(4),
      ...(requestedUnitCost ? { requestedUnitCost: requestedUnitCost.toFixed(4) } : {}),
    })
    : undefined;
  if (adjustmentCost?.requiresUnitCost) {
    throw new HttpError(400, 'Unit cost is required when adding stock to an empty location', 'UNIT_COST_REQUIRED');
  }
  const signedQuantity = outgoing ? quantity.negated() : quantity;
  const quantityAfter = quantityBefore.plus(signedQuantity);
  if (quantityAfter.isNegative()) throw new HttpError(409, 'This movement would make stock negative', 'INSUFFICIENT_STOCK');
  const movementUnitCost = adjustmentCost
    ? new Prisma.Decimal(adjustmentCost.unitCost)
    : outgoing ? averageCostBefore : requestedUnitCost ?? averageCostBefore;
  if (movementUnitCost.isNegative()) throw new HttpError(400, 'Unit cost cannot be negative', 'INVALID_UNIT_COST');
  const totalCostText = inventoryValue(quantity.toFixed(6), movementUnitCost.toFixed(4));
  const totalCost = new Prisma.Decimal(totalCostText);
  const averageCostAfter = incoming
    ? new Prisma.Decimal(weightedAverageUnitCost({
      quantityBefore: quantityBefore.toFixed(6),
      averageCostBefore: averageCostBefore.toFixed(4),
      quantityReceived: quantity.toFixed(6),
      receivedUnitCost: movementUnitCost.toFixed(4),
    }))
    : quantityAfter.isZero() ? new Prisma.Decimal(0) : averageCostBefore;
  const movementId = randomUUID();

  if (input.kind === 'TRANSFER_IN' || input.kind === 'TRANSFER_OUT') {
    // Transfers move the same carrying value between locations and do not affect the GL.
  } else if (input.postLedger !== false && !totalCost.isZero()) {
      const accounts = await ensureDefaultAccounts(tx, input.businessId);
      let debitAccountId: string;
      let creditAccountId: string;
      if (incoming) {
        debitAccountId = accounts.get('INVENTORY')!.id;
        if (input.counterAccountId) {
          const contra = await requireBusinessAccount(tx, input.businessId, input.counterAccountId);
          creditAccountId = contra.id;
        } else if (input.kind === 'OPENING') {
          creditAccountId = accounts.get('OPENING_EQUITY')!.id;
        } else if (input.kind === 'CUSTOMER_RETURN') {
          debitAccountId = accounts.get('INVENTORY')!.id;
          creditAccountId = accounts.get('COST_OF_GOODS_SOLD')!.id;
        } else if (input.kind === 'RECEIPT') {
          creditAccountId = accounts.get('ACCOUNTS_PAYABLE')!.id;
        } else {
          creditAccountId = accounts.get('INVENTORY_ADJUSTMENT')!.id;
        }
      } else {
        creditAccountId = accounts.get('INVENTORY')!.id;
        if (input.counterAccountId) {
          const contra = await requireBusinessAccount(tx, input.businessId, input.counterAccountId);
          debitAccountId = contra.id;
        } else if (input.kind === 'CONSUMPTION') {
          debitAccountId = accounts.get('COST_OF_GOODS_SOLD')!.id;
        } else if (input.kind === 'SUPPLIER_RETURN') {
          debitAccountId = accounts.get('ACCOUNTS_PAYABLE')!.id;
        } else {
          debitAccountId = accounts.get('INVENTORY_ADJUSTMENT')!.id;
        }
      }
      const entryDate = input.occurredAt ?? new Date();
      await postJournal(tx, {
        businessId: input.businessId,
        actorId: input.actorId,
        sourceType: 'INVENTORY_MOVEMENT',
        sourceId: movementId,
        idempotencyKey: `inventory:${input.idempotencyKey}`,
        entryDate,
        memo: input.note?.slice(0, 500) || `${input.kind.toLowerCase().replaceAll('_', ' ')}: ${variant.stockItem.name} / ${variant.name}`,
        ...(input.reversalOfId ? { reversalOfId: input.reversalOfId } : {}),
        lines: [
          { accountId: debitAccountId, debit: totalCost, credit: 0 },
          { accountId: creditAccountId, debit: 0, credit: totalCost },
        ],
      });
  }

  const movement = await tx.inventoryMovement.create({
    data: {
      id: movementId,
      businessId: input.businessId,
      variantId: input.variantId,
      locationId: input.locationId,
      kind: input.kind,
      quantity: signedQuantity,
      unitCost: movementUnitCost,
      totalCost,
      balanceBefore: quantityBefore,
      balanceAfter: quantityAfter,
      averageCostBefore,
      averageCostAfter,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      idempotencyKey: input.idempotencyKey,
      note: input.note,
      actorId: input.actorId,
      occurredAt: input.occurredAt,
      ...(input.reversalOfId ? { reversalOfId: input.reversalOfId } : {}),
    },
  });
  await tx.inventoryBalance.update({
    where: balanceKey,
    data: { quantity: quantityAfter, averageUnitCost: averageCostAfter, lastMovementId: movement.id },
  });
  return movement;
}

export async function inventoryValuation(tx: InventoryTransaction, businessId: string) {
  const balances = await tx.inventoryBalance.findMany({
    where: { businessId, quantity: { gt: 0 } },
    include: {
      variant: { include: { stockItem: { select: { id: true, name: true, kind: true, baseUnit: true, reorderPoint: true } } } },
      location: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ variant: { stockItem: { name: 'asc' } } }, { location: { name: 'asc' } }],
  });
  let total = new Prisma.Decimal(0);
  const items = balances.map((balance) => {
    const value = new Prisma.Decimal(inventoryValue(balance.quantity.toFixed(6), balance.averageUnitCost.toFixed(4)));
    total = total.plus(value);
    return {
      variant: balance.variant,
      location: balance.location,
      quantity: balance.quantity.toFixed(6),
      averageUnitCost: balance.averageUnitCost.toFixed(4),
      value: value.toFixed(2),
      reorderPoint: balance.variant.stockItem.reorderPoint?.toFixed(6) ?? null,
      lowStock: balance.variant.stockItem.reorderPoint !== null
        && balance.quantity.lessThanOrEqualTo(balance.variant.stockItem.reorderPoint),
    };
  });
  return { items, totalValue: total.toFixed(2), currency: 'PKR' };
}
