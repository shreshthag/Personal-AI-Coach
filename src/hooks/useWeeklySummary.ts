import { useQuery } from "@tanstack/react-query";

import type { DateKey } from "../models/nutrition";
import { getWeeklySummary } from "../repositories/summaryRepository";
import { buildWeeklySummary } from "../utils/nutrition";
import { useAuth } from "./useAuth";
import { useGoals } from "./useGoals";
import { queryKeys } from "./queryKeys";

export function useWeeklySummary(endDate: DateKey) {
  const { user } = useAuth();
  const uid = user?.uid;
  const goals = useGoals();

  return useQuery({
    queryKey: uid ? queryKeys.weeklySummary(uid, endDate) : ["weeklySummary", "anonymous", endDate],
    enabled: Boolean(uid) && Boolean(goals.data),
    queryFn: () =>
      uid && goals.data
        ? getWeeklySummary(uid, endDate, goals.data)
        : Promise.resolve(buildWeeklySummary(endDate, {}, [], goals.data)),
    ...(goals.data ? { initialData: buildWeeklySummary(endDate, {}, [], goals.data) } : {})
  });
}
