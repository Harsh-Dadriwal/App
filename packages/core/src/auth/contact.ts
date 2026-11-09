/** "+919876543210" from "98765 43210" (10-digit Indian mobiles get +91); other numbers need their +country code. */
export function toE164(value: string) {
  const digits = value.replace(/[^0-9+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (/^[6-9][0-9]{9}$/.test(digits)) return `+91${digits}`;
  return digits;
}

export function isValidMobile(value: string) {
  return /^\+[1-9][0-9]{7,14}$/.test(toE164(value));
}

/** "+91 98765 43210" for display; any other number is shown as it is stored. */
export function prettyPhone(value: string | null | undefined) {
  if (!value) return "";
  const withPlus = value.startsWith("+") ? value : `+${value}`;
  const match = withPlus.match(/^\+91(\d{5})(\d{5})$/);
  return match ? `+91 ${match[1]} ${match[2]}` : withPlus;
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
