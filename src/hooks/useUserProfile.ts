import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { BodyProfile } from "../models/user";
import { getBodyProfile, getCoachSetup, saveBodyProfile, saveCoachSetup } from "../repositories/userRepository";
import { useAuth } from "./useAuth";
import { queryKeys } from "./queryKeys";

export function useCoachSetup() {
  const { user } = useAuth();
  const uid = user?.uid;

  return useQuery({
    queryKey: uid ? queryKeys.coachSetup(uid) : ["coachSetup", "anonymous"],
    enabled: Boolean(uid),
    queryFn: () => (uid ? getCoachSetup(uid) : Promise.resolve({ coachName: null, persona: null }))
  });
}

export function useSaveCoachSetup() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (setup: { coachName: string; persona: string }) => {
      if (!user) {
        throw new Error("Sign in before saving coach setup.");
      }
      return saveCoachSetup(user.uid, setup);
    },
    onSuccess: (setup) => {
      if (user) {
        queryClient.setQueryData(queryKeys.coachSetup(user.uid), setup);
      }
    }
  });
}

export function useBodyProfile() {
  const { user } = useAuth();
  const uid = user?.uid;

  return useQuery({
    queryKey: uid ? queryKeys.bodyProfile(uid) : ["bodyProfile", "anonymous"],
    enabled: Boolean(uid),
    queryFn: () => (uid ? getBodyProfile(uid) : Promise.resolve(null))
  });
}

export function useSaveBodyProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profile: BodyProfile) => {
      if (!user) {
        throw new Error("Sign in before saving your body profile.");
      }
      return saveBodyProfile(user.uid, profile);
    },
    onSuccess: (profile) => {
      if (user) {
        queryClient.setQueryData(queryKeys.bodyProfile(user.uid), profile);
      }
    }
  });
}
