import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getDb } from "../config/firebase";
import { FEATURES } from "../config/features";
import { BATCHLEADS_API_KEY, DNC_API_KEY, DNC_API_SECRET } from "../config/secrets";
import { BatchLeadsClient } from "./clients/batchleads";
import { DncChecker } from "../utils/dncCheck";
import { FieldValue } from "firebase-admin/firestore";
import { logInfo, logError } from "../utils/logging";
import type { Lead } from "../types";

/**
 * Trigger skip trace when a new lead is created
 */
export const skipTraceNewLead = onDocumentCreated(
  {
    document: "leads/{leadId}",
    memory: "256MiB",
    timeoutSeconds: 120,
    secrets: [BATCHLEADS_API_KEY, DNC_API_KEY, DNC_API_SECRET],
  },
  async (event) => {
    const lead = event.data?.data() as Lead | undefined;
    if (!lead || lead.status !== "new") {
      return;
    }

    const db = getDb();
    const leadRef = event.data!.ref;
    const leadId = event.params.leadId;

    // Mark as enriching
    await leadRef.update({
      status: "enriching",
      updatedAt: FieldValue.serverTimestamp(),
    });

    const client = new BatchLeadsClient(BATCHLEADS_API_KEY.value());

    try {
      // Skip trace
      const result = await client.skipTrace(lead.address, lead.zipCode);

      if (!result.success) {
        await leadRef.update({
          status: "dead",
          notes: "Skip trace returned no results",
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }

      // Extract best email and phone (sorted by confidence)
      const emails = result.emails
        .sort((a, b) => b.confidence - a.confidence)
        .map((e) => e.email);

      const phones = result.phones
        .sort((a, b) => b.confidence - a.confidence)
        .map((p) => p.phone);

      // Check DNC for all phones (if enabled)
      let blockedPhones: string[] = [];
      let clearPhones: string[] = [...phones];

      if (FEATURES.DNC_CHECK && phones.length > 0) {
        const dncChecker = new DncChecker(DNC_API_KEY.value(), DNC_API_SECRET.value());
        const dncResults = await dncChecker.checkPhones(phones);
        blockedPhones = [];
        clearPhones = [];

        for (const [phone, dncResult] of dncResults) {
          if (dncResult.isBlocked) {
            blockedPhones.push(phone);
          } else {
            clearPhones.push(phone);
          }
        }
      }

      // Determine final status
      const hasValidContact = emails.length > 0 || clearPhones.length > 0;
      const allPhonesBlocked = phones.length > 0 && clearPhones.length === 0 && FEATURES.DNC_CHECK;

      let finalStatus: string;
      if (!hasValidContact) {
        finalStatus = "dead";
      } else if (allPhonesBlocked && emails.length === 0) {
        finalStatus = "dnc_blocked";
      } else {
        finalStatus = "enriched";
      }

      await leadRef.update({
        ownerName: result.owner.fullName,
        ownerFirstName: result.owner.firstName,
        ownerLastName: result.owner.lastName,
        emails,
        phones,
        primaryEmail: emails[0] || null,
        primaryPhone: clearPhones[0] || phones[0] || null,
        ownerMailingAddress: result.mailingAddress.street,
        ownerMailingCity: result.mailingAddress.city,
        ownerMailingState: result.mailingAddress.state,
        ownerMailingZip: result.mailingAddress.zip,
        dncStatus: FEATURES.DNC_CHECK ? (blockedPhones.length > 0 ? "blocked" : "clear") : "pending",
        dncBlockedPhones: blockedPhones,
        dncCheckedAt: FEATURES.DNC_CHECK ? FieldValue.serverTimestamp() : null,
        status: finalStatus,
        enrichedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Log enrichment
      await db.collection("outreachLog").add({
        userId: lead.userId,
        leadId,
        channel: "skip_trace",
        action: "enriched",
        details: {
          emailsFound: emails.length,
          phonesFound: phones.length,
          dncBlocked: blockedPhones.length,
          finalStatus,
        },
        timestamp: FieldValue.serverTimestamp(),
      });

      logInfo(`Skip traced lead ${leadId}: ${finalStatus}`, {
        leadId,
        emailsFound: emails.length,
        phonesFound: phones.length,
        dncBlocked: blockedPhones.length,
      });
    } catch (error) {
      logError(`Skip trace failed for ${leadId}`, error, { leadId });

      await leadRef.update({
        status: "dead",
        notes: `Skip trace failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
);
