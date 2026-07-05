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

const dateKeyRegex = /^\d{4}-\d{2}-\d{2}$/;

export const logMealArgsSchema = z.object({
  date: z.string().regex(dateKeyRegex),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  foods: z.array(foodSchema).min(1),
  notes: z.string().optional().default("")
});

export const logWeightArgsSchema = z.object({
  date: z.string().regex(dateKeyRegex),
  weightKg: z.number().positive().max(400)
});

export const deleteMealArgsSchema = z.object({
  date: z.string().regex(dateKeyRegex),
  mealId: z.string().min(1)
});

export const deleteWeightArgsSchema = z.object({
  date: z.string().regex(dateKeyRegex)
});

export const webSearchArgsSchema = z.object({
  query: z.string().min(1)
});

export const updateGoalArgsSchema = z
  .object({
    calories: z.number().positive().optional(),
    protein: z.number().nonnegative().optional(),
    carbs: z.number().nonnegative().optional(),
    fat: z.number().nonnegative().optional(),
    mode: z.string().min(1).optional()
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), "No goal fields to update");
