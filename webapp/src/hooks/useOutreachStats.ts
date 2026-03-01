import { useQuery } from "@tanstack/react-query";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuthStore } from "../stores/authStore";
import { subDays, startOfDay } from "date-fns";

interface DailyStats {
  date: string;
  emailsSent: number;
  rvmsSent: number;
  metaAdded: number;
}

export function useOutreachStats(days: number = 30) {
  const user = useAuthStore((state) => state.user);

  return useQuery({
    queryKey: ["outreachStats", user?.uid, days],
    queryFn: async () => {
      if (!user) return null;

      const startDate = startOfDay(subDays(new Date(), days));

      const q = query(
        collection(db, "outreachLog"),
        where("userId", "==", user.uid),
        where("timestamp", ">=", Timestamp.fromDate(startDate))
      );

      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map((doc) => doc.data());

      // Aggregate by day and channel
      const dailyMap = new Map<string, DailyStats>();

      for (let i = 0; i <= days; i++) {
        const date = subDays(new Date(), days - i);
        const dateStr = date.toISOString().split("T")[0];
        dailyMap.set(dateStr, {
          date: dateStr,
          emailsSent: 0,
          rvmsSent: 0,
          metaAdded: 0,
        });
      }

      logs.forEach((log) => {
        const date = log.timestamp.toDate().toISOString().split("T")[0];
        const stats = dailyMap.get(date);
        if (stats) {
          if (log.channel === "email" && log.action === "sent") {
            stats.emailsSent++;
          } else if (log.channel === "rvm" && log.action === "sent") {
            stats.rvmsSent++;
          } else if (log.channel === "meta" && log.action === "added") {
            stats.metaAdded++;
          }
        }
      });

      const dailyStats = Array.from(dailyMap.values());

      // Calculate totals
      const totals = {
        emailsSent: logs.filter(
          (l) => l.channel === "email" && l.action === "sent"
        ).length,
        emailsOpened: logs.filter(
          (l) => l.channel === "email" && l.action === "opened"
        ).length,
        emailsClicked: logs.filter(
          (l) => l.channel === "email" && l.action === "clicked"
        ).length,
        emailsBounced: logs.filter(
          (l) => l.channel === "email" && l.action === "bounced"
        ).length,
        rvmsSent: logs.filter((l) => l.channel === "rvm" && l.action === "sent")
          .length,
        metaAdded: logs.filter(
          (l) => l.channel === "meta" && l.action === "added"
        ).length,
      };

      return {
        dailyStats,
        totals,
        openRate: totals.emailsSent
          ? ((totals.emailsOpened / totals.emailsSent) * 100).toFixed(1)
          : "0",
        clickRate: totals.emailsSent
          ? ((totals.emailsClicked / totals.emailsSent) * 100).toFixed(1)
          : "0",
        bounceRate: totals.emailsSent
          ? ((totals.emailsBounced / totals.emailsSent) * 100).toFixed(1)
          : "0",
      };
    },
    enabled: !!user,
  });
}
