/**
 * Student PINs are 6 digits, so the easy ones go first in any guessing attempt.
 * Returns why a new PIN is too weak, or null if it's fine.
 */
export function weakPinReason(pin: string, dob?: string | null): string | null {
  if (!/^\d{6}$/.test(pin)) return "PIN must be exactly 6 digits.";
  if (dob && pin === dob) return "Don't use your date of birth as your PIN.";
  if (/^(\d)\1{5}$/.test(pin)) return "Don't use the same digit six times.";
  const steps = [...pin].slice(1).map((d, i) => (Number(d) - Number(pin[i]) + 10) % 10);
  if (steps.every((s) => s === 1) || steps.every((s) => s === 9)) {
    return "Don't use a simple sequence like 123456.";
  }
  if (/^(\d\d)\1\1$/.test(pin) || /^(\d{3})\1$/.test(pin)) {
    return "Don't use a repeating pattern like 121212.";
  }
  return null;
}
