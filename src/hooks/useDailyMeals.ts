import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { DateKey, Meal, MealDraft } from "../models/nutrition";
import { buildMealFromDraft, deleteMeal, getDailyMeals, addMeal } from "../repositories/mealRepository";
import { cacheDailyMeals, queuePendingWrite, readCachedDailyMeals } from "../services/cache/offlineCache";
import { uploadMealImage } from "../services/firebase/storageService";
import { createId } from "../utils/id";
import { useAuth } from "./useAuth";
import { queryKeys } from "./queryKeys";

export function useDailyMeals(date: DateKey) {
  const { user } = useAuth();
  const uid = user?.uid;

  const query = useQuery({
    queryKey: uid ? queryKeys.dailyMeals(uid, date) : ["dailyMeals", "anonymous", date],
    enabled: Boolean(uid),
    queryFn: async () => {
      if (!uid) return [];
      return await getDailyMeals(uid, date);
    },
    initialData: []
  });

  // Load cache into query client on mount if we're empty
  const queryClient = useQueryClient();
  useEffect(() => {
    if (uid && (!query.data || query.data.length === 0)) {
      readCachedDailyMeals(uid, date).then((cached) => {
        if (cached.length > 0) {
          queryClient.setQueryData(queryKeys.dailyMeals(uid, date), cached);
        }
      });
    }
  }, [uid, date, queryClient]);

  return query;
}

export function useAddMeal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (draft: MealDraft) => {
      if (!user) {
        throw new Error("Sign in before logging meals.");
      }

      const pendingId = createId("meal");
      try {
        const imageUrl =
          draft.imageUri && draft.imageMimeType
            ? await uploadMealImage({
                uid: user.uid,
                uri: draft.imageUri,
                mimeType: draft.imageMimeType
              })
            : undefined;
        return await addMeal(user.uid, draft, imageUrl);
      } catch {
        const pendingMeal: Meal = {
          ...buildMealFromDraft(draft, pendingId),
          pending: true
        };
        await queuePendingWrite({
          id: pendingId,
          kind: "meal",
          uid: user.uid,
          meal: draft
        });
        return pendingMeal;
      }
    },
    onSuccess: async (meal) => {
      if (!user) {
        return;
      }
      const key = queryKeys.dailyMeals(user.uid, meal.date);
      queryClient.setQueryData<Meal[]>(key, (current = []) => {
        const withoutDuplicate = current.filter((item) => item.id !== meal.id);
        return [meal, ...withoutDuplicate].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      });
      await cacheDailyMeals(user.uid, meal.date, queryClient.getQueryData<Meal[]>(key) ?? []);
      queryClient.invalidateQueries({ queryKey: ["weeklySummary", user.uid] });
    }
  });
}

export function useDeleteMeal(date: DateKey) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mealId: string) => {
      if (!user) {
        throw new Error("Sign in before deleting meals.");
      }
      await deleteMeal(user.uid, date, mealId);
      return mealId;
    },
    onSuccess: (mealId) => {
      if (!user) {
        return;
      }
      queryClient.setQueryData<Meal[]>(queryKeys.dailyMeals(user.uid, date), (current = []) =>
        current.filter((meal) => meal.id !== mealId)
      );
      queryClient.invalidateQueries({ queryKey: ["weeklySummary", user.uid] });
    }
  });
}

export function useDeleteMealEntry() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ date, mealId }: { date: DateKey; mealId: string }) => {
      if (!user) {
        throw new Error("Sign in before deleting meals.");
      }
      await deleteMeal(user.uid, date, mealId);
      return { date, mealId };
    },
    onSuccess: ({ date, mealId }) => {
      if (!user) {
        return;
      }
      queryClient.setQueryData<Meal[]>(queryKeys.dailyMeals(user.uid, date), (current = []) =>
        current.filter((meal) => meal.id !== mealId)
      );
      queryClient.invalidateQueries({ queryKey: ["weeklySummary", user.uid] });
      queryClient.invalidateQueries({ queryKey: ["coachMeals", user.uid] });
    }
  });
}
