function isZeroDecimal(value: string): boolean {
  return /^0+(?:\.0+)?$/.test(value);
}

/** Chooses the unit cost for a positive manual stock count adjustment without doing floating-point math. */
export function resolvePositiveAdjustmentCost(input: {
  quantityBefore: string;
  averageCostBefore: string;
  requestedUnitCost?: string;
}): { unitCost: string; requiresUnitCost: boolean } {
  const requiresUnitCost = isZeroDecimal(input.quantityBefore) && input.requestedUnitCost === undefined;
  return {
    unitCost: input.requestedUnitCost ?? input.averageCostBefore,
    requiresUnitCost,
  };
}
