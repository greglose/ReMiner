import crypto from "crypto";

/**
 * Hash a value using SHA256
 */
export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Hash a value for Meta Custom Audiences
 * Meta requires SHA256 hash of lowercase, trimmed values
 */
export function hashForMeta(value: string | undefined | null): string {
  if (!value) {
    return "";
  }

  return sha256(value.toLowerCase().trim());
}

/**
 * Hash a phone number for Meta
 * Phone should be in E.164 format without + (just country code + number)
 */
export function hashPhoneForMeta(phone: string | undefined | null): string {
  if (!phone) {
    return "";
  }

  // Remove all non-digits
  const digits = phone.replace(/\D/g, "");

  // Add US country code if needed
  const normalized = digits.startsWith("1") ? digits : `1${digits}`;

  return sha256(normalized);
}

/**
 * Hash an email for Meta
 */
export function hashEmailForMeta(email: string | undefined | null): string {
  if (!email) {
    return "";
  }

  return sha256(email.toLowerCase().trim());
}

/**
 * Hash a phone number for internal DNC storage
 */
export function hashPhoneForDnc(phone: string): string {
  // Normalize to 10 digits
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits;

  return sha256(normalized);
}

/**
 * Generate a random ID
 */
export function generateId(length = 16): string {
  return crypto.randomBytes(length).toString("hex");
}
