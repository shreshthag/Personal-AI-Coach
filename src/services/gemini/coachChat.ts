import { FunctionCallingMode, Schema, getGenerativeModel } from "firebase/ai";
import type { Content, FunctionCall, FunctionResponsePart } from "firebase/ai";

import type { CoachContext, CoachTurn } from "../../models/gemini";
import { personaInstruction } from "../../constants/personas";
import type { DateKey, MealType } from "../../models/nutrition";
import { isFirebaseConfigured } from "../config/env";
import { AppError } from "../../utils/errors";
import { buildMealTotals } from "../../utils/nutrition";
import { ai, simulateMealAnalysis } from "./geminiClient";

export type CoachChatSession = {
  send(request: string | FunctionResponsePart[]): Promise<CoachTurn>;
  getHistory(): Promise<Content[]>;
};

const logMealDeclaration = {
  name: "log_meal",
  description:
    "Propose logging a meal for the user. This never writes anything by itself — the app always shows the user a confirmation card first and only logs the meal if they confirm.",
  parameters: Schema.object({
    properties: {
      date: Schema.string({
        description: "Date the meal was eaten, in YYYY-MM-DD format. Defaults to today unless the user says otherwise."
      }),
      mealType: Schema.enumString({
        enum: ["breakfast", "lunch", "dinner", "snack"],
        description: "Which meal this is."
      }),
      foods: Schema.array({
        description: "One entry per distinct food item in the meal, with your own nutrition estimate for each.",
        items: Schema.object({
          properties: {
            name: Schema.string({ description: "Food name." }),
            quantity: Schema.string({ description: "Human-readable quantity, e.g. '1 medium' or '2 slices'." }),
            calories: Schema.number({ description: "Estimated calories in kcal." }),
            protein: Schema.number({ description: "Estimated protein in grams." }),
            carbs: Schema.number({ description: "Estimated carbs in grams." }),
            fat: Schema.number({ description: "Estimated fat in grams." }),
            confidence: Schema.number({ description: "Your confidence in this estimate, from 0 to 1." })
          }
        })
      }),
      notes: Schema.string({ description: "Optional free-text notes about the meal." })
    },
    optionalProperties: ["notes"]
  })
};

const logWeightDeclaration = {
  name: "log_weight",
  description:
    "Propose logging a body weight entry for the user. This never writes anything by itself — the app always shows the user a confirmation card first and only logs the weight if they confirm.",
  parameters: Schema.object({
    properties: {
      date: Schema.string({
        description: "Date the weight was recorded, in YYYY-MM-DD format. Defaults to today unless the user says otherwise."
      }),
      weightKg: Schema.number({
        description: "The weight in kilograms. If the user reported pounds (lbs), convert to kilograms before filling this in."
      })
    },
    optionalProperties: []
  })
};

const deleteMealDeclaration = {
  name: "delete_meal",
  description:
    "Delete a previously logged meal. This executes immediately with no confirmation step, so only call it when the user clearly asks to remove or delete a specific meal, using the exact id and date from the context data.",
  parameters: Schema.object({
    properties: {
      date: Schema.string({
        description: "Date the meal was logged, in YYYY-MM-DD format, taken from the context data."
      }),
      mealId: Schema.string({ description: "The id of the meal to delete, taken from the context data." })
    },
    optionalProperties: []
  })
};

const deleteWeightDeclaration = {
  name: "delete_weight",
  description:
    "Delete a previously logged weight entry for a given date. This executes immediately with no confirmation step, so only call it when the user clearly asks to remove or delete a weight entry, using the exact date from the context data.",
  parameters: Schema.object({
    properties: {
      date: Schema.string({
        description: "Date of the weight entry to delete, in YYYY-MM-DD format, taken from the context data."
      })
    },
    optionalProperties: []
  })
};

const webSearchDeclaration = {
  name: "web_search",
  description:
    "Search Google for current, factual information — packaged or restaurant nutrition, unfamiliar dishes, anything you don't reliably know. The app runs the search and returns a grounded answer. Runs automatically with no confirmation card.",
  parameters: Schema.object({
    properties: {
      query: Schema.string({ description: "The search query." })
    },
    optionalProperties: []
  })
};

const updateGoalDeclaration = {
  name: "update_goal",
  description:
    "Propose changing the user's daily calorie/macro goal and/or phase mode. Only include the fields that should change — fields left out keep their current value. This never writes anything by itself — the app always shows the user a confirmation card first and only saves the change if they confirm.",
  parameters: Schema.object({
    properties: {
      calories: Schema.number({ description: "New daily calorie goal in kcal. Omit if unchanged." }),
      protein: Schema.number({ description: "New daily protein goal in grams. Omit if unchanged." }),
      carbs: Schema.number({ description: "New daily carbs goal in grams. Omit if unchanged." }),
      fat: Schema.number({ description: "New daily fat goal in grams. Omit if unchanged." }),
      mode: Schema.string({
        description: "Free-text phase describing the goal, e.g. 'cutting', 'bulking', 'maintenance', 'recomp'. Omit if unchanged."
      })
    },
    optionalProperties: ["calories", "protein", "carbs", "fat", "mode"]
  })
};

