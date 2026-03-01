import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuthStore } from "../stores/authStore";
import { Lead, LeadStatus } from "../types";

export function useLeads(
  status?: LeadStatus,
  pageSize: number = 50
) {
  const user = useAuthStore((state) => state.user);

  return useQuery({
    queryKey: ["leads", user?.uid, status, pageSize],
    queryFn: async () => {
      if (!user) return [];

      let q = query(
        collection(db, "leads"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(pageSize)
      );

      if (status) {
        q = query(
          collection(db, "leads"),
          where("userId", "==", user.uid),
          where("status", "==", status),
          orderBy("createdAt", "desc"),
          limit(pageSize)
        );
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Lead[];
    },
    enabled: !!user,
  });
}

export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      status,
    }: {
      leadId: string;
      status: LeadStatus;
    }) => {
      const leadRef = doc(db, "leads", leadId);
      await updateDoc(leadRef, {
        status,
        updatedAt: Timestamp.now(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useLeadStats() {
  const user = useAuthStore((state) => state.user);

  return useQuery({
    queryKey: ["leadStats", user?.uid],
    queryFn: async () => {
      if (!user) return null;

      const statuses: LeadStatus[] = [
        "new",
        "contacted",
        "replied",
        "qualified",
        "converted",
        "not_interested",
      ];

      const counts: Record<string, number> = {};

      for (const status of statuses) {
        const q = query(
          collection(db, "leads"),
          where("userId", "==", user.uid),
          where("status", "==", status)
        );
        const snapshot = await getDocs(q);
        counts[status] = snapshot.size;
      }

      return {
        totalLeads: Object.values(counts).reduce((a, b) => a + b, 0),
        newLeads: counts.new || 0,
        contacted: counts.contacted || 0,
        replied: counts.replied || 0,
        qualified: counts.qualified || 0,
        converted: counts.converted || 0,
        notInterested: counts.not_interested || 0,
      };
    },
    enabled: !!user,
  });
}
