import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "../config/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { logInfo, logWarn } from "../utils/logging";
import type { WarmupStatus } from "../types";

/**
 * Default warmup schedule (14 days to full volume)
 * Day 1-14, then unlimited
 */
const DEFAULT_WARMUP_SCHEDULE = [
  50, // Day 1
  75, // Day 2
  100, // Day 3
  150, // Day 4
  200, // Day 5
  300, // Day 6
  400, // Day 7
  500, // Day 8
  650, // Day 9
  800, // Day 10
  1000, // Day 11
  1250, // Day 12
  1500, // Day 13
  2000, // Day 14+
];

/**
 * Reset warmup counters daily at midnight
 */
export const resetWarmupCounters = onSchedule(
  {
    schedule: "0 0 * * *", // Midnight daily
    timeZone: "America/New_York",
    memory: "256MiB",
  },
  async () => {
    const db = getDb();
    const warmupSnap = await db.collection("warmup").get();

    const batch = db.batch();
    let updatedCount = 0;

    for (const doc of warmupSnap.docs) {
      const warmup = doc.data() as WarmupStatus;

      if (warmup.status !== "active") continue;

      // Advance to next day
      const newDay = Math.min(
        warmup.currentDay + 1,
        DEFAULT_WARMUP_SCHEDULE.length
      );

      // Check if warmup is complete
      if (newDay >= DEFAULT_WARMUP_SCHEDULE.length) {
        batch.update(doc.ref, {
          currentDay: newDay,
          sentToday: 0,
          lastResetAt: FieldValue.serverTimestamp(),
          status: "completed",
        });

        logInfo(`Warmup completed for ${doc.id}`, { configId: doc.id });
      } else {
        batch.update(doc.ref, {
          currentDay: newDay,
          sentToday: 0,
          lastResetAt: FieldValue.serverTimestamp(),
        });

        logInfo(`Warmup advanced to day ${newDay}`, {
          configId: doc.id,
          newDay,
          dailyLimit: getDailyLimit(newDay),
        });
      }

      updatedCount++;
    }

    if (updatedCount > 0) {
      await batch.commit();
    }

    logInfo(`Reset warmup counters for ${updatedCount} configs`);
  }
);

/**
 * Get daily send limit for a given warmup day
 */
export function getDailyLimit(day: number): number {
  const index = Math.min(day - 1, DEFAULT_WARMUP_SCHEDULE.length - 1);
  return DEFAULT_WARMUP_SCHEDULE[Math.max(0, index)];
}

/**
 * Get warmup status for a config
 */
export async function getWarmupStatus(configId: string): Promise<{
  canSend: boolean;
  remaining: number;
  dailyLimit: number;
  day: number;
  status: string;
}> {
  const db = getDb();
  const warmupDoc = await db.collection("warmup").doc(configId).get();

  if (!warmupDoc.exists) {
    // No warmup = no limits
    return {
      canSend: true,
      remaining: Infinity,
      dailyLimit: Infinity,
      day: 0,
      status: "none",
    };
  }

  const warmup = warmupDoc.data() as WarmupStatus;

  if (warmup.status === "completed") {
    return {
      canSend: true,
      remaining: Infinity,
      dailyLimit: Infinity,
      day: warmup.currentDay,
      status: "completed",
    };
  }

  if (warmup.status !== "active") {
    return {
      canSend: false,
      remaining: 0,
      dailyLimit: 0,
      day: warmup.currentDay,
      status: warmup.status,
    };
  }

  const dailyLimit = getDailyLimit(warmup.currentDay);
  const remaining = Math.max(0, dailyLimit - warmup.sentToday);

  return {
    canSend: remaining > 0,
    remaining,
    dailyLimit,
    day: warmup.currentDay,
    status: "active",
  };
}

/**
 * Increment warmup send count
 */
export async function incrementWarmupCount(
  configId: string,
  count: number
): Promise<void> {
  const db = getDb();
  await db.collection("warmup").doc(configId).update({
    sentToday: FieldValue.increment(count),
    totalSent: FieldValue.increment(count),
  });
}

/**
 * Record a bounce for warmup tracking
 */
export async function recordBounce(configId: string): Promise<void> {
  const db = getDb();
  const warmupRef = db.collection("warmup").doc(configId);

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(warmupRef);
    if (!doc.exists) return;

    const warmup = doc.data() as WarmupStatus;
    const newBounced = warmup.totalBounced + 1;
    const bounceRate = warmup.totalSent > 0 ? newBounced / warmup.totalSent : 0;

    // Pause warmup if bounce rate exceeds 5% (after at least 100 sends)
    if (bounceRate > 0.05 && warmup.totalSent >= 100) {
      tx.update(warmupRef, {
        totalBounced: newBounced,
        bounceRate,
        status: "paused",
        pauseReason: `Bounce rate ${(bounceRate * 100).toFixed(1)}% exceeds 5% threshold`,
      });

      logWarn(`Warmup paused due to high bounce rate`, {
        configId,
        bounceRate,
        totalBounced: newBounced,
      });
    } else {
      tx.update(warmupRef, {
        totalBounced: newBounced,
        bounceRate,
      });
    }
  });
}

/**
 * Record a spam complaint for warmup tracking
 */
export async function recordComplaint(configId: string): Promise<void> {
  const db = getDb();
  const warmupRef = db.collection("warmup").doc(configId);

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(warmupRef);
    if (!doc.exists) return;

    const warmup = doc.data() as WarmupStatus;
    const newComplaints = warmup.totalComplaints + 1;
    const complaintRate =
      warmup.totalSent > 0 ? newComplaints / warmup.totalSent : 0;

    // Pause warmup if complaint rate exceeds 0.1% (after at least 100 sends)
    if (complaintRate > 0.001 && warmup.totalSent >= 100) {
      tx.update(warmupRef, {
        totalComplaints: newComplaints,
        complaintRate,
        status: "paused",
        pauseReason: `Complaint rate ${(complaintRate * 100).toFixed(2)}% exceeds 0.1% threshold`,
      });

      logWarn(`Warmup paused due to high complaint rate`, {
        configId,
        complaintRate,
        totalComplaints: newComplaints,
      });
    } else {
      tx.update(warmupRef, {
        totalComplaints: newComplaints,
        complaintRate,
      });
    }
  });
}

/**
 * Initialize warmup for a new config
 */
export async function initializeWarmup(configId: string): Promise<void> {
  const db = getDb();
  const warmupRef = db.collection("warmup").doc(configId);

  const existing = await warmupRef.get();
  if (existing.exists) {
    logInfo(`Warmup already exists for ${configId}`);
    return;
  }

  await warmupRef.set({
    configId,
    startDate: FieldValue.serverTimestamp(),
    currentDay: 1,
    dailyLimits: DEFAULT_WARMUP_SCHEDULE,
    sentToday: 0,
    lastResetAt: FieldValue.serverTimestamp(),
    totalSent: 0,
    totalBounced: 0,
    totalComplaints: 0,
    bounceRate: 0,
    complaintRate: 0,
    status: "active",
    pauseReason: null,
  });

  logInfo(`Warmup initialized for ${configId}`);
}

/**
 * Resume a paused warmup
 */
export async function resumeWarmup(configId: string): Promise<void> {
  const db = getDb();
  await db.collection("warmup").doc(configId).update({
    status: "active",
    pauseReason: null,
  });

  logInfo(`Warmup resumed for ${configId}`);
}

/**
 * Get the default warmup schedule
 */
export function getWarmupSchedule(): number[] {
  return [...DEFAULT_WARMUP_SCHEDULE];
}
