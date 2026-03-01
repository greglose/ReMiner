import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "../config/firebase";
import { META_APP_ID, META_APP_SECRET } from "../config/secrets";
import { withRetry } from "../utils/retry";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logInfo, logWarn, logError } from "../utils/logging";

const META_API_VERSION = "v19.0";

/**
 * Check Meta token expiration daily and refresh if needed
 */
export const checkMetaTokenExpiration = onSchedule(
  {
    schedule: "0 1 * * *", // 1 AM daily
    timeZone: "America/New_York",
    memory: "256MiB",
    secrets: [META_APP_ID, META_APP_SECRET],
  },
  async () => {
    const db = getDb();
    const tokenDoc = await db.collection("tokenRefresh").doc("meta").get();

    if (!tokenDoc.exists) {
      logWarn("No Meta token found in tokenRefresh collection");
      return;
    }

    const tokenData = tokenDoc.data()!;
    const expiresAt = (tokenData.expiresAt as Timestamp).toDate();
    const daysUntilExpiry = Math.floor(
      (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    logInfo(`Meta token expires in ${daysUntilExpiry} days`, { daysUntilExpiry });

    if (daysUntilExpiry <= 7) {
      // Attempt to refresh
      try {
        const newToken = await refreshLongLivedToken(
          tokenData.accessToken,
          META_APP_ID.value(),
          META_APP_SECRET.value()
        );

        await tokenDoc.ref.update({
          accessToken: newToken.accessToken,
          expiresAt: Timestamp.fromDate(
            new Date(Date.now() + newToken.expiresIn * 1000)
          ),
          lastRefreshedAt: FieldValue.serverTimestamp(),
          refreshAttempts: 0,
          lastError: null,
        });

        logInfo("Meta token refreshed successfully", {
          newExpiresIn: newToken.expiresIn,
        });

        // Create success alert
        await db.collection("alerts").add({
          userId: "system",
          type: "token_refreshed",
          title: "Meta token refreshed",
          message: `Token will now expire in ${Math.floor(newToken.expiresIn / 86400)} days`,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (error) {
        logError("Failed to refresh Meta token", error);

        await tokenDoc.ref.update({
          refreshAttempts: FieldValue.increment(1),
          lastError: error instanceof Error ? error.message : "Unknown error",
        });

        // Create critical alert
        await db.collection("alerts").add({
          userId: "system",
          type: "token_refresh_failed",
          title: "CRITICAL: Meta token refresh failed",
          message: `Token expires in ${daysUntilExpiry} days. Manual intervention required.`,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }
  }
);

/**
 * Refresh a long-lived access token
 */
async function refreshLongLivedToken(
  currentToken: string,
  appId: string,
  appSecret: string
): Promise<{ accessToken: string; expiresIn: number }> {
  return withRetry(async () => {
    const url = new URL(
      `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`
    );
    url.searchParams.set("grant_type", "fb_exchange_token");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("client_secret", appSecret);
    url.searchParams.set("fb_exchange_token", currentToken);

    const response = await fetch(url.toString());

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Token refresh failed: ${JSON.stringify(error)}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in?: number };
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 5184000, // Default 60 days
    };
  });
}

/**
 * Get a valid Meta access token
 * Throws if token is expired or not configured
 */
export async function getValidMetaToken(): Promise<string> {
  const db = getDb();
  const tokenDoc = await db.collection("tokenRefresh").doc("meta").get();

  if (!tokenDoc.exists) {
    throw new Error("No Meta token configured");
  }

  const tokenData = tokenDoc.data()!;
  const expiresAt = (tokenData.expiresAt as Timestamp).toDate();

  if (expiresAt < new Date()) {
    throw new Error("Meta token has expired");
  }

  return tokenData.accessToken;
}

/**
 * Store initial Meta token
 */
export async function storeMetaToken(
  accessToken: string,
  expiresInSeconds: number
): Promise<void> {
  const db = getDb();
  await db.collection("tokenRefresh").doc("meta").set({
    service: "meta",
    accessToken,
    refreshToken: null,
    expiresAt: Timestamp.fromDate(new Date(Date.now() + expiresInSeconds * 1000)),
    lastRefreshedAt: FieldValue.serverTimestamp(),
    refreshAttempts: 0,
    lastError: null,
  });

  logInfo("Meta token stored", { expiresInSeconds });
}
