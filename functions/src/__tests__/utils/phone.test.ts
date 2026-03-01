import { describe, it, expect } from "vitest";
import {
  normalizePhone,
  formatPhone,
  isValidPhone,
  toE164,
} from "../../utils/phone";

describe("normalizePhone", () => {
  it("should normalize 10-digit phone number", () => {
    expect(normalizePhone("5551234567")).toBe("5551234567");
  });

  it("should strip formatting characters", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("5551234567");
    expect(normalizePhone("555-123-4567")).toBe("5551234567");
    expect(normalizePhone("555.123.4567")).toBe("5551234567");
    expect(normalizePhone("555 123 4567")).toBe("5551234567");
  });

  it("should handle 11-digit US number starting with 1", () => {
    expect(normalizePhone("15551234567")).toBe("5551234567");
    expect(normalizePhone("1-555-123-4567")).toBe("5551234567");
  });

  it("should return null for invalid phone numbers", () => {
    expect(normalizePhone("555")).toBeNull();
    expect(normalizePhone("123456")).toBeNull();
    expect(normalizePhone("12345678901234")).toBeNull();
  });

  it("should return null for empty or undefined input", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  it("should handle phone numbers with letters", () => {
    expect(normalizePhone("555-GET-HELP")).toBeNull(); // Not enough digits after stripping
  });
});

describe("formatPhone", () => {
  it("should format 10-digit number as (XXX) XXX-XXXX", () => {
    expect(formatPhone("5551234567")).toBe("(555) 123-4567");
  });

  it("should format from various input formats", () => {
    expect(formatPhone("555-123-4567")).toBe("(555) 123-4567");
    expect(formatPhone("15551234567")).toBe("(555) 123-4567");
    expect(formatPhone("(555) 123-4567")).toBe("(555) 123-4567");
  });

  it("should return original string for invalid phone", () => {
    expect(formatPhone("555")).toBe("555");
    expect(formatPhone("invalid")).toBe("invalid");
  });

  it("should return empty string for null/undefined", () => {
    expect(formatPhone(null)).toBe("");
    expect(formatPhone(undefined)).toBe("");
    expect(formatPhone("")).toBe("");
  });
});

describe("isValidPhone", () => {
  it("should return true for valid 10-digit phone", () => {
    expect(isValidPhone("5551234567")).toBe(true);
    expect(isValidPhone("(555) 123-4567")).toBe(true);
    expect(isValidPhone("15551234567")).toBe(true);
  });

  it("should return false for invalid phone", () => {
    expect(isValidPhone("555")).toBe(false);
    expect(isValidPhone("invalid")).toBe(false);
    expect(isValidPhone("")).toBe(false);
    expect(isValidPhone(null)).toBe(false);
    expect(isValidPhone(undefined)).toBe(false);
  });
});

describe("toE164", () => {
  it("should convert to E.164 format with default US country code", () => {
    expect(toE164("5551234567")).toBe("+15551234567");
    expect(toE164("(555) 123-4567")).toBe("+15551234567");
  });

  it("should use custom country code", () => {
    expect(toE164("5551234567", "44")).toBe("+445551234567");
  });

  it("should return null for invalid phone", () => {
    expect(toE164("555")).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164("")).toBeNull();
  });

  it("should strip existing country code before adding new one", () => {
    expect(toE164("15551234567")).toBe("+15551234567");
  });
});
