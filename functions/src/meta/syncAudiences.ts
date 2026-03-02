import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "../config/firebase";
import { FEATURES } from "../config/features";
import { getValidMetaToken } from "./tokenRefresh";
import { MetaAdsClient } from "./clients/metaAds";
import { FieldValue } from "firebase-admin/firestore";
import { logInfo, logError, logMetric } from "../utils/logging";
import type { Config, Lead } from "../types";

const MIN_AUDIENCE_SIZE = 100; // Meta requires minimum 100 users

/**
 * Sync leads to Meta Custom Audiences daily
 */
export const syncMetaAudiences = onSchedule(
  {
    schedule: "0 3 * * *", // 3 AM daily
    timeZone: "America/New_York",
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async () => {
    if (!FEATURES.META_ADS) {
      logInfo("Meta Ads sync disabled via feature flag");
      return;
    }

    const db = getDb();

    // Get valid token (will throw if expired)
    let accessToken: string;
    try {
      accessToken = await getValidMetaToken();
    } catch (error) {
      logError("Cannot sync Meta audiences - token invalid", error);
      return;
    }

    const configSnap = await db.collection("config").get();

    for (const configDoc of configSnap.docs) {
      const config = configDoc.data() as Config;
      if (!config.metaAdsEnabled) continue;

      const userId = configDoc.id;
      logInfo(`Syncing Meta audiences for user ${userId}`, { userId });

      const client = new MetaAdsClient(accessToken, config.metaAdAccountId);

      try {
        // Get or create the audience
        const audienceId = await getOrCreateAudience(db, userId, client);

        // Find leads not yet added (user's leads only)
        const leadsSnap = await db
          .collection("leads")
          .where("userId", "==", userId)
          .where("addedToMetaAudience", "==", false)
          .where("status", "in", ["enriched", "outreach_active", "responded"])
          .limit(10000)
          .get();

        if (leadsSnap.empty) {
          logInfo(`No new leads to add for user ${userId}`, { userId });
          continue;
        }

        const leads = leadsSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as Lead)
        );

        // Filter to leads with email or phone
        const validLeads = leads.filter(
          (l) =>
            (l.emails && l.emails.length > 0) ||
            (l.phones && l.phones.length > 0)
        );

        if (validLeads.length < MIN_AUDIENCE_SIZE) {
          logInfo(
            `Only ${validLeads.length} leads available, need ${MIN_AUDIENCE_SIZE} minimum`,
            { userId, count: validLeads.length }
          );
        }

        logInfo(`Uploading ${validLeads.length} leads to Meta audience`, {
          userId,
          count: validLeads.length,
        });

        const uploadedCount = await client.uploadToAudience(audienceId, validLeads);

        // Mark leads as added (batch to avoid timeout)
        const batchSize = 499;
        for (let i = 0; i < validLeads.length; i += batchSize) {
          const batch = db.batch();
          const batchLeads = validLeads.slice(i, i + batchSize);

          for (const lead of batchLeads) {
            batch.update(db.collection("leads").doc(lead.id), {
              addedToMetaAudience: true,
              metaAudienceId: audienceId,
              metaAudienceAddedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }

          await batch.commit();
        }

        // Update audience size
        const size = await client.getAudienceSize(audienceId);
        await db.collection("metaAudiences").doc(audienceId).update({
          memberCount: size,
          lastSyncAt: FieldValue.serverTimestamp(),
        });

        // Update config
        await configDoc.ref.update({
          lastAudienceSyncAt: FieldValue.serverTimestamp(),
        });

        // Log
        await db.collection("outreachLog").add({
          userId,
          leadId: "batch",
          channel: "meta_ad",
          action: "audience_sync",
          details: {
            leadsAdded: uploadedCount,
            audienceId,
            audienceSize: size,
          },
          timestamp: FieldValue.serverTimestamp(),
        });

        logMetric("meta_audience_synced", uploadedCount, { userId });
      } catch (error) {
        logError(`Error syncing Meta audiences for user ${userId}`, error, {
          userId,
        });
      }
    }
  }
);

/**
 * Get or create a custom audience for a user
 */
async function getOrCreateAudience(
  db: FirebaseFirestore.Firestore,
  userId: string,
  client: MetaAdsClient
): Promise<string> {
  const audienceSnap = await db
    .collection("metaAudiences")
    .where("userId", "==", userId)
    .where("type", "==", "motivated_sellers")
    .limit(1)
    .get();

  if (!audienceSnap.empty) {
    return audienceSnap.docs[0].data().metaAudienceId;
  }

  const name = `Motivated Sellers - ${new Date().toISOString().slice(0, 10)}`;
  const description = "Property owners with listings 90+ days on market";

  const metaAudienceId = await client.createCustomAudience(name, description);

  await db.collection("metaAudiences").doc(metaAudienceId).set({
    metaAudienceId,
    userId,
    adAccountId: client.getAdAccountId(),
    name,
    type: "motivated_sellers",
    memberCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    lastSyncAt: null,
  });

  return metaAudienceId;
}
