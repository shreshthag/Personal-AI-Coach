import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { DateKey, WeightEntry } from "../models/nutrition";
import { deleteWeight, getWeightsForRange, saveWeight } from "../repositories/weightRepository";
import { cacheWeights, getWeightsLocal, queuePendingWrite, readCachedWeights } from "../services/cache/offlineCache";
import { lastDateKeys } from "../utils/date";
import { createId } from "../utils/id";
import { buildWeightSummary } from "../utils/nutrition";
import { queryKeys } from "./queryKeys";
import { useAuth } from "./useAuth";

export function useWeights(endDate: DateKey) {
  const { user } = useAuth();
  const uid = user?.uid;
  const dates = lastDateKeys(7, endDate);
  const startDate = dates[0] ?? endDate;

  const query = useQuery({
    queryKey: uid ? queryKeys.weights(uid, startDate, endDate) : ["weights", "anonymous", startDate, endDate],
    enabled: Boolean(uid),
    queryFn: () => (uid ? getWeightsForRange(uid, startDate, endDate) : Promise.resolve([])),
    initialData: []
  });

  // Load cache into query client on mount if we're empty
  const queryClient = useQueryClient();
  useEffect(() => {
    if (uid && (!query.data || query.data.length === 0)) {
      getWeightsLocal(uid, startDate, endDate).then((cached) => {
        if (cached.length > 0) {
          queryClient.setQueryData(queryKeys.weights(uid, startDate, endDate), cached);
        }
      });
    }
  }, [uid, startDate, endDate, queryClient]);

  return query;
}

export function useWeightSummary(endDate: DateKey) {
  const weights = useWeights(endDate);
  return {
    ...weights,
    summary: buildWeightSummary(endDate, weights.data ?? [])
  };
}

export function useSaveWeight() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entry: WeightEntry) => {
      if (!user) {
        throw new Error("Sign in before saving weight.");
      }

      try {
        return await saveWeight(user.uid, entry);
      } catch {
        const pending: WeightEntry = { ...entry, pending: true };
        await queuePendingWrite({
          id: createId("weight"),
          kind: "weight",
          uid: user.uid,
          weight: entry
        });
        return pending;
      }
    },
    onSuccess: (entry) => {
      if (!user) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["weights", user.uid] });
      queryClient.invalidateQueries({ queryKey: ["weeklySummary", user.uid] });
    }
  });
}

export function useDeleteWeight() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ date }: { date: DateKey }) => {
      if (!user) {
        throw new Error("Sign in before deleting weight.");
      }
      await deleteWeight(user.uid, date);
      return date;
    },
    onSuccess: () => {
      if (!user) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["weights", user.uid] });
      queryClient.invalidateQueries({ queryKey: ["weeklySummary", user.uid] });
    }
  });
}
