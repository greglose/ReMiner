/**
 * Normalize a phone number to 10 digits (US format)
 * Returns null if the phone is invalid
 */
export function normalizePhone(phone: string | undefined | null): string | null {
  if (!phone) {
    return null;
  }

  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");

  // Handle various formats
  if (digits.length === 10) {
    return digits;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }

  // Invalid phone number
  return null;
}

/**
 * Format a phone number for display
 */
export function formatPhone(phone: string | undefined | null): string {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return phone || "";
  }

  // Format as (XXX) XXX-XXXX
  return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}

/**
 * Check if a phone number is valid
 */
export function isValidPhone(phone: string | undefined | null): boolean {
  return normalizePhone(phone) !== null;
}

/**
 * Format phone for E.164 (international) format
 */
export function toE164(phone: string | undefined | null, countryCode = "1"): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return null;
  }

  return `+${countryCode}${normalized}`;
}
