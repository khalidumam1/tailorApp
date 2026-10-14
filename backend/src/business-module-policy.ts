/**
 * Resolve the platform allow-list against the assigned template. Businesses that
 * predate this override retain their template defaults. A malformed persisted
 * override fails closed rather than restoring access accidentally.
 */
export function resolvePlatformEnabledModules(
  templateModules: readonly string[],
  storedValue: unknown,
  hasOverride: boolean,
): string[] {
  if (!hasOverride) return [...templateModules];
  if (!Array.isArray(storedValue) || !storedValue.every((value): value is string => typeof value === 'string')) {
    return [];
  }
  const allowed = new Set(storedValue);
  return templateModules.filter((module) => allowed.has(module));
}

/** The user's selection is always bounded by both the template and platform. */
export function resolveEffectiveBusinessModules(
  templateModules: readonly string[],
  tenantModules: readonly string[],
  platformModules: readonly string[],
): string[] {
  const selected = new Set(tenantModules);
  const allowed = new Set(platformModules);
  return templateModules.filter((module) => selected.has(module) && allowed.has(module));
}

/** Translate existing permission families (or an explicit route feature) to a module. */
export function moduleForBusinessPermission(permission: string, explicitModule?: string): string | undefined {
  if (explicitModule) return explicitModule;
  const [family] = permission.split(':');
  return [
    'customers', 'measurements', 'orders', 'payments', 'notifications', 'reports',
    'inventory', 'suppliers', 'purchasing', 'cashbook', 'accounting',
  ].includes(family ?? '')
    ? family
    : undefined;
}
