import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "../config/firebase";
import { getValidMetaToken } from "../meta/tokenRefresh";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logInfo, logError } from "../utils/logging";

interface HealthCheckResult {
  firestore: boolean;
  metaToken: boolean;
  recentSync: boolean;
  recentEmails: boolean;
}

/**
 * Daily health check
 */
export const dailyHealthCheck = onSchedule(
  {
    schedule: "0 7 * * *", // 7 AM daily
    timeZone: "America/New_York",
    memory: "256MiB",
  },
  async () => {
    const db = getDb();
    const checks: HealthCheckResult = {
      firestore: false,
      metaToken: false,
      recentSync: false,
      recentEmails: false,
    };
    const errors: string[] = [];

    // Check Firestore connectivity
    try {
      await db.collection("_healthcheck").doc("test").set({
        timestamp: new Date(),
      });
      await db.collection("_healthcheck").doc("test").get();
      checks.firestore = true;
    } catch (error) {
      checks.firestore = false;
      errors.push(`Firestore: ${error instanceof Error ? error.message : error}`);
    }

    // Check Meta token validity
    try {
      await getValidMetaToken();
      checks.metaToken = true;
    } catch (error) {
      checks.metaToken = false;
      errors.push(`Meta token: ${error instanceof Error ? error.message : error}`);
    }

    // Check recent lead sync (within 48 hours)
    try {
      const recentLeads = await db
        .collection("leads")
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();

      if (!recentLeads.empty) {
        const lastLead = recentLeads.docs[0].data();
        const lastCreated = (lastLead.createdAt as Timestamp)?.toDate();

        if (lastCreated) {
          const hoursSinceLastLead =
            (Date.now() - lastCreated.getTime()) / (1000 * 60 * 60);

          checks.recentSync = hoursSinceLastLead < 48;
          if (!checks.recentSync) {
            errors.push(`No new leads in ${hoursSinceLastLead.toFixed(0)} hours`);
          }
        }
      }
    } catch (error) {
      checks.recentSync = false;
      errors.push(`Recent sync check: ${error instanceof Error ? error.message : error}`);
    }

    // Check recent email activity
    try {
      const recentLogs = await db
        .collection("outreachLog")
        .where("channel", "==", "email")
        .where("action", "==", "sent")
        .orderBy("timestamp", "desc")
        .limit(1)
        .get();

      if (!recentLogs.empty) {
        const lastLog = recentLogs.docs[0].data();
        const lastSent = (lastLog.timestamp as Timestamp)?.toDate();

        if (lastSent) {
          const hoursSinceLastEmail =
            (Date.now() - lastSent.getTime()) / (1000 * 60 * 60);

          checks.recentEmails = hoursSinceLastEmail < 48;
          if (!checks.recentEmails) {
            errors.push(
              `No emails sent in ${hoursSinceLastEmail.toFixed(0)} hours`
            );
          }
        }
      }
    } catch (error) {
      checks.recentEmails = false;
      errors.push(`Recent email check: ${error instanceof Error ? error.message : error}`);
    }

    // Log results
    const allPassed = Object.values(checks).every((v) => v);

    if (allPassed) {
      logInfo("Health check passed", { checks });
    } else {
      logError("Health check failed", new Error(errors.join("; ")), { checks });

      // Create alert
      await db.collection("alerts").add({
        userId: "system",
        type: "health_check_failed",
        title: "System health check failed",
        message: errors.join("\n"),
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    // Store health check result
    await db.collection("_healthcheck").doc("latest").set({
      checks,
      errors,
      passed: allPassed,
      timestamp: FieldValue.serverTimestamp(),
    });
  }
);
