import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CoachMemory } from "../models/memory";
import type { DateKey } from "../models/nutrition";
import { deleteMemory, getMemories, saveMemory } from "../repositories/memoryRepository";
import { createId } from "../utils/id";
import { queryKeys } from "./queryKeys";
import { useAuth } from "./useAuth";

export function useMemories() {
  const { user } = useAuth();
  const uid = user?.uid;

  return useQuery({
    queryKey: uid ? queryKeys.memories(uid) : ["memories", "anonymous"],
    enabled: Boolean(uid),
    queryFn: () => (uid ? getMemories(uid) : Promise.resolve([])),
    initialData: []
  });
}

export function useSaveMemory() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ text, learnedOn }: { text: string; learnedOn: DateKey }) => {
      if (!user) {
        throw new Error("Sign in before saving a memory.");
      }
      const memory: CoachMemory = {
        id: createId("memory"),
        text,
        createdAt: new Date().toISOString(),
        learnedOn
      };
      return await saveMemory(user.uid, memory);
    },
    onSuccess: (memory) => {
      if (!user) {
        return;
      }
      queryClient.setQueryData<CoachMemory[]>(queryKeys.memories(user.uid), (current = []) => [...current, memory]);
    }
  });
}

export function useDeleteMemory() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memoryId }: { memoryId: string }) => {
      if (!user) {
        throw new Error("Sign in before deleting a memory.");
      }
      await deleteMemory(user.uid, memoryId);
      return memoryId;
    },
    onSuccess: (memoryId) => {
      if (!user) {
        return;
      }
      queryClient.setQueryData<CoachMemory[]>(queryKeys.memories(user.uid), (current = []) =>
        current.filter((memory) => memory.id !== memoryId)
      );
    }
  });
}
