import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from "firebase/ai";
import type { Part } from "firebase/ai";

import { firebaseApp } from "../firebase/config";
import { isFirebaseConfigured } from "../config/env";
import type { CoachAnswer, CoachContext, GeminiMealAnalysis } from "../../models/gemini";
import { AppError } from "../../utils/errors";
import { coachAnswerSchema, mealAnalysisSchema } from "./schemas";

type AnalyzeMealInput = {
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
  clarification?: string;
};

function simulateMealAnalysis(text: string = "", clarification: string = "", hasImage: boolean = false): GeminiMealAnalysis {
  const normText = (text + " " + clarification).toLowerCase();

  if (normText.includes("sambar") || normText.includes("idli")) {
    return {
      foods: [
        { name: "Idli", quantity: "2 pieces", calories: 120, protein: 4, carbs: 24, fat: 0.5, confidence: 0.95 },
        { name: "Sambar", quantity: "1 bowl", calories: 150, protein: 5, carbs: 18, fat: 6, confidence: 0.88 }
      ],
      needsClarification: false,
      question: ""
    };
  }

  if (normText.includes("pizza")) {
    return {
      foods: [
        { name: "Cheese Pizza", quantity: "1 slice", calories: 290, protein: 12, carbs: 32, fat: 12, confidence: 0.90 }
      ],
      needsClarification: false,
      question: ""
    };
  }

  if (normText.includes("apple")) {
    return {
      foods: [
        { name: "Red Apple", quantity: "1 medium", calories: 95, protein: 0.5, carbs: 25, fat: 0.3, confidence: 0.99 }
      ],
      needsClarification: false,
      question: ""
    };
  }

  // If it's an image-only analysis and no clarification is provided yet, simulate clarification flow
  if (hasImage && !text && !clarification) {
    return {
      foods: [],
      needsClarification: true,
      question: "I see a delicious Indian crepe (dosa) in the photo. What kind of filling is inside, and was oil or ghee used for cooking?"
    };
  }

  if (normText.includes("dosa")) {
    return {
      foods: [
        { name: "Masala Dosa", quantity: "1 large", calories: 350, protein: 6, carbs: 52, fat: 12, confidence: 0.85 }
      ],
      needsClarification: false,
      question: ""
    };
  }

  // Generic estimation
  const name = text.trim() || clarification.trim() || "Logged Food Item";
  return {
    foods: [
      { name, quantity: "1 serving", calories: 280, protein: 10, carbs: 38, fat: 8, confidence: 0.70 }
    ],
    needsClarification: false,
    question: ""
  };
}

function simulateCoach(question: string): CoachAnswer {
  const normQ = question.toLowerCase();

  if (normQ.includes("pizza")) {
    return {
      answer: "A slice of cheese pizza provides about 290 kcal (12g protein, 32g carbs, 12g fat). If your daily goals allow, you can absolutely fit this in! Just focus on high-protein, nutrient-dense choices for the rest of your meals today.",
      suggestions: [
        "Cap it at 1-2 slices to stay within your targets",
        "Add a side salad or non-starchy veggies for fiber",
        "Make sure to meet your protein target using lean protein sources"
      ],
      cautions: [
        "Watch out for high sodium levels",
        "Avoid eating heavy, greasy meals close to bedtime"
      ]
    };
  }

  if (normQ.includes("dinner") || normQ.includes("eat")) {
    return {
      answer: "For a balanced dinner, focus on a high-quality protein source, non-starchy greens, and moderate complex carbs. This supports recovery, muscle maintenance, and keeps you full overnight.",
      suggestions: [
        "Grilled Chicken Breast (150g) with baked sweet potato and asparagus",
        "Pan-seared tofu or paneer with quinoa and stir-fried broccoli",
        "Keep sauces and oils minimal to avoid hidden fats"
      ],
      cautions: [
        "Avoid high-fat or processed convenience meals",
        "Be mindful of liquid calories like fruit juices or soda"
      ]
    };
  }

  if (normQ.includes("weight") || normQ.includes("scale") || normQ.includes("dropping")) {
    return {
      answer: "Weight fluctuations are completely normal. Daily changes on the scale are usually caused by water retention, sodium intake, carb depletion/repletion, or muscle inflammation from training. Focus on the weekly averages and consistency over single-day metrics.",
      suggestions: [
        "Stick to a consistent daily calorie deficit",
        "Aim for 8,000+ daily steps to boost activity",
        "Take weekly photos and body measurements instead of just weighing"
      ],
      cautions: [
        "Do not aggressively cut calories below your healthy targets",
        "Avoid stress; high cortisol levels can trigger water retention"
      ]
    };
  }

  return {
    answer: "Consistency is key to reaching your wellness and body composition goals. Consistently tracking meals, matching your daily protein target, and sleeping 7-8 hours are the best foundational habits.",
    suggestions: [
      "Track all snacks, oils, and condiments",
      "Spread protein intake evenly across your meals",
      "Drink at least 2-3 liters of water daily"
    ],
    cautions: [
      "Don't compromise sleep, which is critical for fat loss and muscle recovery",
      "Avoid skipping meals, which can lead to cravings later"
    ]
  };
}

