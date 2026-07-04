import { defaultGoals } from "../constants/defaults";
import type {
  DailySummary,
  FoodItem,
  Goals,
  Meal,
  NutritionTotals,
  WeeklySummary,
  WeightEntry,
  WeightSummary
} from "../models/nutrition";
import { lastDateKeys } from "./date";

export const emptyTotals: NutritionTotals = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0
};

export function roundMacro(value: number): number {
  return Math.round(value * 10) / 10;
}

export function sumFoods(foods: FoodItem[]): NutritionTotals {
  return foods.reduce<NutritionTotals>(
    (totals, food) => ({
      calories: totals.calories + food.calories,
      protein: roundMacro(totals.protein + food.protein),
      carbs: roundMacro(totals.carbs + food.carbs),
      fat: roundMacro(totals.fat + food.fat)
    }),
    { ...emptyTotals }
  );
}

export function sumMeals(meals: Meal[]): NutritionTotals {
  return meals.reduce<NutritionTotals>(
    (totals, meal) => ({
      calories: totals.calories + meal.totalCalories,
      protein: roundMacro(totals.protein + meal.totalProtein),
      carbs: roundMacro(totals.carbs + meal.totalCarbs),
      fat: roundMacro(totals.fat + meal.totalFat)
    }),
    { ...emptyTotals }
  );
}

export function buildDailySummary(date: string, meals: Meal[], goals: Goals = defaultGoals): DailySummary {
  const totals = sumMeals(meals);
  return {
    date,
    ...totals,
    caloriesRemaining: goals.calories - totals.calories,
    proteinRemaining: roundMacro(goals.protein - totals.protein),
    carbsRemaining: roundMacro(goals.carbs - totals.carbs),
    fatRemaining: roundMacro(goals.fat - totals.fat),
    mealCount: meals.length
  };
}

export function buildMealTotals(foods: FoodItem[]): Pick<
  Meal,
  "totalCalories" | "totalProtein" | "totalCarbs" | "totalFat"
> {
  const totals = sumFoods(foods);
  return {
    totalCalories: totals.calories,
    totalProtein: totals.protein,
    totalCarbs: totals.carbs,
    totalFat: totals.fat
  };
}

export function buildWeightSummary(today: string, entries: WeightEntry[]): WeightSummary {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const todayEntry = sorted.find((entry) => entry.date === today) ?? sorted.at(-1) ?? null;
  const lastSeven = sorted.slice(-7);
  const firstThisWeek = lastSeven.at(0) ?? null;
  const latest = lastSeven.at(-1) ?? null;
  const average =
    lastSeven.length > 0
      ? roundMacro(lastSeven.reduce((sum, entry) => sum + entry.weightKg, 0) / lastSeven.length)
      : null;

  return {
    todayWeightKg: todayEntry?.weightKg ?? null,
    sevenDayAverageKg: average,
    changeThisWeekKg:
      firstThisWeek && latest ? roundMacro(latest.weightKg - firstThisWeek.weightKg) : null
  };
}

export function buildWeeklySummary(
  endDate: string,
  mealsByDate: Record<string, Meal[]>,
  weights: WeightEntry[],
  goals: Goals = defaultGoals
): WeeklySummary {
  const dates = lastDateKeys(7, endDate);
  const weeklyMeals = dates.flatMap((date) => mealsByDate[date] ?? []);
  const totals = sumMeals(weeklyMeals);
  const trackedDays = dates.filter((date) => (mealsByDate[date]?.length ?? 0) > 0).length;
  const weightSummary = buildWeightSummary(endDate, weights);
  const goalDays = dates.filter((date) => {
    const dailyCalories = sumMeals(mealsByDate[date] ?? []).calories;
    return dailyCalories > 0 && dailyCalories <= goals.calories;
  }).length;

  return {
    startDate: dates[0] ?? endDate,
    endDate,
    ...totals,
    averageCalories: Math.round(totals.calories / dates.length),
    averageProtein: roundMacro(totals.protein / dates.length),
    averageCarbs: roundMacro(totals.carbs / dates.length),
    averageFat: roundMacro(totals.fat / dates.length),
    weightTrendKg: weightSummary.changeThisWeekKg,
    goalAdherencePercent: Math.round((goalDays / dates.length) * 100),
    daysTracked: trackedDays
  };
}
