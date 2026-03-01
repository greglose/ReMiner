import { onRequest } from "firebase-functions/v2/https";
import { getDb } from "../config/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { logInfo, logError } from "../utils/logging";
import Busboy from "busboy";

interface ParsedEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  headers: string;
}

/**
 * Handle inbound emails via SendGrid Inbound Parse
 */
export const sendgridInboundParse = onRequest(
  {
    memory: "256MiB",
    cors: false,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    try {
      const email = await parseMultipartForm(req);
      logInfo("Received inbound email", {
        from: email.from,
        to: email.to,
        subject: email.subject,
      });

      const db = getDb();

      // Extract lead ID from reply-to or references
      const leadId = extractLeadId(email);

      if (!leadId) {
        logInfo("Could not extract leadId from inbound email", {
          to: email.to,
          subject: email.subject,
        });
        res.status(200).send("OK");
        return;
      }

      // Find and update the lead
      const leadRef = db.collection("leads").doc(leadId);
      const leadDoc = await leadRef.get();

      if (!leadDoc.exists) {
        logInfo(`Lead ${leadId} not found for reply`, { leadId });
        res.status(200).send("OK");
        return;
      }

      const lead = leadDoc.data()!;

      // Update lead status
      await leadRef.update({
        status: "responded",
        emailReplies: FieldValue.increment(1),
        respondedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Log the reply
      await db.collection("outreachLog").add({
        userId: lead.userId,
        leadId,
        channel: "email",
        action: "replied",
        details: {
          from: email.from,
          subject: email.subject,
          preview: email.text.slice(0, 500),
        },
        timestamp: FieldValue.serverTimestamp(),
      });

      // Create hot lead alert
      await db.collection("alerts").add({
        userId: lead.userId,
        type: "hot_lead",
        leadId,
        title: `${lead.ownerFirstName || "Owner"} replied!`,
        message: `Reply received for ${lead.address}`,
        preview: email.text.slice(0, 200),
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      logInfo(`Processed reply for lead ${leadId}`, { leadId, from: email.from });

      res.status(200).send("OK");
    } catch (error) {
      logError("Error processing inbound email", error);
      res.status(500).send("Error");
    }
  }
);

/**
 * Parse multipart form data from SendGrid
 */
async function parseMultipartForm(req: unknown): Promise<ParsedEmail> {
  const httpReq = req as {
    headers: Record<string, string | string[] | undefined>;
    pipe: (dest: unknown) => void;
  };

  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: httpReq.headers as Record<string, string> });
    const fields: Record<string, string> = {};

    busboy.on("field", (name: string, value: string) => {
      fields[name] = value;
    });

    busboy.on("finish", () => {
      resolve({
        from: fields.from || "",
        to: fields.to || "",
        subject: fields.subject || "",
        text: fields.text || "",
        html: fields.html || "",
        headers: fields.headers || "",
      });
    });

    busboy.on("error", reject);

    httpReq.pipe(busboy);
  });
}

/**
 * Extract lead ID from email
 */
function extractLeadId(email: ParsedEmail): string | null {
  // Try to extract from To address (e.g., reply+leadId@replies.domain.com)
  const toMatch = email.to.match(/reply\+([a-z0-9-]+)@/i);
  if (toMatch) {
    return toMatch[1];
  }

  // Try to extract from In-Reply-To or References headers
  const headersLower = email.headers.toLowerCase();
  const leadIdMatch = headersLower.match(/leadid[=:]\s*([a-z0-9-]+)/i);
  if (leadIdMatch) {
    return leadIdMatch[1];
  }

  // Try to extract from subject (Re: ... [lead-id])
  const subjectMatch = email.subject.match(/\[([a-z0-9-]+)\]$/i);
  if (subjectMatch) {
    return subjectMatch[1];
  }

  return null;
}
