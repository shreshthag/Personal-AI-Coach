import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from "firebase/ai";
import type { Part } from "firebase/ai";

import { firebaseApp } from "../firebase/config";
import { isFirebaseConfigured } from "../config/env";
import type { GeminiMealAnalysis } from "../../models/gemini";
import { AppError } from "../../utils/errors";
import { mealAnalysisSchema } from "./schemas";

type AnalyzeMealInput = {
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
  clarification?: string;
};

export function simulateMealAnalysis(text: string = "", clarification: string = "", hasImage: boolean = false): GeminiMealAnalysis {
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

export const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });

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

const mealAnalysisModel = getGenerativeModel(ai, {
  model: "gemini-2.5-flash",
  generationConfig: {
    temperature: 0.2,
    responseMimeType: "application/json",
    responseSchema: mealResponseSchema
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
