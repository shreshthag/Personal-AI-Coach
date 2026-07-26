import type { DateKey, FoodItem, Goals, Meal, MealType, WeightEntry } from "./nutrition";
import type { BodyProfile } from "./user";

export type GeminiMealAnalysis = {
  foods: FoodItem[];
  needsClarification: boolean;
  question: string;
};

export type CoachContext = {
  todayMeals: Meal[];
  // 8 days ending today — the extra day lets the coach average 7 completed days without today's partial one.
  recentMeals: Meal[];
  goals: Goals;
  currentWeight: WeightEntry | null;
  recentWeights: WeightEntry[];
  userName: string | null;
  coachName: string;
  persona: string;
  profile: BodyProfile | null;
};

export type CoachMealProposalData = {
  date: DateKey;
  mealType: MealType;
  foods: FoodItem[];
  notes: string;
};

export type CoachWeightProposalData = {
  date: DateKey;
  weightKg: number;
};

export type CoachDeleteMealData = {
  date: DateKey;
  mealId: string;
  mealType: MealType;
  foods: FoodItem[];
};

export type CoachDeleteWeightData = {
  date: DateKey;
  weightKg: number;
};

export type CoachGoalProposalData = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mode: string;
};

export type CoachProposalStatus = "pending" | "confirming" | "confirmed" | "declined" | "failed";

export type CoachProposal =
  | { id: string; callId?: string; tool: "log_meal"; status: CoachProposalStatus; meal: CoachMealProposalData }
  | { id: string; callId?: string; tool: "log_weight"; status: CoachProposalStatus; weight: CoachWeightProposalData }
  | { id: string; callId?: string; tool: "delete_meal"; status: CoachProposalStatus; deleteMeal: CoachDeleteMealData }
  | { id: string; callId?: string; tool: "delete_weight"; status: CoachProposalStatus; deleteWeight: CoachDeleteWeightData }
  | { id: string; callId?: string; tool: "update_goal"; status: CoachProposalStatus; goal: CoachGoalProposalData };

export type CoachChatMessage =
  | { id: string; kind: "user" | "error"; text: string; imageUri?: string }
  | { id: string; kind: "coach"; text: string; quickReplies?: string[]; streaming?: boolean }
  | { id: string; kind: "proposal"; proposalId: string };

export type CoachTurn = {
  text: string;
  functionCalls: { id?: string; name: string; args: object }[];
};
