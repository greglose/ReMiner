import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getDb } from "../config/firebase";
import { SENDGRID_API_KEY } from "../config/secrets";
import { FieldValue } from "firebase-admin/firestore";
import { logInfo, logError } from "../utils/logging";
import sgMail from "@sendgrid/mail";
import type { Lead, Config } from "../types";

/**
 * Handle lead status changes and create alerts
 */
export const handleHotLead = onDocumentUpdated(
  {
    document: "leads/{leadId}",
    secrets: [SENDGRID_API_KEY],
  },
  async (event) => {
    const before = event.data?.before.data() as Lead | undefined;
    const after = event.data?.after.data() as Lead | undefined;

    if (!before || !after) return;

    const db = getDb();
    const leadId = event.params.leadId;

    // Detect status change to "responded"
    if (before.status !== "responded" && after.status === "responded") {
      logInfo(`Hot lead detected: ${leadId}`, { leadId });

      // Update timestamp
      await event.data?.after.ref.update({
        respondedAt: FieldValue.serverTimestamp(),
      });

      // Create alert
      await db.collection("alerts").add({
        userId: after.userId,
        type: "hot_lead",
        leadId,
        title: `${after.ownerFirstName || "Owner"} responded!`,
        message: `Lead at ${after.address} has responded to your outreach.`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Send notification email
      try {
        await sendHotLeadNotification(after, SENDGRID_API_KEY.value());
      } catch (error) {
        logError("Failed to send hot lead notification", error, { leadId });
      }
    }

    // Detect high engagement (3+ opens)
    if (after.emailOpens >= 3 && before.emailOpens < 3) {
      await db.collection("alerts").add({
        userId: after.userId,
        type: "high_engagement",
        leadId,
        title: "High email engagement",
        message: `Lead at ${after.address} has opened your emails ${after.emailOpens} times.`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    // Detect RVM callback
    if (!before.rvmCallbackReceived && after.rvmCallbackReceived) {
      await db.collection("alerts").add({
        userId: after.userId,
        type: "rvm_callback",
        leadId,
        title: "Voicemail callback received",
        message: `Lead at ${after.address} called back after RVM.`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }
);

/**
 * Send email notification for hot lead
 */
async function sendHotLeadNotification(
  lead: Lead,
  sendgridApiKey: string
): Promise<void> {
  const db = getDb();

  // Get user config for notification email
  const configDoc = await db.collection("config").doc(lead.userId).get();
  if (!configDoc.exists) return;

  const config = configDoc.data() as Config;
  const notifyEmail = config.replyToEmail || config.fromEmail;

  if (!notifyEmail) return;

  sgMail.setApiKey(sendgridApiKey);

  const msg = {
    to: notifyEmail,
    from: {
      email: config.fromEmail,
      name: "Lead Alert",
    },
    subject: `Hot Lead: ${lead.ownerFirstName || "Owner"} responded!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e53e3e;">A lead has responded to your outreach!</h2>

        <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Property:</strong> ${lead.address}</p>
          <p><strong>City:</strong> ${lead.city}, ${lead.state} ${lead.zipCode}</p>
          <p><strong>Owner:</strong> ${lead.ownerName}</p>
          <p><strong>List Price:</strong> $${lead.listPrice.toLocaleString()}</p>
          <p><strong>Days on Market:</strong> ${lead.daysOnMarket}</p>
        </div>

        <div style="background: #edf2f7; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Contact Information</h3>
          ${lead.emails.map((e) => `<p>Email: <a href="mailto:${e}">${e}</a></p>`).join("")}
          ${lead.phones.map((p) => `<p>Phone: <a href="tel:${p}">${p}</a></p>`).join("")}
        </div>

        <p style="color: #718096; font-size: 12px; margin-top: 30px;">
          This is an automated notification from REMiner.
        </p>
      </div>
    `,
  };

  await sgMail.send(msg);
  logInfo("Sent hot lead notification", { leadId: lead.id, notifyEmail });
}
