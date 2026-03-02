import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "../config/firebase";
import { FEATURES } from "../config/features";
import {
  SLYBROADCAST_UID,
  SLYBROADCAST_PASSWORD,
  DNC_API_KEY,
  DNC_API_SECRET,
} from "../config/secrets";
import { SlybroadcastClient } from "./clients/slybroadcast";
import { DncChecker } from "../utils/dncCheck";
import { filterLeadsByState } from "./stateFiltering";
import { FieldValue } from "firebase-admin/firestore";
import { logInfo, logError, logMetric } from "../utils/logging";
import { sleep } from "../utils/retry";
import type { Config, Lead } from "../types";

/**
 * Process RVM drops on weekdays at 11 AM
 */
export const processRVMDrops = onSchedule(
  {
    schedule: "0 11 * * 1-5", // 11 AM weekdays only
    timeZone: "America/New_York",
    memory: "256MiB",
    timeoutSeconds: 540,
    secrets: [SLYBROADCAST_UID, SLYBROADCAST_PASSWORD, DNC_API_KEY, DNC_API_SECRET],
  },
  async () => {
    if (!FEATURES.SLYBROADCAST_RVM) {
      logInfo("RVM processing disabled via feature flag");
      return;
    }

    const db = getDb();
    const configSnap = await db.collection("config").get();

    for (const configDoc of configSnap.docs) {
      const config = configDoc.data() as Config;
      if (!config.rvmEnabled) continue;

      const userId = configDoc.id;
      logInfo(`Processing RVM drops for user ${userId}`, { userId });

      const rvmClient = new SlybroadcastClient({
        uid: SLYBROADCAST_UID.value(),
        password: SLYBROADCAST_PASSWORD.value(),
        callerId: config.rvmCallerId,
        audioUrl: config.rvmAudioUrl,
      });

      const dncChecker = new DncChecker(
        DNC_API_KEY.value(),
        DNC_API_SECRET.value()
      );

      // Find eligible leads
      const leadsSnap = await db
        .collection("leads")
        .where("userId", "==", userId)
        .where("status", "==", "outreach_active")
        .where("emailSequenceStep", ">=", config.rvmStartAfterStep || 3)
        .where("rvmSentAt", "==", null)
        .limit(100) // Daily cap
        .get();

      if (leadsSnap.empty) {
        logInfo(`No eligible leads for RVM for user ${userId}`, { userId });
        continue;
      }

      const leads = leadsSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Lead)
      );

      // Filter by phone availability
      const leadsWithPhone = leads.filter(
        (l) => l.primaryPhone || (l.phones && l.phones.length > 0)
      );

      // Filter by state laws
      const { allowed: stateAllowed, blocked: stateBlocked } = filterLeadsByState(
        leadsWithPhone.map((l) => ({ id: l.id, state: l.state })),
        config.rvmBlockedStates || []
      );

      if (stateBlocked.length > 0) {
        logInfo(`${stateBlocked.length} leads blocked by state restrictions`, {
          userId,
          blockedCount: stateBlocked.length,
        });
      }

      const eligibleLeads = leadsWithPhone.filter((l) =>
        stateAllowed.some((a) => a.id === l.id)
      );

      // Re-check DNC before sending
      const phonesToCheck = eligibleLeads.map(
        (l) => l.primaryPhone || l.phones[0]
      );
      const dncResults = await dncChecker.checkPhones(phonesToCheck);

      let sentCount = 0;
      let failCount = 0;
      let dncBlockedCount = 0;

      for (const lead of eligibleLeads) {
        const phone = lead.primaryPhone || lead.phones[0];
        const dncResult = dncResults.get(phone);

        if (dncResult?.isBlocked) {
          dncBlockedCount++;
          await db.collection("leads").doc(lead.id).update({
            dncStatus: "blocked",
            dncBlockedPhones: FieldValue.arrayUnion(phone),
            updatedAt: FieldValue.serverTimestamp(),
          });
          continue;
        }

        try {
          const result = await rvmClient.sendVoicemail(phone);

          await db.collection("leads").doc(lead.id).update({
            rvmSentAt: FieldValue.serverTimestamp(),
            rvmDeliveryStatus: result.success ? "delivered" : "failed",
            updatedAt: FieldValue.serverTimestamp(),
          });

          await db.collection("outreachLog").add({
            userId,
            leadId: lead.id,
            channel: "rvm",
            action: result.success ? "delivered" : "failed",
            details: {
              phone,
              deliveryId: result.deliveryId,
              error: result.error,
            },
            timestamp: FieldValue.serverTimestamp(),
          });

          if (result.success) {
            sentCount++;
          } else {
            failCount++;
          }

          // Rate limit: 1 per second (Slybroadcast limit)
          await sleep(1000);
        } catch (error) {
          logError(`RVM failed for ${lead.id}`, error, { leadId: lead.id });
          failCount++;
        }
      }

      logInfo(`Completed RVM drops for ${userId}`, {
        userId,
        sentCount,
        failCount,
        dncBlockedCount,
        stateBlockedCount: stateBlocked.length,
      });

      logMetric("rvm_sent", sentCount, { userId });
      logMetric("rvm_dnc_blocked", dncBlockedCount, { userId });
    }
  }
);
