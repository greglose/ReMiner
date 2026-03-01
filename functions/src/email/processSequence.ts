import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "../config/firebase";
import { SENDGRID_API_KEY } from "../config/secrets";
import { SendGridClient } from "./clients/sendgrid";
import { getWarmupStatus, incrementWarmupCount } from "./warmup";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logInfo, logError, logMetric } from "../utils/logging";
import { sleep } from "../utils/retry";
import type { Config, Lead, EmailSequence, EmailStep } from "../types";

/**
 * Process email sequences for all users daily
 */
export const processEmailSequences = onSchedule(
  {
    schedule: "0 9 * * *", // 9 AM daily
    timeZone: "America/New_York",
    memory: "512MiB",
    timeoutSeconds: 540,
    secrets: [SENDGRID_API_KEY],
  },
  async () => {
    const db = getDb();
    const client = new SendGridClient(SENDGRID_API_KEY.value());

    const configSnap = await db.collection("config").get();

    for (const configDoc of configSnap.docs) {
      const config = configDoc.data() as Config;
      if (!config.emailEnabled) continue;

      const userId = configDoc.id;
      logInfo(`Processing email sequences for user ${userId}`, { userId });

      // Check warmup limits
      const warmup = await getWarmupStatus(userId);
      if (!warmup.canSend) {
        logInfo(`Warmup limit reached for ${userId}`, { userId, ...warmup });
        continue;
      }

      // Get the sequence
      if (!config.emailSequenceId) {
        logInfo(`No email sequence configured for ${userId}`, { userId });
        continue;
      }

      const sequenceDoc = await db
        .collection("emailSequences")
        .doc(config.emailSequenceId)
        .get();

      if (!sequenceDoc.exists) {
        logError(
          `Sequence ${config.emailSequenceId} not found`,
          new Error("Sequence not found"),
          { userId, sequenceId: config.emailSequenceId }
        );
        continue;
      }

      const sequence = sequenceDoc.data() as EmailSequence;

      // Find leads ready for email (user's leads only)
      const leadsSnap = await db
        .collection("leads")
        .where("userId", "==", userId)
        .where("status", "in", ["enriched", "outreach_active"])
        .where("emailBounced", "==", false)
        .where("emailUnsubscribed", "==", false)
        .limit(warmup.remaining === Infinity ? 500 : warmup.remaining)
        .get();

      let sentCount = 0;
      let skipCount = 0;
      let errorCount = 0;

      for (const leadDoc of leadsSnap.docs) {
        // Re-check warmup (may have been updated by other leads)
        if (warmup.status === "active") {
          const currentWarmup = await getWarmupStatus(userId);
          if (!currentWarmup.canSend) {
            logInfo(`Warmup limit reached during processing`, {
              userId,
              sentCount,
            });
            break;
          }
        }

        const lead = { id: leadDoc.id, ...leadDoc.data() } as Lead;

        // Skip if no email
        if (!lead.primaryEmail && (!lead.emails || lead.emails.length === 0)) {
          skipCount++;
          continue;
        }

        // Determine next step
        const nextStep = getNextStep(lead, sequence);
        if (!nextStep) {
          skipCount++;
          continue;
        }

        // Check if ready (delay passed)
        if (!isReadyForStep(lead, nextStep)) {
          skipCount++;
          continue;
        }

        try {
          const { messageId } = await client.sendEmail(lead, nextStep, config);

          // Update lead
          await leadDoc.ref.update({
            emailSequenceId: sequence.id,
            emailSequenceStep: nextStep.stepNumber,
            lastEmailSentAt: FieldValue.serverTimestamp(),
            nextEmailScheduledAt: calculateNextEmailDate(nextStep, sequence),
            status: "outreach_active",
            updatedAt: FieldValue.serverTimestamp(),
          });

          // Log outreach
          await db.collection("outreachLog").add({
            userId,
            leadId: lead.id,
            channel: "email",
            action: "sent",
            details: {
              sequenceId: sequence.id,
              stepNumber: nextStep.stepNumber,
              subject: nextStep.subject,
              messageId,
              toEmail: lead.primaryEmail || lead.emails[0],
            },
            timestamp: FieldValue.serverTimestamp(),
          });

          // Increment warmup counter
          if (warmup.status === "active") {
            await incrementWarmupCount(userId, 1);
          }

          sentCount++;

          // Rate limit: max 10 emails per second
          await sleep(100);
        } catch (error) {
          logError(`Failed to send email to ${lead.id}`, error, {
            leadId: lead.id,
          });
          errorCount++;
        }
      }

      logInfo(`Completed email processing for ${userId}`, {
        userId,
        sentCount,
        skipCount,
        errorCount,
      });

      logMetric("emails_sent", sentCount, { userId });
    }
  }
);

/**
 * Get the next step in the sequence for a lead
 */
function getNextStep(lead: Lead, sequence: EmailSequence): EmailStep | null {
  const currentStep = lead.emailSequenceStep || 0;
  const nextStepNumber = currentStep + 1;

  return sequence.steps.find((s) => s.stepNumber === nextStepNumber) || null;
}

/**
 * Check if lead is ready for the next step (delay passed)
 */
function isReadyForStep(lead: Lead, step: EmailStep): boolean {
  // First email - always ready if enriched
  if (step.stepNumber === 1) {
    return true;
  }

  // Check delay from last email
  if (!lead.lastEmailSentAt) {
    return false;
  }

  const lastSent =
    lead.lastEmailSentAt instanceof Timestamp
      ? lead.lastEmailSentAt.toDate()
      : new Date(lead.lastEmailSentAt as unknown as string);

  const delayMs = (step.delayDays * 24 + step.delayHours) * 60 * 60 * 1000;
  const readyAt = new Date(lastSent.getTime() + delayMs);

  return new Date() >= readyAt;
}

/**
 * Calculate when the next email should be sent
 */
function calculateNextEmailDate(
  currentStep: EmailStep,
  sequence: EmailSequence
): Timestamp | null {
  const nextStep = sequence.steps.find(
    (s) => s.stepNumber === currentStep.stepNumber + 1
  );

  if (!nextStep) {
    return null;
  }

  const delayMs = (nextStep.delayDays * 24 + nextStep.delayHours) * 60 * 60 * 1000;
  return Timestamp.fromDate(new Date(Date.now() + delayMs));
}
