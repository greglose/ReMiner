import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuthStore } from "../stores/authStore";
import { Config } from "../types";

export function useConfig() {
  const user = useAuthStore((state) => state.user);

  return useQuery({
    queryKey: ["config", user?.uid],
    queryFn: async () => {
      if (!user) return null;

      const q = query(
        collection(db, "configs"),
        where("userId", "==", user.uid)
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) return null;

      return {
        id: snapshot.docs[0].id,
        ...snapshot.docs[0].data(),
      } as Config;
    },
    enabled: !!user,
  });
}

export function useSaveConfig() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: async (configData: Partial<Config>) => {
      if (!user) throw new Error("Not authenticated");

      const configRef = configData.id
        ? doc(db, "configs", configData.id)
        : doc(collection(db, "configs"));

      const data = {
        ...configData,
        userId: user.uid,
        updatedAt: Timestamp.now(),
        ...(configData.id ? {} : { createdAt: Timestamp.now() }),
      };

      if (configData.id) {
        await updateDoc(configRef, data);
      } else {
        await setDoc(configRef, data);
      }

      return configRef.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
  });
}

export function useToggleSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      configId,
      enabled,
    }: {
      configId: string;
      enabled: boolean;
    }) => {
      const configRef = doc(db, "configs", configId);
      await updateDoc(configRef, {
        syncEnabled: enabled,
        updatedAt: Timestamp.now(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
  });
}
