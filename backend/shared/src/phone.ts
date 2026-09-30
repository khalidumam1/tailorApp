export function normalizePakistanPhone(input: string): string {
  let compact = input.replace(/[\s().-]/g, '');
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`;

  const digits = compact.replace(/\D/g, '');
  if (compact.startsWith('+92') || digits.startsWith('92')) {
    const national = digits.slice(2).replace(/^0/, '');
    return `92${national}`;
  }
  if (digits.startsWith('0')) return `92${digits.slice(1)}`;
  if (digits.length === 10) return `92${digits}`;
  return digits;
}
