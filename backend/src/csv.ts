/**
 * Minimal RFC 4180 CSV writer for business exports (Phase 2 task 2.2).
 *
 * Every cell is quoted, embedded quotes are doubled, and cells whose first
 * non-space character could start a spreadsheet formula (=, +, -, @) are
 * prefixed with an apostrophe — the same formula-injection defence the
 * platform reconciliation export already used, now shared by all exports.
 */
export function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const guarded = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replaceAll('"', '""')}"`;
}

export function toCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
