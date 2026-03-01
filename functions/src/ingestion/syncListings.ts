import { onSchedule } from "firebase-functions/v2/scheduler";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { CloudTasksClient } from "@google-cloud/tasks";
import { getDb } from "../config/firebase";
import { BATCHLEADS_API_KEY } from "../config/secrets";
import { BatchLeadsClient } from "./clients/batchleads";
import { FieldValue } from "firebase-admin/firestore";
import { logInfo, logError, logMetric } from "../utils/logging";
import type { Config, Lead } from "../types";

const tasksClient = new CloudTasksClient();
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "";
const LOCATION = "us-central1";
const QUEUE_NAME = "listing-sync";

/**
 * Orchestrator: Runs daily, dispatches per-zip tasks
 */
export const syncListingsOrchestrator = onSchedule(
  {
    schedule: "0 6 * * *", // 6 AM daily
    timeZone: "America/New_York",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async () => {
    const db = getDb();
    const configSnap = await db.collection("config").get();

    let tasksCreated = 0;

    for (const configDoc of configSnap.docs) {
      const config = configDoc.data() as Config;
      const userId = configDoc.id;

      if (!config.targetZipCodes || config.targetZipCodes.length === 0) {
        logInfo(`No target zip codes for user ${userId}`, { userId });
        continue;
      }

      // Create a task for each zip code
      for (const zipCode of config.targetZipCodes) {
        try {
          await createSyncTask(userId, zipCode, config);
          tasksCreated++;
        } catch (error) {
          logError(`Failed to create sync task for ${zipCode}`, error, {
            userId,
            zipCode,
          });
        }
      }
    }

    logInfo(`Created ${tasksCreated} sync tasks`, { tasksCreated });
    logMetric("sync_tasks_created", tasksCreated);
  }
);

/**
 * Create a Cloud Task to sync a single zip code
 */
async function createSyncTask(
  userId: string,
  zipCode: string,
  config: Config
): Promise<void> {
  const queuePath = tasksClient.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);

  const functionUrl = `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net/syncListingsWorker`;

  const task = {
    httpRequest: {
      httpMethod: "POST" as const,
      url: functionUrl,
      headers: { "Content-Type": "application/json" },
      body: Buffer.from(
        JSON.stringify({
          userId,
          zipCode,
          minDaysOnMarket: config.minDaysOnMarket,
          minPrice: config.minListPrice,
          maxPrice: config.maxListPrice,
          propertyTypes: config.propertyTypes,
          dataProvider: config.dataProvider,
        })
      ).toString("base64"),
      oidcToken: {
        serviceAccountEmail: `${PROJECT_ID}@appspot.gserviceaccount.com`,
      },
    },
    scheduleTime: {
      seconds: Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 60),
    },
  };

  await tasksClient.createTask({ parent: queuePath, task });
}

interface SyncTaskData {
  userId: string;
  zipCode: string;
  minDaysOnMarket: number;
  minPrice?: number;
  maxPrice?: number;
  propertyTypes?: string[];
  dataProvider: string;
}

/**
 * Worker: Processes a single zip code
 */
export const syncListingsWorker = onTaskDispatched(
  {
    retryConfig: {
      maxAttempts: 3,
      minBackoffSeconds: 30,
    },
    rateLimits: {
      maxConcurrentDispatches: 10,
    },
    memory: "512MiB",
    timeoutSeconds: 300,
    secrets: [BATCHLEADS_API_KEY],
  },
  async (req) => {
    const { userId, zipCode, minDaysOnMarket, minPrice, maxPrice, propertyTypes } =
      req.data as SyncTaskData;

    const db = getDb();
    const client = new BatchLeadsClient(BATCHLEADS_API_KEY.value());

    logInfo(`Processing zip ${zipCode} for user ${userId}`, { userId, zipCode });

    try {
      // Fetch listings
      const listings = await client.searchListings({
        zipCodes: [zipCode],
        minDaysOnMarket,
        minPrice,
        maxPrice,
        propertyTypes,
      });

      logInfo(`Found ${listings.length} listings in ${zipCode}`, {
        userId,
        zipCode,
        count: listings.length,
      });

      let newCount = 0;
      let updatedCount = 0;

      // Process each listing
      for (const listing of listings) {
        const leadId = generateLeadId(listing.address.street, listing.address.zip);
        const leadRef = db.collection("leads").doc(leadId);

        const existing = await leadRef.get();

        if (existing.exists) {
          // Update existing lead
          await leadRef.update({
            daysOnMarket: listing.listing.daysOnMarket,
            listPrice: listing.listing.price,
            updatedAt: FieldValue.serverTimestamp(),
          });
          updatedCount++;
        } else {
          // Create new lead
          const lead: Partial<Lead> = {
            id: leadId,
            userId,
            address: listing.address.street,
            city: listing.address.city,
            state: listing.address.state,
            zipCode: listing.address.zip,
            county: listing.address.county,
            listPrice: listing.listing.price,
            listDate: new Date(listing.listing.listDate),
            daysOnMarket: listing.listing.daysOnMarket,
            propertyType: listing.property.type,
            bedrooms: listing.property.bedrooms,
            bathrooms: listing.property.bathrooms,
            sqft: listing.property.sqft,
            yearBuilt: listing.property.yearBuilt,
            mlsNumber: listing.listing.mlsNumber,
            listingAgentName: listing.listing.agent.name,
            listingAgentPhone: listing.listing.agent.phone,
            ownerName: listing.owner.name,
            ownerMailingAddress: listing.owner.mailingAddress,
            status: "new",
            source: "batchleads",
            emails: [],
            phones: [],
            primaryEmail: null,
            primaryPhone: null,
            dncStatus: "pending",
            dncBlockedPhones: [],
            tags: [],
            notes: "",
            emailSequenceStep: 0,
            emailOpens: 0,
            emailClicks: 0,
            emailReplies: 0,
            emailBounced: false,
            emailBounceType: null,
            emailUnsubscribed: false,
            addedToMetaAudience: false,
            rvmCallbackReceived: false,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          };

          await leadRef.set(lead);
          newCount++;
        }
      }

      // Update config last sync timestamp
      await db.collection("config").doc(userId).update({
        lastListingSyncAt: FieldValue.serverTimestamp(),
      });

      logInfo(`Completed zip ${zipCode}`, {
        userId,
        zipCode,
        newCount,
        updatedCount,
      });

      logMetric("leads_synced", newCount + updatedCount, { zipCode, userId });
    } catch (error) {
      logError(`Failed to process zip ${zipCode}`, error, { userId, zipCode });
      throw error; // Let Cloud Tasks retry
    }
  }
);

/**
 * Generate a consistent lead ID from address and zip
 */
function generateLeadId(address: string, zip: string): string {
  return `${address}-${zip}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}
