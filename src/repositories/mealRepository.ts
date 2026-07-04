import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from "firebase/firestore";

import type { DateKey, Meal, MealDraft, MealSource, MealType } from "../models/nutrition";
import { db } from "../services/firebase/config";
import { createId } from "../utils/id";
import { buildMealTotals } from "../utils/nutrition";
import { parseFoodItems, readBoolean, readNumber, readRecord, readString } from "./firestoreParsers";
import { isFirebaseConfigured } from "../services/config/env";
import { addMealLocal, cacheDailyMeals, deleteMealLocal, readCachedDailyMeals } from "../services/cache/offlineCache";

function mealsCollection(uid: string, date: DateKey) {
  return collection(db, "users", uid, "dailyLogs", date, "meals");
}

function mealDocument(uid: string, date: DateKey, mealId: string) {
  return doc(db, "users", uid, "dailyLogs", date, "meals", mealId);
}

function parseMealType(value: unknown): MealType {
  return value === "breakfast" || value === "lunch" || value === "dinner" || value === "snack"
    ? value
    : "snack";
}

function parseMealSource(value: unknown): MealSource {
  return value === "text" || value === "image" || value === "mixed" ? value : "text";
}

export function buildMealFromDraft(draft: MealDraft, mealId: string, imageUrl?: string): Meal {
  const totals = buildMealTotals(draft.foods);
  return {
    id: mealId,
    date: draft.date,
    timestamp: new Date().toISOString(),
    mealType: draft.mealType,
    foods: draft.foods,
    ...totals,
    source: draft.source,
    notes: draft.notes,
    ...(imageUrl ? { imageUrl } : {})
  };
}

export async function addMeal(uid: string, draft: MealDraft, imageUrl?: string, mealId?: string): Promise<Meal> {
  const id = mealId ?? createId("meal");
  const meal = buildMealFromDraft(draft, id, imageUrl);

  if (!isFirebaseConfigured() || uid.startsWith("sandbox")) {
    await addMealLocal(uid, meal);
    return meal;
  }

  try {
    await setDoc(mealDocument(uid, draft.date, id), {
      date: meal.date,
      timestamp: meal.timestamp,
      mealType: meal.mealType,
      foods: meal.foods,
      totalCalories: meal.totalCalories,
      totalProtein: meal.totalProtein,
      totalCarbs: meal.totalCarbs,
      totalFat: meal.totalFat,
      source: meal.source,
      notes: meal.notes,
      ...(meal.imageUrl ? { imageUrl: meal.imageUrl } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await addMealLocal(uid, meal);
    return meal;
  } catch (error) {
    await addMealLocal(uid, { ...meal, pending: true });
    throw error;
  }
}

export async function getDailyMeals(uid: string, date: DateKey): Promise<Meal[]> {
  const cached = await readCachedDailyMeals(uid, date);

  if (!isFirebaseConfigured() || uid.startsWith("sandbox")) {
    return cached;
  }

  try {
    const snapshot = await getDocs(query(mealsCollection(uid, date), orderBy("timestamp", "desc")));
    const meals = snapshot.docs.map((document) => {
      const data = readRecord(document);
      const foods = parseFoodItems(data.foods);
      const totals = buildMealTotals(foods);
      const imageUrl = readString(data.imageUrl);
      return {
        id: document.id,
        date: readString(data.date, date),
        timestamp: readString(data.timestamp, new Date().toISOString()),
        mealType: parseMealType(data.mealType),
        foods,
        totalCalories: readNumber(data.totalCalories, totals.totalCalories),
        totalProtein: readNumber(data.totalProtein, totals.totalProtein),
        totalCarbs: readNumber(data.totalCarbs, totals.totalCarbs),
        totalFat: readNumber(data.totalFat, totals.totalFat),
        source: parseMealSource(data.source),
        notes: readString(data.notes),
        ...(imageUrl ? { imageUrl } : {}),
        pending: readBoolean(data.pending)
      };
    });
    // Sync the cache with fresh data from server
    await cacheDailyMeals(uid, date, meals);
    return meals;
  } catch (error) {
    console.warn("Returning cached meals due to network error:", error);
    return cached;
  }
}

export async function getMealsForDates(uid: string, dates: DateKey[]): Promise<Record<DateKey, Meal[]>> {
  const entries = await Promise.all(
    dates.map(async (date) => {
      const meals = await getDailyMeals(uid, date);
      return [date, meals] as const;
    })
  );

  return Object.fromEntries(entries);
}

export async function deleteMeal(uid: string, date: DateKey, mealId: string): Promise<void> {
  if (!isFirebaseConfigured()) {
    await deleteMealLocal(uid, date, mealId);
    return;
  }

  await deleteDoc(mealDocument(uid, date, mealId));
}
