import { onRequest } from "firebase-functions/v2/https";
import { getDb } from "../config/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { logInfo, logWarn } from "../utils/logging";

/**
 * Handle unsubscribe requests
 * URL: /unsubscribe?id={leadId}
 */
export const handleUnsubscribe = onRequest(
  {
    memory: "256MiB",
    cors: true,
  },
  async (req, res) => {
    const leadId = req.query.id as string;

    if (!leadId) {
      res.status(400).send(renderPage("error", "Invalid unsubscribe link"));
      return;
    }

    const db = getDb();
    const leadRef = db.collection("leads").doc(leadId);
    const leadDoc = await leadRef.get();

    if (!leadDoc.exists) {
      logWarn("Unsubscribe attempt for non-existent lead", { leadId });
      res.status(404).send(renderPage("error", "Link expired or invalid"));
      return;
    }

    const lead = leadDoc.data()!;

    // Handle GET (show confirmation) and POST (process)
    if (req.method === "GET") {
      res.send(
        renderPage(
          "confirm",
          `Are you sure you want to unsubscribe ${lead.primaryEmail || lead.emails?.[0] || "this email"}?`,
          leadId
        )
      );
      return;
    }

    if (req.method === "POST") {
      // Process unsubscribe
      await leadRef.update({
        emailUnsubscribed: true,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Log the unsubscribe
      await db.collection("outreachLog").add({
        userId: lead.userId,
        leadId,
        channel: "email",
        action: "unsubscribed",
        details: {
          method: "web_form",
          email: lead.primaryEmail || lead.emails?.[0],
        },
        timestamp: FieldValue.serverTimestamp(),
      });

      logInfo("Lead unsubscribed", { leadId, email: lead.primaryEmail });

      res.send(
        renderPage(
          "success",
          "You have been successfully unsubscribed. You will no longer receive emails from us."
        )
      );
      return;
    }

    res.status(405).send(renderPage("error", "Method not allowed"));
  }
);

/**
 * Render HTML page
 */
function renderPage(
  type: "confirm" | "success" | "error",
  message: string,
  leadId?: string
): string {
  const colors = {
    confirm: "#3182ce",
    success: "#38a169",
    error: "#e53e3e",
  };

  const icons = {
    confirm: "?",
    success: "✓",
    error: "✗",
  };

  const buttonHtml =
    type === "confirm"
      ? `
        <form method="POST" style="margin-top: 20px;">
          <input type="hidden" name="id" value="${leadId}">
          <button type="submit" style="
            background: ${colors.confirm};
            color: white;
            border: none;
            padding: 12px 24px;
            font-size: 16px;
            border-radius: 6px;
            cursor: pointer;
          ">
            Yes, Unsubscribe Me
          </button>
        </form>
        <p style="margin-top: 15px; color: #718096; font-size: 14px;">
          <a href="/" style="color: #718096;">Cancel</a>
        </p>
      `
      : "";

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Unsubscribe</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #f7fafc;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          text-align: center;
          max-width: 400px;
          width: 100%;
        }
        .icon {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: ${colors[type]};
          color: white;
          font-size: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
        }
        h1 {
          color: #1a202c;
          font-size: 24px;
          margin-bottom: 15px;
        }
        p {
          color: #4a5568;
          line-height: 1.6;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">${icons[type]}</div>
        <h1>${type === "confirm" ? "Unsubscribe" : type === "success" ? "Unsubscribed" : "Error"}</h1>
        <p>${message}</p>
        ${buttonHtml}
      </div>
    </body>
    </html>
  `;
}