function buildCoachSystemInstruction(context: CoachContext, today: DateKey): string {
  const slimLast7Days = context.last7Days.map((meal) => ({
    id: meal.id,
    date: meal.date,
    mealType: meal.mealType,
    totals: buildMealTotals(meal.foods),
    foods: meal.foods.map((food) => ({ name: food.name, quantity: food.quantity }))
  }));

  const contextJson = JSON.stringify({
    goals: context.goals,
    currentWeight: context.currentWeight,
    recentWeights: context.recentWeights,
    todayMeals: context.todayMeals,
    last7Days: slimLast7Days,
    profile: context.profile
  });

  return [
    "You are my personal nutrition coach and calorie tracker. Your goal is to help me lose fat in a sustainable way. Accuracy matters more than speed.",
    `Your name is ${context.coachName}.`,
    `You are coaching ${context.userName ?? "the user"} — address them by their first name naturally.`,
    personaInstruction(context.persona),
    `Today's date is ${today} in India Standard Time (IST); use IST to decide the current day. "Yesterday" is the day before ${today}, and "last week" is the previous 7 days.`,

    "TOOLS — you can change my data only through these, and the app carries out the action:",
    "- log_meal: when I report eating something. Estimate calories and macros yourself for each item, with a 0-1 confidence per item. The app shows me a confirmation card and saves nothing until I confirm.",
    "- log_weight: when I report a weight (convert lbs to kg first). Also shown as a confirmation card.",
    "- delete_meal: when I explicitly ask to remove a specific logged meal. Use the exact id and date from the data below — never guess.",
    "- delete_weight: when I explicitly ask to remove a weight entry for a specific date. Use the exact date from the data below — never guess.",
    "delete_meal and delete_weight run immediately with no confirmation and are only undone by re-logging, so never delete on a vague request — ask which entry I mean first.",
    "To correct or edit an already-logged meal, delete the old entry and log the corrected one — never leave a duplicate.",
    "Never say something was logged or deleted unless the tool response says ok: true. If I decline a suggestion or an action fails, accept it gracefully without pushback.",
    "Never call a tool silently: whenever you propose an action, write a short natural reply in the same turn — react to what I said like a real coach would (acknowledge the food or weight, mention your estimate or a quick observation) before the confirmation card appears. A bare confirmation card with no words feels robotic.",
    "- update_goal: when I ask to change my calorie/macro targets or my phase (cutting, bulking, maintenance, etc.). Only include the fields that change — anything omitted keeps its current value. Also shown as a confirmation card before saving.",
    "- web_search: search Google for facts you don't reliably know. Runs automatically and returns a grounded answer — no confirmation card.",
    "MODE: my goal carries a free-text mode describing my current phase (e.g. 'cutting', 'bulking', 'maintenance', 'recomp'). Use it to frame advice — a deficit mindset for cutting, a surplus mindset for bulking, and so on.",

    "DAILY GREETING — on my first message of a new day only: greet me briefly, then summarize yesterday (calories consumed, calorie goal, calories remaining or exceeded, protein, carbs, fat, and weight if recorded) and the last 7 days (average calories, protein, carbs, fat, the weight trend, and how many days I stayed within my calorie goal). End with one blunt, no-excuses line that sets the tone for the day. Do not repeat this summary again unless I ask.",

    "AFTER A MEAL IS LOGGED: tell me the calories and macros added, my running totals for the day, and calories remaining against my goal. Compute totals from today's meals plus anything logged during this chat.",

    "WEIGHT: when I give a weight, log it for today, then compare it with yesterday and last week and focus on the long-term trend — ignore normal day-to-day fluctuation.",

    "GOALS: don't react to a single bad day. Look for patterns across at least 7 days. If I consistently exceed my goal, recommend a more realistic target and explain why; if I'm comfortably under it, suggest a lower one only if appropriate. Wait for my confirmation before treating any change as real.",

    "ESTIMATES: assume food is Indian unless I say otherwise, and prefer Indian nutrition values. If the food or its quantity is unclear, ask instead of guessing, and state your assumptions. Round calories to the nearest 5 kcal and macros to the nearest gram. When confidence is low, ask before estimating. I enter food here as text; photo logging lives on the Log Meal screen.",

    "WEB SEARCH: use the web_search tool when you need facts you don't reliably know — packaged or restaurant item nutrition, unfamiliar dishes, or current information. Prefer a quick search over a low-confidence guess, tell me briefly what you're checking when you call it, and mention when your numbers come from a search.",

    "COACHING: do more than log. Call out my eating patterns and high-calorie foods directly, stay on my protein intake, and push healthier swaps hard when I need them. Give me credit when I've genuinely earned it, but don't hand out empty praise — hold the line and tell me exactly what to fix next.",

    "STYLE: keep replies concise and prefer short bullets over paragraphs. This chat renders plain text, so do NOT use Markdown tables or headings — lay out day or week summaries as simple aligned lines. Skip medical or physician disclaimers unless I specifically ask for medical advice.",

    "MY DATA (use the ids and dates exactly when calling delete tools): the context now also includes my body profile (height cm, age, gender, activity level) — use it for advice and target math.",
    `Context JSON: ${contextJson}`
  ].join("\n");
}

