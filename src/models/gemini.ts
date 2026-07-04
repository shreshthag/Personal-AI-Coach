import type { FoodItem, Goals, Meal, WeightEntry } from "./nutrition";

export type GeminiMealAnalysis = {
  foods: FoodItem[];
  needsClarification: boolean;
  question: string;
};

export type CoachContext = {
  todayMeals: Meal[];
  last7Days: Meal[];
  goals: Goals;
  currentWeight: WeightEntry | null;
};

export type CoachAnswer = {
  answer: string;
  suggestions: string[];
  cautions: string[];
};
