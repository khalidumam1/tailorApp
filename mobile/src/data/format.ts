/**
 * Pure helpers used by the settings and measurement screens. They have no
 * React Native imports, so they can be unit tested directly.
 */

/** Two string lists hold the same members, in any order. */
export function sameList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

/** Lower-case key for a new item type, matching the server's key rule (^[a-z][a-z0-9_-]{0,79}$). */
export function itemTypeKeyFrom(label: string, existing: string[]): string {
  let base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!/^[a-z]/.test(base)) base = `type_${base}`.replace(/_+$/, '');
  base = base.slice(0, 60) || 'type';
  let key = base;
  let suffix = 2;
  while (existing.includes(key)) key = `${base}_${suffix++}`;
  return key;
}

/** Parses stored measurement values (a JSON object) into string values. */
export function parseValues(json: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
    }
  } catch {
    // Unreadable values are shown as empty.
  }
  return {};
}

export type RevisionLike = { values: Record<string, string> };

/** Changed fields between a revision and the one before it: [label, previous, current]. */
export function diffRows(
  current: RevisionLike,
  previous: RevisionLike | undefined,
  labelFor: (key: string) => string,
): Array<[string, string, string]> {
  if (!previous) return [];
  const keys = new Set([...Object.keys(previous.values), ...Object.keys(current.values)]);
  const rows: Array<[string, string, string]> = [];
  for (const key of keys) {
    const before = previous.values[key] ?? '—';
    const after = current.values[key] ?? '—';
    if (before !== after) rows.push([labelFor(key), before, after]);
  }
  return rows;
}
