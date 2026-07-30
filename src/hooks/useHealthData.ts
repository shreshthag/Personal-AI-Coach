import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { DateKey } from "../models/nutrition";
import { readHealthSnapshot, requestHealthPermissions } from "../services/health/healthConnect";
import { queryKeys } from "./queryKeys";
import { useAuth } from "./useAuth";

export function useHealthData(today: DateKey) {
  const { user } = useAuth();
  const uid = user?.uid;

  return useQuery({
    queryKey: uid ? queryKeys.health(uid, today) : ["health", "anonymous", today],
    enabled: Boolean(uid),
    queryFn: () => readHealthSnapshot(today, 8),
    staleTime: 5 * 60 * 1000
  });
}

export function useRequestHealthPermissions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => requestHealthPermissions(),
    onSuccess: () => {
      if (user) {
        queryClient.invalidateQueries({ queryKey: ["health", user.uid] });
      }
    }
  });
}
