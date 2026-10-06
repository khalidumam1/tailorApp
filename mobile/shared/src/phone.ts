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

export function toE164Phone(input: string): string {
  let compact = input.trim().replace(/[\s().-]/g, '');
  if (!/^\+?[0-9]+$/.test(compact)) {
    throw new Error('Phone number must be valid in international format');
  }
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`;
  const digits = compact.replace(/\D/g, '');
  if (compact.startsWith('+') && !/^[1-9]\d{7,14}$/.test(digits)) {
    throw new Error('Phone number must be valid in international format');
  }
  const normalized = compact.startsWith('+') ? digits : normalizePakistanPhone(compact);
  if (!/^[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error('Phone number must be valid in international format');
  }
  return `+${normalized}`;
}
