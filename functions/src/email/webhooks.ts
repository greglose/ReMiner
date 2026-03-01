import { onRequest } from "firebase-functions/v2/https";
import { getDb } from "../config/firebase";
import { SENDGRID_WEBHOOK_SECRET } from "../config/secrets";
import { verifySendGridWebhook } from "../utils/webhookVerification";
import { recordBounce, recordComplaint } from "./warmup";
import { FieldValue } from "firebase-admin/firestore";
import { logInfo, logWarn, logError } from "../utils/logging";

interface SendGridEvent {
  event: string;
  email: string;
  timestamp: number;
  leadId?: string;
  userId?: string;
  sequenceId?: string;
  stepNumber?: string;
  sg_message_id?: string;
  url?: string;
  reason?: string;
  bounce_classification?: string;
  type?: string;
}

/**
 * Handle SendGrid webhook events
 */
export const sendgridWebhook = onRequest(
  {
    memory: "256MiB",
    cors: false,
    secrets: [SENDGRID_WEBHOOK_SECRET],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    // Verify webhook signature
    const webhookSecret = SENDGRID_WEBHOOK_SECRET.value();
    if (webhookSecret && !verifySendGridWebhook(req, webhookSecret)) {
      logWarn("Invalid SendGrid webhook signature", {
        ip: req.ip,
      });
      res.status(401).send("Invalid signature");
      return;
    }

    const events: SendGridEvent[] = req.body;

    if (!Array.isArray(events)) {
      res.status(400).send("Invalid payload");
      return;
    }

    logInfo(`Received ${events.length} SendGrid events`, { count: events.length });

    const db = getDb();

    for (const event of events) {
      try {
        // Store raw event
        await db.collection("webhookEvents").add({
          source: "sendgrid",
          eventType: event.event,
          payload: event,
          receivedAt: FieldValue.serverTimestamp(),
          processedAt: null,
          error: null,
        });

        // Process event
        const leadId = event.leadId;
        const userId = event.userId;
        if (!leadId) continue;

        const leadRef = db.collection("leads").doc(leadId);
        const leadDoc = await leadRef.get();

        if (!leadDoc.exists) {
          logWarn(`Lead ${leadId} not found for event ${event.event}`, {
            leadId,
            event: event.event,
          });
          continue;
        }

        switch (event.event) {
          case "open":
            await leadRef.update({
              emailOpens: FieldValue.increment(1),
              updatedAt: FieldValue.serverTimestamp(),
            });
            break;

          case "click":
            await leadRef.update({
              emailClicks: FieldValue.increment(1),
              updatedAt: FieldValue.serverTimestamp(),
            });
            await logOutreach(db, userId!, leadId, "email", "clicked", {
              url: event.url,
            });
            break;

          case "bounce":
            await handleBounce(db, leadRef, event, userId!);
            break;

          case "dropped":
            await leadRef.update({
              emailBounced: true,
              emailBounceType: "hard",
              status: "dead",
              notes: `Email dropped: ${event.reason}`,
              updatedAt: FieldValue.serverTimestamp(),
            });
            if (userId) await recordBounce(userId);
            await logOutreach(db, userId!, leadId, "email", "dropped", {
              reason: event.reason,
            });
            break;

          case "spamreport":
            await leadRef.update({
              emailUnsubscribed: true,
              status: "dead",
              notes: "Marked as spam",
              updatedAt: FieldValue.serverTimestamp(),
            });
            if (userId) await recordComplaint(userId);
            await logOutreach(db, userId!, leadId, "email", "spam_reported", {});
            break;

          case "unsubscribe":
            await leadRef.update({
              emailUnsubscribed: true,
              updatedAt: FieldValue.serverTimestamp(),
            });
            await logOutreach(db, userId!, leadId, "email", "unsubscribed", {});
            break;
        }
      } catch (error) {
        logError(`Error processing SendGrid event`, error, { event });
      }
    }

    res.status(200).send("OK");
  }
);

/**
 * Handle bounce events with hard/soft differentiation
 */
async function handleBounce(
  db: FirebaseFirestore.Firestore,
  leadRef: FirebaseFirestore.DocumentReference,
  event: SendGridEvent,
  userId: string
): Promise<void> {
  // Differentiate hard vs soft bounces
  const isHardBounce =
    event.bounce_classification === "invalid" ||
    event.bounce_classification === "technical" ||
    event.type === "bounced";

  if (isHardBounce) {
    await leadRef.update({
      emailBounced: true,
      emailBounceType: "hard",
      status: "dead",
      notes: `Hard bounce: ${event.reason || event.bounce_classification}`,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await recordBounce(userId);
  } else {
    // Soft bounce - don't mark as dead, just log
    await leadRef.update({
      emailBounceType: "soft",
      notes: `Soft bounce: ${event.reason || event.bounce_classification}`,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await logOutreach(db, userId, event.leadId!, "email", "bounced", {
    reason: event.reason,
    classification: event.bounce_classification,
    type: isHardBounce ? "hard" : "soft",
  });
}

/**
 * Log outreach activity
 */
async function logOutreach(
  db: FirebaseFirestore.Firestore,
  userId: string,
  leadId: string,
  channel: string,
  action: string,
  details: Record<string, unknown>
): Promise<void> {
  await db.collection("outreachLog").add({
    userId,
    leadId,
    channel,
    action,
    details,
    timestamp: FieldValue.serverTimestamp(),
  });
}
