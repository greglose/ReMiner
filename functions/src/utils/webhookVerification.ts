import crypto from "crypto";

/**
 * Verify SendGrid Event Webhook signature
 * https://docs.sendgrid.com/for-developers/tracking-events/getting-started-event-webhook-security-features
 */
export function verifySendGridSignature(
  publicKey: string,
  payload: string,
  signature: string,
  timestamp: string
): boolean {
  try {
    const timestampPayload = timestamp + payload;
    const decodedSignature = Buffer.from(signature, "base64");

    const verifier = crypto.createVerify("sha256");
    verifier.update(timestampPayload);

    return verifier.verify(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      },
      decodedSignature
    );
  } catch {
    return false;
  }
}

/**
 * Verify SendGrid webhook request
 */
export function verifySendGridWebhook(
  req: { headers: Record<string, string | string[] | undefined>; body: unknown },
  webhookVerificationKey: string
): boolean {
  const signature = req.headers["x-twilio-email-event-webhook-signature"];
  const timestamp = req.headers["x-twilio-email-event-webhook-timestamp"];

  if (!signature || !timestamp) {
    return false;
  }

  const signatureStr = Array.isArray(signature) ? signature[0] : signature;
  const timestampStr = Array.isArray(timestamp) ? timestamp[0] : timestamp;

  if (!signatureStr || !timestampStr) {
    return false;
  }

  const payload = typeof req.body === "string" ? req.body : JSON.stringify(req.body);

  return verifySendGridSignature(
    webhookVerificationKey,
    payload,
    signatureStr,
    timestampStr
  );
}

/**
 * Verify Slack webhook signature
 */
export function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  // Check timestamp is recent (within 5 minutes)
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp) < fiveMinutesAgo) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature =
    "v0=" +
    crypto.createHmac("sha256", signingSecret).update(sigBasestring).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(mySignature),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

/**
 * Generate HMAC signature for outgoing webhooks
 */
export function generateHmacSignature(
  secret: string,
  payload: string,
  algorithm: "sha256" | "sha1" = "sha256"
): string {
  return crypto.createHmac(algorithm, secret).update(payload).digest("hex");
}
