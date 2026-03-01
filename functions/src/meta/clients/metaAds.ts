import { withRetry } from "../../utils/retry";
import { hashEmailForMeta, hashPhoneForMeta, hashForMeta } from "../../utils/hashing";
import { logInfo } from "../../utils/logging";
import type { Lead } from "../../types";

const META_API_VERSION = "v19.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export class MetaAdsClient {
  private accessToken: string;
  private adAccountId: string;

  constructor(accessToken: string, adAccountId: string) {
    this.accessToken = accessToken;
    this.adAccountId = adAccountId;
  }

  getAdAccountId(): string {
    return this.adAccountId;
  }

  /**
   * Create a new Custom Audience
   */
  async createCustomAudience(name: string, description: string): Promise<string> {
    return withRetry(async () => {
      const response = await fetch(
        `${META_BASE_URL}/act_${this.adAccountId}/customaudiences`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: this.accessToken,
            name,
            description,
            subtype: "CUSTOM",
            customer_file_source: "USER_PROVIDED_ONLY",
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to create audience: ${JSON.stringify(error)}`);
      }

      const data = (await response.json()) as { id: string };
      logInfo(`Created Meta audience: ${data.id}`, { audienceId: data.id });
      return data.id;
    });
  }

  /**
   * Upload leads to a Custom Audience
   */
  async uploadToAudience(audienceId: string, leads: Lead[]): Promise<number> {
    const users = leads
      .map((lead) => this.hashLeadData(lead))
      .filter((u): u is string[] => u !== null);

    if (users.length === 0) {
      logInfo("No valid users to upload to audience", { audienceId });
      return 0;
    }

    let uploadedCount = 0;
    const batchSize = 10000;

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      await withRetry(async () => {
        const response = await fetch(`${META_BASE_URL}/${audienceId}/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: this.accessToken,
            payload: {
              schema: ["EMAIL", "PHONE", "FN", "LN", "ZIP", "CT", "ST"],
              data: batch,
            },
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Failed to upload to audience: ${JSON.stringify(error)}`);
        }

        const result = (await response.json()) as { num_received?: number };
        uploadedCount += result.num_received || batch.length;
      });

      // Rate limiting between batches
      if (i + batchSize < users.length) {
        await this.delay(1000);
      }
    }

    logInfo(`Uploaded ${uploadedCount} users to audience`, {
      audienceId,
      uploadedCount,
    });

    return uploadedCount;
  }

  /**
   * Get audience size
   */
  async getAudienceSize(audienceId: string): Promise<number> {
    try {
      const response = await fetch(
        `${META_BASE_URL}/${audienceId}?fields=approximate_count&access_token=${this.accessToken}`
      );

      if (!response.ok) {
        return 0;
      }

      const data = (await response.json()) as { approximate_count?: number };
      return data.approximate_count || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Create a Lookalike Audience
   */
  async createLookalikeAudience(
    sourceAudienceId: string,
    name: string,
    country = "US",
    ratio = 0.01
  ): Promise<string> {
    return withRetry(async () => {
      const response = await fetch(
        `${META_BASE_URL}/act_${this.adAccountId}/customaudiences`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: this.accessToken,
            name,
            subtype: "LOOKALIKE",
            origin_audience_id: sourceAudienceId,
            lookalike_spec: JSON.stringify({
              type: "similarity",
              country,
              ratio,
            }),
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to create lookalike: ${JSON.stringify(error)}`);
      }

      const data = (await response.json()) as { id: string };
      return data.id;
    });
  }

  /**
   * Hash lead data for Meta Custom Audiences
   */
  private hashLeadData(lead: Lead): string[] | null {
    // Must have at least email or phone
    const hasEmail = lead.emails && lead.emails.length > 0;
    const hasPhone = lead.phones && lead.phones.length > 0;

    if (!hasEmail && !hasPhone) {
      return null;
    }

    return [
      hashEmailForMeta(lead.primaryEmail || lead.emails?.[0]),
      hashPhoneForMeta(lead.primaryPhone || lead.phones?.[0]),
      hashForMeta(lead.ownerFirstName),
      hashForMeta(lead.ownerLastName),
      hashForMeta(lead.zipCode),
      hashForMeta(lead.city),
      hashForMeta(lead.state),
    ];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
