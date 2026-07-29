import { Schema, getGenerativeModel } from "firebase/ai";

import { isFirebaseConfigured } from "../config/env";
import { memoryExtractionResponseSchema } from "./schemas";
import { ai } from "./geminiClient";

const extractionResponseSchema = Schema.object({
  properties: {
    facts: Schema.array({
      description: "Durable facts worth remembering. Empty when the message contains none.",
      items: Schema.string()
    })
  },
  optionalProperties: []
});

// A dedicated pass rather than a tool on the chat turn. A single call asked to both converse and
// decide whether to save will nearly always just converse — on device the coach kept replying
// "noted" and storing nothing. Schema-constrained JSON removes the choice: it must return a list.
export async function extractMemories(userMessage: string, existingFacts: string[]): Promise<string[]> {
  if (!isFirebaseConfigured() || userMessage.trim().length === 0) {
    return [];
  }

  const model = getGenerativeModel(ai, {
    model: "gemini-2.5-flash",
    systemInstruction: [
      "You extract durable facts about a nutrition-app user from one message they sent their coach.",
      "A durable fact stays true for weeks or months: a product they use and its macros, a brand they buy, a food they avoid, an allergy or intolerance, a dietary pattern, how or when they train, a standing preference or physical constraint.",
      "NOT durable, and never worth returning: anything they ate on a particular day, a weight reading, a daily total, a passing mood, a question they asked, or a one-off plan.",
      "Write each fact as one self-contained sentence in the third person, keeping any exact figures the user gave.",
      "Most messages contain nothing durable, so returning an empty list is the normal outcome. Never invent a fact, never infer one the user did not state, and never return a fact that just repeats something in the already-known list."
    ].join("\n"),
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: extractionResponseSchema
    }
  });

  const prompt = [
    existingFacts.length > 0
      ? `Already known:\n${existingFacts.map((fact) => `- ${fact}`).join("\n")}`
      : "Already known: nothing.",
    `Message: ${userMessage}`
  ].join("\n\n");

  try {
    const result = await model.generateContent(prompt);
    const parsed = memoryExtractionResponseSchema.safeParse(JSON.parse(result.response.text()));
    if (!parsed.success) {
      return [];
    }
    return parsed.data.facts.map((fact) => fact.trim()).filter((fact) => fact.length > 0);
  } catch {
    // Best-effort: a failed extraction must never disturb the chat turn.
    return [];
  }
}