// Gemini rejects google_search combined with function declarations in one request,
// so web_search is a function tool backed by this separate search-only call.
export async function runWebSearch(query: string): Promise<string> {
  const model = getGenerativeModel(ai, {
    model: "gemini-2.5-flash",
    tools: [{ googleSearch: {} }]
  });
  const result = await model.generateContent(query);
  return result.response.text();
}

function createRealCoachChatSession(context: CoachContext, today: DateKey, history?: Content[]): CoachChatSession {
  const model = getGenerativeModel(ai, {
    model: "gemini-2.5-flash",
    systemInstruction: buildCoachSystemInstruction(context, today),
    tools: [
      {
        functionDeclarations: [
          logMealDeclaration,
          logWeightDeclaration,
          deleteMealDeclaration,
          deleteWeightDeclaration,
          updateGoalDeclaration,
          webSearchDeclaration
        ]
      }
    ],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
    generationConfig: { temperature: 0.4 }
  });
  const chat = model.startChat(history ? { history } : {});

  return {
    async send(request) {
      try {
        const result = await chat.sendMessage(request);
        const response = result.response;

        let text = "";
        try {
          text = response.text();
        } catch {
          // Blocked/empty content — fall back to no text rather than throwing.
          text = "";
        }

        let calls: FunctionCall[] = [];
        try {
          calls = response.functionCalls() ?? [];
        } catch {
          calls = [];
        }

        return { text, functionCalls: calls };
      } catch (error) {
        throw new AppError(
          error instanceof Error ? error.message : "Gemini coach chat failed.",
          "The coach request failed. Please retry in a moment."
        );
      }
    },
    getHistory() {
      return chat.getHistory();
    }
  };
}

function guessMealType(normText: string): MealType {
  if (normText.includes("breakfast")) {
    return "breakfast";
  }
  if (normText.includes("lunch")) {
    return "lunch";
  }
  if (normText.includes("dinner")) {
    return "dinner";
  }
  return "snack";
}

// Canned coaching text ported verbatim from the old JSON-mode simulateCoach, since the
// simulator has no model to generate a real reply from.
function simulatedCoachText(normText: string): string {
  if (normText.includes("pizza")) {
    return [
      "A slice of cheese pizza provides about 290 kcal (12g protein, 32g carbs, 12g fat). If your daily goals allow, you can absolutely fit this in! Just focus on high-protein, nutrient-dense choices for the rest of your meals today.",
      "- Cap it at 1-2 slices to stay within your targets",
      "- Add a side salad or non-starchy veggies for fiber",
      "- Make sure to meet your protein target using lean protein sources",
      "Watch out for high sodium levels, and avoid eating heavy, greasy meals close to bedtime."
    ].join("\n");
  }

  if (normText.includes("dinner") || normText.includes("eat")) {
    return [
      "For a balanced dinner, focus on a high-quality protein source, non-starchy greens, and moderate complex carbs. This supports recovery, muscle maintenance, and keeps you full overnight.",
      "- Grilled Chicken Breast (150g) with baked sweet potato and asparagus",
      "- Pan-seared tofu or paneer with quinoa and stir-fried broccoli",
      "- Keep sauces and oils minimal to avoid hidden fats",
      "Avoid high-fat or processed convenience meals, and be mindful of liquid calories like fruit juices or soda."
    ].join("\n");
  }

  if (normText.includes("weight") || normText.includes("scale") || normText.includes("dropping")) {
    return [
      "Weight fluctuations are completely normal. Daily changes on the scale are usually caused by water retention, sodium intake, carb depletion/repletion, or muscle inflammation from training. Focus on the weekly averages and consistency over single-day metrics.",
      "- Stick to a consistent daily calorie deficit",
      "- Aim for 8,000+ daily steps to boost activity",
      "- Take weekly photos and body measurements instead of just weighing",
      "Do not aggressively cut calories below your healthy targets, and avoid stress since high cortisol levels can trigger water retention."
    ].join("\n");
  }

  return [
    "Consistency is key to reaching your wellness and body composition goals. Consistently tracking meals, matching your daily protein target, and sleeping 7-8 hours are the best foundational habits.",
    "- Track all snacks, oils, and condiments",
    "- Spread protein intake evenly across your meals",
    "- Drink at least 2-3 liters of water daily",
    "Don't compromise sleep, which is critical for fat loss and muscle recovery, and avoid skipping meals, which can lead to cravings later."
  ].join("\n");
}

