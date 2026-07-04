export type DateKey = string;

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type MealSource = "text" | "image" | "mixed";

export type FoodItem = {
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
};

export type NutritionTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type Goals = NutritionTotals & {
  updatedAt?: string;
};

export type Meal = {
  id: string;
  date: DateKey;
  timestamp: string;
  mealType: MealType;
  foods: FoodItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  source: MealSource;
  notes: string;
  imageUrl?: string;
  pending?: boolean;
};

export type MealDraft = {
  date: DateKey;
  mealType: MealType;
  foods: FoodItem[];
  source: MealSource;
  notes: string;
  imageUri?: string;
  imageMimeType?: string;
};

export type DailySummary = NutritionTotals & {
  date: DateKey;
  caloriesRemaining: number;
  proteinRemaining: number;
  carbsRemaining: number;
  fatRemaining: number;
  mealCount: number;
};

export type WeightEntry = {
  date: DateKey;
  weightKg: number;
  createdAt?: string;
  updatedAt?: string;
  pending?: boolean;
};

export type WeightSummary = {
  todayWeightKg: number | null;
  sevenDayAverageKg: number | null;
  changeThisWeekKg: number | null;
};

export type WeeklySummary = NutritionTotals & {
  startDate: DateKey;
  endDate: DateKey;
  averageCalories: number;
  averageProtein: number;
  averageCarbs: number;
  averageFat: number;
  weightTrendKg: number | null;
  goalAdherencePercent: number;
  daysTracked: number;
};
