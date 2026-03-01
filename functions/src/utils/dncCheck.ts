import { getDb } from "../config/firebase";
import { withRetry } from "./retry";
import { normalizePhone } from "./phone";
import { hashPhoneForDnc } from "./hashing";
import { logInfo, logError } from "./logging";
import { FieldValue } from "firebase-admin/firestore";

const DNC_API_BASE = "https://api.dnc.com/v2";

export interface DncCheckResult {
  phone: string;
  isBlocked: boolean;
  source: "federal" | "state" | "internal" | null;
  checkedAt: Date;
}

export class DncChecker {
  private apiKey: string;
  // apiSecret reserved for future use with different DNC providers
  private _apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this._apiSecret = apiSecret;
  }

  /**
   * Check a single phone against DNC registry
   */
  async checkPhone(phone: string): Promise<DncCheckResult> {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      return {
        phone,
        isBlocked: true, // Invalid phone = blocked
        source: null,
        checkedAt: new Date(),
      };
    }

    // Check internal DNC first (faster)
    const internalBlock = await this.checkInternalDnc(normalized);
    if (internalBlock) {
      return {
        phone: normalized,
        isBlocked: true,
        source: internalBlock.source as "internal",
        checkedAt: new Date(),
      };
    }

    // Check federal DNC registry
    const federalResult = await this.checkFederalDnc(normalized);

    return {
      phone: normalized,
      isBlocked: federalResult.isBlocked,
      source: federalResult.isBlocked ? "federal" : null,
      checkedAt: new Date(),
    };
  }

  /**
   * Check multiple phones against DNC registry
   */
  async checkPhones(phones: string[]): Promise<Map<string, DncCheckResult>> {
    const results = new Map<string, DncCheckResult>();

    // Normalize all phones first
    const phoneMap = new Map<string, string>(); // original -> normalized
    for (const phone of phones) {
      const normalized = normalizePhone(phone);
      if (normalized) {
        phoneMap.set(phone, normalized);
      } else {
        results.set(phone, {
          phone,
          isBlocked: true,
          source: null,
          checkedAt: new Date(),
        });
      }
    }

    const normalizedPhones = Array.from(new Set(phoneMap.values()));

    // Check internal DNC for all
    const internalResults = await this.batchCheckInternalDnc(normalizedPhones);

    // Phones that need federal check
    const phonesForFederalCheck = normalizedPhones.filter(
      (p) => !internalResults.has(p)
    );

    // Batch check federal DNC
    const federalResults = phonesForFederalCheck.length > 0
      ? await this.batchCheckFederalDnc(phonesForFederalCheck)
      : new Map<string, DncCheckResult>();

    // Compile results
    for (const [original, normalized] of phoneMap) {
      if (internalResults.has(normalized)) {
        results.set(original, internalResults.get(normalized)!);
      } else if (federalResults.has(normalized)) {
        results.set(original, federalResults.get(normalized)!);
      } else {
        results.set(original, {
          phone: normalized,
          isBlocked: false,
          source: null,
          checkedAt: new Date(),
        });
      }
    }

    return results;
  }

  /**
   * Check internal DNC list
   */
  private async checkInternalDnc(
    phone: string
  ): Promise<{ source: string } | null> {
    const db = getDb();
    const phoneHash = hashPhoneForDnc(phone);
    const doc = await db.collection("dnc").doc(phoneHash).get();

    if (doc.exists) {
      const data = doc.data()!;
      // Check if expired
      if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
        return null;
      }
      return { source: data.source };
    }

    return null;
  }

  /**
   * Batch check internal DNC list
   */
  private async batchCheckInternalDnc(
    phones: string[]
  ): Promise<Map<string, DncCheckResult>> {
    const db = getDb();
    const results = new Map<string, DncCheckResult>();

    // Firestore IN queries are limited to 30 items
    const batchSize = 30;
    for (let i = 0; i < phones.length; i += batchSize) {
      const batch = phones.slice(i, i + batchSize);
      const hashes = batch.map((p) => hashPhoneForDnc(p));

      const snapshot = await db
        .collection("dnc")
        .where("phoneHash", "in", hashes)
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        // Check if expired
        if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
          continue;
        }

        // Find the original phone for this hash
        const phone = batch.find((p) => hashPhoneForDnc(p) === data.phoneHash);
        if (phone) {
          results.set(phone, {
            phone,
            isBlocked: true,
            source: data.source as "internal",
            checkedAt: new Date(),
          });
        }
      }
    }

    return results;
  }

  /**
   * Check federal DNC registry
   */
  private async checkFederalDnc(
    phone: string
  ): Promise<{ isBlocked: boolean }> {
    return withRetry(async () => {
      const response = await fetch(`${DNC_API_BASE}/check`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phones: [phone] }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DNC API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as { results?: Array<{ onDnc?: boolean }> };
      return { isBlocked: data.results?.[0]?.onDnc || false };
    });
  }

  /**
   * Batch check federal DNC registry
   */
  private async batchCheckFederalDnc(
    phones: string[]
  ): Promise<Map<string, DncCheckResult>> {
    const results = new Map<string, DncCheckResult>();

    // DNC.com allows batches of 1000
    const batchSize = 1000;

    for (let i = 0; i < phones.length; i += batchSize) {
      const batch = phones.slice(i, i + batchSize);

      try {
        const response = await withRetry(async () => {
          const res = await fetch(`${DNC_API_BASE}/check`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ phones: batch }),
          });

          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`DNC API error: ${res.status} - ${errorText}`);
          }

          return res.json() as Promise<{ results?: Array<{ phone: string; onDnc: boolean }> }>;
        });

        for (const result of response.results || []) {
          results.set(result.phone, {
            phone: result.phone,
            isBlocked: result.onDnc,
            source: result.onDnc ? "federal" : null,
            checkedAt: new Date(),
          });
        }
      } catch (error) {
        logError("Failed to check federal DNC batch", error, {
          batchSize: batch.length,
        });
        // Mark as not blocked on error (fail open for now)
        for (const phone of batch) {
          results.set(phone, {
            phone,
            isBlocked: false,
            source: null,
            checkedAt: new Date(),
          });
        }
      }

      // Rate limit between batches
      if (i + batchSize < phones.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return results;
  }

  /**
   * Add a phone to the internal DNC list
   */
  async addToInternalDnc(
    phone: string,
    source: "internal" | "complaint",
    reason?: string
  ): Promise<void> {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      return;
    }

    const db = getDb();
    const phoneHash = hashPhoneForDnc(normalized);

    await db.collection("dnc").doc(phoneHash).set({
      phoneHash,
      source,
      addedAt: FieldValue.serverTimestamp(),
      expiresAt: null,
      reason: reason || null,
    });

    logInfo("Added phone to internal DNC", { phoneHash, source, reason });
  }

  /**
   * Remove a phone from the internal DNC list
   */
  async removeFromInternalDnc(phone: string): Promise<void> {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      return;
    }

    const db = getDb();
    const phoneHash = hashPhoneForDnc(normalized);

    await db.collection("dnc").doc(phoneHash).delete();

    logInfo("Removed phone from internal DNC", { phoneHash });
  }
}
