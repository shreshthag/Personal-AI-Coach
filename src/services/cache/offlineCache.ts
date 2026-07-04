import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Goals, Meal, MealDraft, WeightEntry } from "../../models/nutrition";

const key = {
  dailyMeals: (uid: string, date: string) => `daily-meals:${uid}:${date}`,
  weights: (uid: string) => `weights:${uid}`,
  goals: (uid: string) => `goals:${uid}`,
  queue: "offline-mutation-queue"
};

export type PendingMealWrite = {
  id: string;
  kind: "meal";
  uid: string;
  meal: MealDraft;
};

export type PendingWeightWrite = {
  id: string;
  kind: "weight";
  uid: string;
  weight: WeightEntry;
};

export type PendingGoalsWrite = {
  id: string;
  kind: "goals";
  uid: string;
  goals: Goals;
};

export type PendingWrite = PendingMealWrite | PendingWeightWrite | PendingGoalsWrite;

export async function cacheDailyMeals(uid: string, date: string, meals: Meal[]): Promise<void> {
  await AsyncStorage.setItem(key.dailyMeals(uid, date), JSON.stringify(meals));
}

export async function readCachedDailyMeals(uid: string, date: string): Promise<Meal[]> {
  const raw = await AsyncStorage.getItem(key.dailyMeals(uid, date));
  return raw ? (JSON.parse(raw) as Meal[]) : [];
}

export async function addMealLocal(uid: string, meal: Meal): Promise<void> {
  const meals = await readCachedDailyMeals(uid, meal.date);
  const withoutDuplicate = meals.filter((item) => item.id !== meal.id);
  const next = [meal, ...withoutDuplicate].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  await cacheDailyMeals(uid, meal.date, next);
}

export async function deleteMealLocal(uid: string, date: string, mealId: string): Promise<void> {
  const meals = await readCachedDailyMeals(uid, date);
  const next = meals.filter((item) => item.id !== mealId);
  await cacheDailyMeals(uid, date, next);
}

export async function cacheWeights(uid: string, entries: WeightEntry[]): Promise<void> {
  await AsyncStorage.setItem(key.weights(uid), JSON.stringify(entries));
}

export async function readCachedWeights(uid: string): Promise<WeightEntry[]> {
  const raw = await AsyncStorage.getItem(key.weights(uid));
  return raw ? (JSON.parse(raw) as WeightEntry[]) : [];
}

export async function saveWeightLocal(uid: string, entry: WeightEntry): Promise<void> {
  const entries = await readCachedWeights(uid);
  const withoutDuplicate = entries.filter((item) => item.date !== entry.date);
  const next = [...withoutDuplicate, entry].sort((a, b) => a.date.localeCompare(b.date));
  await cacheWeights(uid, next);
}

export async function getWeightsLocal(uid: string, startDate: string, endDate: string): Promise<WeightEntry[]> {
  const entries = await readCachedWeights(uid);
  return entries.filter((item) => item.date >= startDate && item.date <= endDate);
}

export async function cacheGoals(uid: string, goals: Goals): Promise<void> {
  await AsyncStorage.setItem(key.goals(uid), JSON.stringify(goals));
}

export async function readCachedGoals(uid: string): Promise<Goals | null> {
  const raw = await AsyncStorage.getItem(key.goals(uid));
  return raw ? (JSON.parse(raw) as Goals) : null;
}

export async function queuePendingWrite(write: PendingWrite): Promise<void> {
  const queue = await readPendingWrites();
  await AsyncStorage.setItem(key.queue, JSON.stringify([...queue, write]));
}

export async function readPendingWrites(): Promise<PendingWrite[]> {
  const raw = await AsyncStorage.getItem(key.queue);
  return raw ? (JSON.parse(raw) as PendingWrite[]) : [];
}

export async function removePendingWrite(id: string): Promise<void> {
  const queue = await readPendingWrites();
  await AsyncStorage.setItem(
    key.queue,
    JSON.stringify(queue.filter((write) => write.id !== id))
  );
}