const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });

const mealResponseSchema = Schema.object({
  properties: {
    foods: Schema.array({
      items: Schema.object({
        properties: {
          name: Schema.string(),
          quantity: Schema.string(),
          calories: Schema.number(),
          protein: Schema.number(),
          carbs: Schema.number(),
          fat: Schema.number(),
          confidence: Schema.number()
        }
      })
    }),
    needsClarification: Schema.boolean(),
    question: Schema.string()
  }
});

const coachResponseSchema = Schema.object({
  properties: {
    answer: Schema.string(),
    suggestions: Schema.array({ items: Schema.string() }),
    cautions: Schema.array({ items: Schema.string() })
  }
});

const mealAnalysisModel = getGenerativeModel(ai, {
  model: "gemini-2.5-flash",
  generationConfig: {
    temperature: 0.2,
    responseMimeType: "application/json",
    responseSchema: mealResponseSchema
  }
});

const coachModel = getGenerativeModel(ai, {
  model: "gemini-2.5-flash",
  generationConfig: {
    temperature: 0.2,
    responseMimeType: "application/json",
    responseSchema: coachResponseSchema
  }
});

function mealPrompt(text?: string, clarification?: string): string {
  return [
    "Estimate nutrition for a single meal for a personal tracker.",
    "Return JSON only matching the supplied schema.",
    "Use calories in kcal and macros in grams.",
    "If food identity or quantity is uncertain, set needsClarification to true and ask one concise question.",
    "Do not invent precise values when quantity is unclear.",
    text ? `Meal text: ${text}` : "Meal text: not provided.",
    clarification ? `User clarification: ${clarification}` : "User clarification: not provided."
  ].join("\n");
}

function coachPrompt(question: string, context: unknown): string {
  return [
    "You are a practical nutrition coach for one user.",
    "Use the provided meals, goals, and weight data to answer the user's question.",
    "Never claim to modify stored data. Never instruct the app to change data.",
    "Be concise, specific, and safe. Suggest medical advice only as a referral to a qualified clinician.",
    `Question: ${question}`,
    `Context JSON: ${JSON.stringify(context)}`
  ].join("\n");
}

export async function analyzeMeal(input: AnalyzeMealInput): Promise<GeminiMealAnalysis> {
  if (!isFirebaseConfigured()) {
    // Simulator Mode
    return mealAnalysisSchema.parse(
      simulateMealAnalysis(input.text, input.clarification, Boolean(input.imageBase64))
    );
  }

  try {
    const parts: (string | Part)[] = [mealPrompt(input.text, input.clarification)];
    if (input.imageBase64 && input.imageMimeType) {
      parts.push({
        inlineData: {
          mimeType: input.imageMimeType,
          data: input.imageBase64
        }
      });
    }

    const result = await mealAnalysisModel.generateContent(parts);
    const data = JSON.parse(result.response.text());
    return mealAnalysisSchema.parse(data);
  } catch (error) {
    throw new AppError(
      error instanceof Error ? error.message : "Gemini meal analysis failed.",
      "The AI request failed. Please retry in a moment."
    );
  }
}

export async function askCoach(question: string, context: CoachContext): Promise<CoachAnswer> {
  if (!isFirebaseConfigured()) {
    // Simulator Mode
    return coachAnswerSchema.parse(simulateCoach(question));
  }

  try {
    const result = await coachModel.generateContent([coachPrompt(question, context)]);
    const data = JSON.parse(result.response.text());
    return coachAnswerSchema.parse(data);
  } catch (error) {
    throw new AppError(
      error instanceof Error ? error.message : "Gemini coach request failed.",
      "The AI request failed. Please retry in a moment."
    );
  }
}
