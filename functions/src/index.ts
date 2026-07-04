import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { Response } from "express";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { z } from "zod";

initializeApp();

const geminiApiKey = defineSecret("GEMINI_API_KEY");

const foodSchema = z.object({
  name: z.string().min(1),
  quantity: z.string().min(1),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
  confidence: z.number().min(0).max(1)
});

const mealAnalysisSchema = z.object({
  foods: z.array(foodSchema),
  needsClarification: z.boolean(),
  question: z.string()
});

const coachAnswerSchema = z.object({
  answer: z.string().min(1),
  suggestions: z.array(z.string()),
  cautions: z.array(z.string())
});

const requestSchema = z.discriminatedUnion("task", [
  z.object({
    task: z.literal("meal-analysis"),
    text: z.string().optional(),
    imageBase64: z.string().optional(),
    imageMimeType: z.string().optional(),
    clarification: z.string().optional()
  }),
  z.object({
    task: z.literal("coach"),
    question: z.string().min(1),
    context: z.unknown()
  })
]);

const mealResponseSchema = {
  type: "object",
  properties: {
    foods: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "string" },
          calories: { type: "number" },
          protein: { type: "number" },
          carbs: { type: "number" },
          fat: { type: "number" },
          confidence: { type: "number" }
        },
        required: ["name", "quantity", "calories", "protein", "carbs", "fat", "confidence"]
      }
    },
    needsClarification: { type: "boolean" },
    question: { type: "string" }
  },
  required: ["foods", "needsClarification", "question"]
};

const coachResponseSchema = {
  type: "object",
  properties: {
    answer: { type: "string" },
    suggestions: {
      type: "array",
      items: { type: "string" }
    },
    cautions: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["answer", "suggestions", "cautions"]
};

function setCors(response: Response): void {
  response.set("Access-Control-Allow-Origin", "*");
  response.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
}

async function verifyRequest(authHeader: string | undefined): Promise<string> {
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) {
    throw new Error("Missing Firebase ID token.");
  }

  const decoded = await getAuth().verifyIdToken(token);
  return decoded.uid;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function extractCandidateText(value: unknown): string {
  const data = asRecord(value);
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const firstCandidate = asRecord(candidates[0]);
  const content = asRecord(firstCandidate.content);
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const firstPart = asRecord(parts[0]);
  const text = firstPart.text;

  if (typeof text === "string") {
    return text;
  }

  const outputText = data.output_text ?? data.outputText;
  if (typeof outputText === "string") {
    return outputText;
  }

  throw new Error("Gemini returned no text.");
}

async function callGemini(parts: unknown[], responseSchema: unknown): Promise<unknown> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey.value()}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as unknown;
  return JSON.parse(extractCandidateText(payload)) as unknown;
}

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

export const geminiProxy = onRequest({ secrets: [geminiApiKey], cors: false }, async (request, response) => {
  setCors(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    await verifyRequest(request.get("Authorization"));
    const parsedRequest = requestSchema.parse(request.body);

    if (parsedRequest.task === "meal-analysis") {
      const parts: unknown[] = [{ text: mealPrompt(parsedRequest.text, parsedRequest.clarification) }];
      if (parsedRequest.imageBase64 && parsedRequest.imageMimeType) {
        parts.push({
          inline_data: {
            mime_type: parsedRequest.imageMimeType,
            data: parsedRequest.imageBase64
          }
        });
      }

      const data = mealAnalysisSchema.parse(await callGemini(parts, mealResponseSchema));
      response.json({ data });
      return;
    }

    const coachData = coachAnswerSchema.parse(
      await callGemini([{ text: coachPrompt(parsedRequest.question, parsedRequest.context) }], coachResponseSchema)
    );
    response.json({ data: coachData });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown proxy error.";
    response.status(400).json({ error: message });
  }
});
