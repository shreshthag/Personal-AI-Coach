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
import type { BodyProfile } from "../models/user";
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

const activityMultipliers: Record<BodyProfile["activityLevel"], number> = {
  sedentary: 1.35,
  moderate: 1.55,
  active: 1.75
};

const proteinPerKgByMode: Record<"cut" | "bulk" | "maintain", number> = {
  cut: 2.0,
  bulk: 1.8,
  maintain: 1.6
};

function roundToNearest(value: number, step: number, minimum: number): number {
  return Math.max(minimum, Math.round(value / step) * step);
}

export function classifyMode(mode: string): "cut" | "bulk" | "maintain" {
  const normalized = mode.toLowerCase();
  if (["cut", "deficit", "lose", "shred", "lean"].some((keyword) => normalized.includes(keyword))) {
    return "cut";
  }
  if (["bulk", "gain", "surplus", "mass"].some((keyword) => normalized.includes(keyword))) {
    return "bulk";
  }
  return "maintain";
}

export function computeTargets(profile: BodyProfile, weightKg: number, mode: string): Goals {
  const { heightCm, gender, age, activityLevel } = profile;
  const genderOffset = gender === "male" ? 5 : gender === "female" ? -161 : -78;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + genderOffset;
  const tdee = bmr * activityMultipliers[activityLevel];

  const bucket = classifyMode(mode);
  const rawCalories = bucket === "cut" ? tdee * 0.8 : bucket === "bulk" ? tdee * 1.1 : tdee;
  const rawProtein = weightKg * proteinPerKgByMode[bucket];
  const rawFat = (rawCalories * 0.25) / 9;
  const rawCarbs = (rawCalories - rawProtein * 4 - rawFat * 9) / 4;

  return {
    calories: roundToNearest(rawCalories, 50, 1200),
    protein: roundToNearest(rawProtein, 5, 0),
    carbs: roundToNearest(rawCarbs, 5, 0),
    fat: roundToNearest(rawFat, 5, 0),
    mode
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
