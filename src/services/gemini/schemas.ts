import { z } from "zod";

export const foodSchema = z.object({
  name: z.string().min(1),
  quantity: z.string().min(1),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
  confidence: z.number().min(0).max(1)
});

export const mealAnalysisSchema = z.object({
  foods: z.array(foodSchema),
  needsClarification: z.boolean(),
  question: z.string()
});

export const coachAnswerSchema = z.object({
  answer: z.string().min(1),
  suggestions: z.array(z.string()),
  cautions: z.array(z.string())
});
