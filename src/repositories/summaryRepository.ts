import type { DateKey, Goals, WeeklySummary, WeightSummary } from "../models/nutrition";
import { getMealsForDates } from "./mealRepository";
import { getWeightsForRange } from "./weightRepository";
import { buildWeeklySummary, buildWeightSummary } from "../utils/nutrition";
import { lastDateKeys } from "../utils/date";

export async function getWeeklySummary(uid: string, endDate: DateKey, goals: Goals): Promise<WeeklySummary> {
  const dates = lastDateKeys(7, endDate);
  const mealsByDate = await getMealsForDates(uid, dates);
  const weights = await getWeightsForRange(uid, dates[0] ?? endDate, endDate);
  return buildWeeklySummary(endDate, mealsByDate, weights, goals);
}

export async function getWeightSummary(uid: string, endDate: DateKey): Promise<WeightSummary> {
  const dates = lastDateKeys(7, endDate);
  const weights = await getWeightsForRange(uid, dates[0] ?? endDate, endDate);
  return buildWeightSummary(endDate, weights);
}
