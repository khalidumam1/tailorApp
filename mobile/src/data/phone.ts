/**
 * Phone number normalisation for Pakistan-first numbers. Returns digits only
 * with the country code (92), which is the form WhatsApp and `tel:` links use.
 */
export function normalizePhone(value: string): string {
  let compact = value.replace(/[\s().-]/g, '');
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`;
  const digits = compact.replace(/\D/g, '');
  if (compact.startsWith('+92') || digits.startsWith('92')) {
    return `92${digits.slice(2).replace(/^0/, '')}`;
  }
  if (digits.startsWith('0')) return `92${digits.slice(1)}`;
  if (digits.length === 10) return `92${digits}`;
  return digits;
}
