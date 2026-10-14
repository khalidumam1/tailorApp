/** Only types removed by this edit need a usage check. Legacy records may
 * reference types that were already absent from the effective configuration. */
export function removedItemTypeKeys(current: unknown, next: ReadonlyArray<{ key: string }>): string[] {
  const nextKeys = new Set(next.map((item) => item.key));
  if (!Array.isArray(current)) return [];
  return current.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object' || !('key' in item) || typeof item.key !== 'string') return [];
    return nextKeys.has(item.key) ? [] : [item.key];
  });
}