const foodKeywords = ["idli", "sambar", "dosa", "pizza", "apple"];

function createSimulatedCoachChatSession(context: CoachContext, today: DateKey): CoachChatSession {
  return {
    async send(request) {
      await new Promise((resolve) => setTimeout(resolve, 600));

      if (Array.isArray(request)) {
        const allOk = request.every((part) => (part.functionResponse.response as { ok?: boolean }).ok === true);
        const isDelete = request.some(
          (part) => part.functionResponse.name === "delete_meal" || part.functionResponse.name === "delete_weight"
        );
        const text = !allOk ? "No problem, I won't log that." : isDelete ? "Removed that entry." : "Done — logged that for you!";
        return { text, functionCalls: [] };
      }

      const normText = request.toLowerCase();

      const isDeleteIntent = normText.includes("delete") || normText.includes("remove");
      if (isDeleteIntent) {
        const matchedFoodKeyword = foodKeywords.find((keyword) => normText.includes(keyword));
        if (matchedFoodKeyword) {
          const allMeals = [...context.todayMeals, ...context.last7Days];
          const matchedMeal = allMeals.find((meal) =>
            meal.foods.some((food) => food.name.toLowerCase().includes(matchedFoodKeyword))
          );
          return {
            text: "Sure — removing that.",
            functionCalls: [
              {
                name: "delete_meal",
                args: { date: matchedMeal?.date ?? today, mealId: matchedMeal?.id ?? "sim-meal" }
              }
            ]
          };
        }

        const hasWeightSignal = normText.includes("weight") || normText.includes("kg") || normText.includes("weigh");
        if (hasWeightSignal) {
          return {
            text: "Sure — removing that weight entry.",
            functionCalls: [{ name: "delete_weight", args: { date: today } }]
          };
        }
      }

      const goalModeKeywords: Record<string, string> = { bulk: "bulking", cut: "cutting", maintain: "maintenance" };
      const hasGoalSignal = normText.includes("goal") || normText.includes("target") || normText.includes("calorie");
      const matchedGoalModeKeyword = Object.keys(goalModeKeywords).find((keyword) => normText.includes(keyword));
      if (hasGoalSignal || matchedGoalModeKeyword) {
        const numberText = normText.match(/(\d+(?:\.\d+)?)/)?.[1];
        if (matchedGoalModeKeyword || numberText) {
          return {
            text: "Here's the updated goal — take a look and confirm if it's right.",
            functionCalls: [
              {
                name: "update_goal",
                args: {
                  ...(matchedGoalModeKeyword ? { mode: goalModeKeywords[matchedGoalModeKeyword] } : {}),
                  ...(numberText ? { calories: parseFloat(numberText) } : {})
                }
              }
            ]
          };
        }
      }

      const matchedFoodKeyword = foodKeywords.find((keyword) => normText.includes(keyword));
      if (matchedFoodKeyword) {
        const analysis = simulateMealAnalysis(request);
        return {
          text: "Here's what I estimated — take a look and confirm if it's right.",
          functionCalls: [
            {
              name: "log_meal",
              args: {
                date: today,
                mealType: guessMealType(normText),
                foods: analysis.foods,
                notes: ""
              }
            }
          ]
        };
      }

      const hasWeightSignal = normText.includes("kg") || normText.includes("weigh") || normText.includes("weighed");
      const numberText = normText.match(/(\d+(?:\.\d+)?)/)?.[1];
      if (hasWeightSignal && numberText) {
        const rawValue = parseFloat(numberText);
        const isPounds = normText.includes("lbs") || normText.includes("pounds") || normText.includes("pound");
        const weightKg = Math.round((isPounds ? rawValue * 0.453592 : rawValue) * 10) / 10;
        return {
          text: "Got it — here's the weight entry, confirm if that's right.",
          functionCalls: [
            {
              name: "log_weight",
              args: { date: today, weightKg }
            }
          ]
        };
      }

      return {
        text: simulatedCoachText(normText),
        functionCalls: []
      };
    },
    getHistory() {
      return Promise.resolve([]);
    }
  };
}

export function createCoachChatSession(context: CoachContext, today: DateKey, history?: Content[]): CoachChatSession {
  if (!isFirebaseConfigured()) {
    return createSimulatedCoachChatSession(context, today);
  }
  return createRealCoachChatSession(context, today, history);
}
