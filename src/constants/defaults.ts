import type { Goals, MealType } from "../models/nutrition";

export const defaultGoals: Goals = {
  calories: 2200,
  protein: 130,
  carbs: 250,
  fat: 70
};

export const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export const mealTypeLabels: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack"
};

export const recentLogWindowDays = 7;
