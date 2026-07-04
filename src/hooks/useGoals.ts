import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { defaultGoals } from "../constants/defaults";
import type { Goals } from "../models/nutrition";
import { getGoals, saveGoals } from "../repositories/goalsRepository";
import { queuePendingWrite } from "../services/cache/offlineCache";
import { createId } from "../utils/id";
import { useAuth } from "./useAuth";
import { queryKeys } from "./queryKeys";

export function useGoals() {
  const { user } = useAuth();
  const uid = user?.uid;

  return useQuery({
    queryKey: uid ? queryKeys.goals(uid) : ["goals", "anonymous"],
    enabled: Boolean(uid),
    queryFn: () => (uid ? getGoals(uid) : Promise.resolve(defaultGoals)),
    initialData: defaultGoals
  });
}

export function useUpdateGoals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (goals: Goals) => {
      if (!user) {
        throw new Error("Sign in before updating goals.");
      }

      try {
        return await saveGoals(user.uid, goals);
      } catch {
        await queuePendingWrite({
          id: createId("goals"),
          kind: "goals",
          uid: user.uid,
          goals
        });
        return goals;
      }
    },
    onSuccess: (goals) => {
      if (user) {
        queryClient.setQueryData(queryKeys.goals(user.uid), goals);
        queryClient.invalidateQueries({ queryKey: ["weeklySummary", user.uid] });
      }
    }
  });
}
