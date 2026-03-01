import { withRetry } from "../../utils/retry";
import { logInfo, logError } from "../../utils/logging";

export interface BatchLeadsListing {
  id: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    county: string;
  };
  listing: {
    price: number;
    listDate: string;
    daysOnMarket: number;
    status: string;
    mlsNumber: string;
    agent: {
      name: string;
      phone: string;
    };
  };
  property: {
    type: string;
    bedrooms: number;
    bathrooms: number;
    sqft: number;
    yearBuilt: number;
  };
  owner: {
    name: string;
    mailingAddress: string;
  };
}

export interface SkipTraceResult {
  success: boolean;
  owner: {
    firstName: string;
    lastName: string;
    fullName: string;
  };
  emails: Array<{
    email: string;
    type: string;
    confidence: number;
  }>;
  phones: Array<{
    phone: string;
    type: string;
    confidence: number;
  }>;
  mailingAddress: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
}

export interface SearchParams {
  zipCodes: string[];
  minDaysOnMarket: number;
  minPrice?: number;
  maxPrice?: number;
  propertyTypes?: string[];
}

export class BatchLeadsClient {
  private baseUrl = "https://api.batchleads.io/v1";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Search for listings matching criteria
   */
  async searchListings(params: SearchParams): Promise<BatchLeadsListing[]> {
    const allListings: BatchLeadsListing[] = [];

    for (const zip of params.zipCodes) {
      logInfo(`Fetching listings for zip ${zip}`, { zip });

      try {
        const listings = await this.fetchListingsForZip(zip, params);
        allListings.push(...listings);
        logInfo(`Found ${listings.length} listings in ${zip}`, {
          zip,
          count: listings.length,
        });
      } catch (error) {
        logError(`Failed to fetch listings for ${zip}`, error, { zip });
        // Continue with other zips
      }

      // Rate limiting between zips
      await this.delay(500);
    }

    return allListings;
  }

  /**
   * Fetch listings for a single zip code
   */
  private async fetchListingsForZip(
    zip: string,
    params: Omit<SearchParams, "zipCodes">
  ): Promise<BatchLeadsListing[]> {
    const listings: BatchLeadsListing[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      const response = await withRetry(async () => {
        const res = await fetch(`${this.baseUrl}/properties/search`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filters: {
              zip,
              listingStatus: "active",
              minDaysOnMarket: params.minDaysOnMarket,
              minPrice: params.minPrice,
              maxPrice: params.maxPrice,
              propertyTypes: params.propertyTypes,
            },
            pagination: {
              page,
              pageSize,
            },
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`BatchLeads API error: ${res.status} - ${errorText}`);
        }

        return res.json() as Promise<{ data?: BatchLeadsListing[] }>;
      });

      const data = response.data || [];
      listings.push(...data);
      hasMore = data.length === pageSize;
      page++;

      // Rate limiting between pages
      await this.delay(200);
    }

    return listings;
  }

  /**
   * Skip trace a single address
   */
  async skipTrace(address: string, zip: string): Promise<SkipTraceResult> {
    return withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/skip-trace`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address,
          zip,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Skip trace failed: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as {
        owner?: { firstName?: string; lastName?: string; fullName?: string };
        emails?: Array<{ email: string; type: string; confidence: number }>;
        phones?: Array<{ phone: string; type: string; confidence: number }>;
        mailingAddress?: { street?: string; city?: string; state?: string; zip?: string };
      };

      return {
        success: true,
        owner: {
          firstName: data.owner?.firstName || "",
          lastName: data.owner?.lastName || "",
          fullName: data.owner?.fullName || "",
        },
        emails: data.emails || [],
        phones: data.phones || [],
        mailingAddress: {
          street: data.mailingAddress?.street || "",
          city: data.mailingAddress?.city || "",
          state: data.mailingAddress?.state || "",
          zip: data.mailingAddress?.zip || "",
        },
      };
    });
  }

  /**
   * Batch skip trace multiple addresses
   */
  async batchSkipTrace(
    addresses: Array<{ address: string; zip: string }>
  ): Promise<Map<string, SkipTraceResult>> {
    const results = new Map<string, SkipTraceResult>();

    for (const { address, zip } of addresses) {
      try {
        const result = await this.skipTrace(address, zip);
        results.set(address, result);
      } catch (error) {
        logError(`Skip trace failed for ${address}`, error, { address, zip });
        results.set(address, {
          success: false,
          owner: { firstName: "", lastName: "", fullName: "" },
          emails: [],
          phones: [],
          mailingAddress: { street: "", city: "", state: "", zip: "" },
        });
      }

      // Rate limiting
      await this.delay(100);
    }

    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
