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
  writeBatch,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuthStore } from "../stores/authStore";
import { Alert } from "../types";

export function useAlerts(unreadOnly: boolean = false, pageSize: number = 20) {
  const user = useAuthStore((state) => state.user);

  return useQuery({
    queryKey: ["alerts", user?.uid, unreadOnly, pageSize],
    queryFn: async () => {
      if (!user) return [];

      let q = query(
        collection(db, "alerts"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(pageSize)
      );

      if (unreadOnly) {
        q = query(
          collection(db, "alerts"),
          where("userId", "==", user.uid),
          where("read", "==", false),
          orderBy("createdAt", "desc"),
          limit(pageSize)
        );
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Alert[];
    },
    enabled: !!user,
  });
}

export function useUnreadAlertCount() {
  const user = useAuthStore((state) => state.user);

  return useQuery({
    queryKey: ["alertCount", user?.uid],
    queryFn: async () => {
      if (!user) return 0;

      const q = query(
        collection(db, "alerts"),
        where("userId", "==", user.uid),
        where("read", "==", false)
      );
      const snapshot = await getDocs(q);
      return snapshot.size;
    },
    enabled: !!user,
  });
}

export function useMarkAlertRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const alertRef = doc(db, "alerts", alertId);
      await updateDoc(alertRef, { read: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["alertCount"] });
    },
  });
}

export function useMarkAllAlertsRead() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");

      const q = query(
        collection(db, "alerts"),
        where("userId", "==", user.uid),
        where("read", "==", false)
      );
      const snapshot = await getDocs(q);

      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { read: true });
      });
      await batch.commit();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["alertCount"] });
    },
  });
}
