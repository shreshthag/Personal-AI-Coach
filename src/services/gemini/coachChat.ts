import { FunctionCallingMode, Schema, getGenerativeModel } from "firebase/ai";
import type { Content, FunctionCall, FunctionResponsePart, Part } from "firebase/ai";

import type { CoachContext, CoachTurn } from "../../models/gemini";
import { personaInstruction } from "../../constants/personas";
import type { DateKey, Goals, Meal, MealType } from "../../models/nutrition";
import { isFirebaseConfigured } from "../config/env";
import { AppError } from "../../utils/errors";
import { buildDailySummary, buildMealTotals, buildWeightSummary, classifyMode, roundMacro, sumMeals } from "../../utils/nutrition";
import { lastDateKeys } from "../../utils/date";
import { ai, simulateMealAnalysis } from "./geminiClient";

export type CoachChatSession = {
  send(request: string | (string | Part)[], onDelta?: (delta: string) => void): Promise<CoachTurn>;
  getHistory(): Promise<Content[]>;
};

export type CoachSessionOptions = {
  today: DateKey;
  // Local clock time "HH:MM" — lets the coach infer which meal an unlabelled log belongs to.
  now: string;
  isFirstMessageOfDay: boolean;
  history?: Content[];
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

type CoachDayTotals = {
  date: DateKey;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealCount: number;
  hitCalorieGoal: boolean;
};

// "Hit" follows the direction the phase implies — a ceiling when cutting or maintaining,
// a floor when bulking — so the coach never has to reinterpret the comparison itself.
function buildDayTotals(date: DateKey, meals: Meal[], goals: Goals): CoachDayTotals {
  const totals = sumMeals(meals);
  const hitCalorieGoal =
    meals.length > 0 &&
    (classifyMode(goals.mode) === "bulk" ? totals.calories >= goals.calories : totals.calories <= goals.calories);
  return { date, ...totals, mealCount: meals.length, hitCalorieGoal };
}

function averageOf(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return roundMacro(values.reduce((sum, value) => sum + value, 0) / values.length);
}

// Every figure the coach would otherwise have to get by re-adding the raw meal lists.
// Flash is unreliable at that arithmetic, so the prompt hands it finished numbers instead.
function buildCoachDerived(context: CoachContext, today: DateKey) {
  const goals = context.goals;
  const mealsByDate = new Map<DateKey, Meal[]>();
  for (const meal of context.recentMeals) {
    mealsByDate.set(meal.date, [...(mealsByDate.get(meal.date) ?? []), meal]);
  }

  // Today is excluded so a partial day never drags the averages down.
  const previousDates = lastDateKeys(8, today).filter((date) => date !== today);
  const perDay = previousDates.map((date) => buildDayTotals(date, mealsByDate.get(date) ?? [], goals));
  const trackedDays = perDay.filter((day) => day.mealCount > 0);

  const weightSummary = buildWeightSummary(today, context.recentWeights);
  const sortedWeights = [...context.recentWeights].sort((a, b) => a.date.localeCompare(b.date));
  const latestWeight = sortedWeights.at(-1) ?? null;
  const previousWeight = sortedWeights.at(-2) ?? null;

  return {
    calorieGoalRule:
      classifyMode(goals.mode) === "bulk"
        ? "bulking: the calorie target is a floor — a day counts as hit at or above it"
        : "cutting/maintenance: the calorie target is a ceiling — a day counts as hit at or under it",
    today: buildDailySummary(today, context.todayMeals, goals),
    yesterday: perDay.at(-1) ?? null,
    previous7Days: {
      startDate: previousDates[0],
      endDate: previousDates.at(-1),
      perDay,
      daysTracked: trackedDays.length,
      daysHitCalorieGoal: perDay.filter((day) => day.hitCalorieGoal).length,
      // Both framings are handed over because "7-day average" is ambiguous, and the model
      // will compute whichever one it is missing rather than leave it out.
      averagesPerCalendarDay: {
        calories: averageOf(perDay.map((day) => day.calories)),
        protein: averageOf(perDay.map((day) => day.protein)),
        carbs: averageOf(perDay.map((day) => day.carbs)),
        fat: averageOf(perDay.map((day) => day.fat))
      },
      averagesPerTrackedDay: {
        calories: averageOf(trackedDays.map((day) => day.calories)),
        protein: averageOf(trackedDays.map((day) => day.protein)),
        carbs: averageOf(trackedDays.map((day) => day.carbs)),
        fat: averageOf(trackedDays.map((day) => day.fat))
      }
    },
    weight: {
      latest: latestWeight,
      previousEntry: previousWeight,
      changeVsPreviousEntryKg:
        latestWeight && previousWeight ? roundMacro(latestWeight.weightKg - previousWeight.weightKg) : null,
      changeOverWindowKg: weightSummary.changeThisWeekKg,
      sevenDayAverageKg: weightSummary.sevenDayAverageKg
    }
  };
}

// Flash does not reliably map a clock string onto a meal window or a greeting, so the
// day part and the default meal type are resolved here instead of left to the model.
function describeTimeOfDay(now: string): { dayPart: string; defaultMealType: MealType } {
  const hour = Number(now.slice(0, 2));
  if (hour < 11) {
    return { dayPart: "morning", defaultMealType: "breakfast" };
  }
  if (hour < 16) {
    return { dayPart: "afternoon", defaultMealType: "lunch" };
  }
  if (hour < 21) {
    return { dayPart: "evening", defaultMealType: "dinner" };
  }
  return { dayPart: "night", defaultMealType: "snack" };
}

function coachObjective(mode: string): string {
  const bucket = classifyMode(mode);
  if (bucket === "bulk") {
    return "help me gain weight steadily without letting food quality or protein slip";
  }
  if (bucket === "cut") {
    return "help me lose fat in a sustainable way";
  }
  return "help me hold my weight steady and keep improving my body composition";
}

function buildCoachSystemInstruction(context: CoachContext, options: CoachSessionOptions): string {
  const { today, now, isFirstMessageOfDay } = options;
  const { dayPart, defaultMealType } = describeTimeOfDay(now);

  const slimPreviousDays = context.recentMeals
    .filter((meal) => meal.date !== today)
    .map((meal) => ({
      id: meal.id,
      date: meal.date,
      mealType: meal.mealType,
      totals: buildMealTotals(meal.foods),
      foods: meal.foods.map((food) => ({ name: food.name, quantity: food.quantity }))
    }));

  const contextJson = JSON.stringify({
    goals: context.goals,
    profile: context.profile,
    currentWeight: context.currentWeight,
    recentWeights: context.recentWeights,
    todayMeals: context.todayMeals,
    previousDays: slimPreviousDays,
    derived: buildCoachDerived(context, today)
  });

  return [
    `You are my personal nutrition coach and calorie tracker. Your goal is to ${coachObjective(context.goals.mode)}. Accuracy matters more than speed.`,
    `Your name is ${context.coachName}.`,
    `You are coaching ${context.userName ?? "the user"} — address them by their first name naturally.`,
    personaInstruction(context.persona),
    `Today's date is ${today} and the local time is ${now} — it is currently ${dayPart} in India Standard Time (IST); use IST to decide the current day. "Yesterday" is the day before ${today}, and "last week" is the 7 days before ${today}.`,
    `It is ${dayPart}, so match your greeting to that — never greet me with the wrong part of the day. When I report food without saying which meal it was, it is ${defaultMealType}: pass mealType "${defaultMealType}" and tell me that's what you assumed, unless I say otherwise.`,

    "TOOLS — you can change my data only through these, and the app carries out the action:",
    "- log_meal: when I report eating something. Estimate calories and macros yourself for each item, with a 0-1 confidence per item. The app shows me a confirmation card and saves nothing until I confirm.",
    "- log_weight: when I report a weight (convert lbs to kg first). Also shown as a confirmation card.",
    "- update_goal: when I ask to change my calorie/macro targets or my phase (cutting, bulking, maintenance, etc.). Only include the fields that change — anything omitted keeps its current value. Also shown as a confirmation card before saving.",
    "- delete_meal: when I explicitly ask to remove a specific logged meal. Use the exact id and date from MY DATA below — never guess.",
    "- delete_weight: when I explicitly ask to remove a weight entry for a specific date. Use the exact date from MY DATA below — never guess.",
    "- web_search: search Google for facts you don't reliably know. Runs automatically and returns a grounded answer — no confirmation card.",

    "ALWAYS write words in the same turn as a tool call. Whenever you propose an action, react to what I said first like a real coach would — acknowledge the food or weight, give your estimate, add a quick observation — and only then let the confirmation card follow. A card that arrives with no message is broken, not concise.",

    "USING THE TOOLS:",
    "- delete_meal and delete_weight run immediately with no confirmation and are only undone by re-logging, so never delete on a vague request — ask which entry I mean first.",
    "- To correct an already-logged meal, propose the corrected log_meal first and delete the old entry only after I have confirmed the replacement. Never delete first — if I then decline the card, I am left with nothing logged. Never leave a duplicate behind.",
    "- Never say something was logged or deleted unless the tool response says ok: true. When a response has queuedOffline: true, tell me it saved on my phone and will sync once I'm back online.",
    "- When a tool response carries totals, quote those numbers as-is instead of recomputing them.",
    "- Some of my messages open with a bracketed block labelled \"App events since your last message\". The app writes that block, not me, and it is the authoritative record of what happened to the cards you proposed. Trust it: anything it says was logged is already saved — never propose it again — and anything it says was dismissed was not saved. Add logged items to my running totals on top of derived.today.",
    "- If I decline a suggestion or an action fails, accept it gracefully without pushback.",

    `MY PHASE: my goal carries a free-text mode describing my current phase — right now it is "${context.goals.mode}". It decides whether my calorie target is a ceiling or a floor, and that governs how you word "calories remaining", "within goal" and "exceeded" everywhere below.`,
    "- Cutting: the target is a ceiling — help me stay at or under it.",
    "- Maintenance or recomp: aim to land near the target.",
    "- Bulking: the target is a MINIMUM, not a limit. Hitting it or going a bit over is good, so never tell me to stay under it, never treat going over as a slip, and nudge me to eat more when I'm short.",
    "While I am bulking, whatever number I have set is my chosen minimum and is correct by definition: even if it looks low, do NOT argue that it is wrong or 'not right for bulking', and do NOT recompute it or propose a different target — not on one bad day, not on a 7-day pattern — unless I explicitly ask you to. Your only job there is to get me to hit it every day.",

    "NUMBERS: the derived block in MY DATA already has my totals, remaining amounts, per-day history, 7-day averages and weight changes computed for me. Always use those figures verbatim — never re-add the raw meal lists yourself, never restate a total you were handed, and never divide or re-average anything — if you want an average, it is already in the derived block. The only arithmetic you do is adding food logged during this chat on top of derived.today.",

    isFirstMessageOfDay
      ? "DAILY BRIEFING — this is my first message of a new day, so open with it: greet me briefly, then summarize yesterday (calories consumed, calorie goal, calories remaining or exceeded, protein, carbs, fat, and weight if recorded) and the last 7 days (use derived.previous7Days.averagesPerCalendarDay for the averages, plus the weight trend and how many days I hit my calorie goal). End with one line that sets the tone for the day, in your own voice. Give this summary once — do not repeat it later in the conversation unless I ask."
      : "DAILY BRIEFING: this is not my first message of a new day, so do not open with a daily summary — answer what I actually asked. Give one only if I ask for it.",

    "AFTER A MEAL IS LOGGED: tell me the calories and macros added, my running totals for the day, and calories remaining against my goal.",

    "WEIGHT: when I give a weight, log it for today, then use derived.weight to compare it with my previous entry and the trend across the window — focus on the long-term direction and ignore normal day-to-day fluctuation.",

    "GOALS: don't react to a single bad day — look for patterns across at least 7 days. When cutting or maintaining: if I consistently exceed my goal, recommend a more realistic target and explain why; if I'm comfortably under it, suggest a lower one only if appropriate. When bulking, follow MY PHASE above and propose nothing. Wait for my confirmation before treating any change as real.",

    "ESTIMATES: assume food is Indian unless I say otherwise, and prefer Indian nutrition values. Round calories to the nearest 5 kcal and macros to the nearest gram, and state your assumptions. Handle uncertainty in this order:",
    "1. The food and portion are clear and familiar — estimate it directly.",
    "2. It's a packaged, branded or restaurant item, or a dish you don't reliably know — call web_search rather than guessing at low confidence. Tell me briefly what you're checking, mention when numbers came from a search, and keep it to at most two searches per turn.",
    "3. The food or its quantity is genuinely ambiguous — ask me one short question instead of guessing.",
    "I can also attach a food photo right here in this chat — when I do, identify the foods in it, estimate calories and macros per item just as you would from a text description, and propose log_meal the same way, asking one quick question first only if the photo is unclear.",

    "COACHING: do more than log. Call out my eating patterns and high-calorie foods directly, stay on my protein intake, and push healthier swaps hard when I need them. Give me credit when I've genuinely earned it, but don't hand out empty praise — hold the line and tell me exactly what to fix next.",

    "STYLE: keep replies concise and prefer short bullets over paragraphs. Use **bold** for key numbers and - bullets for lists. Never use Markdown tables or headings. Skip medical or physician disclaimers unless I specifically ask for medical advice.",
    "CHIPS: when a useful follow-up would help, end your reply with [[chips: First option | Second option | Third option]] — at most 3 short choices. Everything from the first [[ onward is stripped before I see it, so write the marker at most once, as the very last thing in the reply, never write [[ anywhere else, and never put | or ] inside a chip label. Do not add chips when a confirmation card is pending; it already has its own buttons.",

    "MY DATA — calories in kcal, macros in grams, weight in kg, height in cm. Use ids and dates exactly as given when calling the delete tools.",
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

function createRealCoachChatSession(context: CoachContext, options: CoachSessionOptions): CoachChatSession {
  const model = getGenerativeModel(ai, {
    model: "gemini-2.5-flash",
    systemInstruction: buildCoachSystemInstruction(context, options),
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
  const chat = model.startChat(options.history ? { history: options.history } : {});

  return {
    async send(request, onDelta) {
      try {
        const result = await chat.sendMessageStream(request);
        for await (const chunk of result.stream) {
          try {
            const delta = chunk.text();
            if (delta) {
              onDelta?.(delta);
            }
          } catch {
            // Blocked/empty content — a chunk can throw for the same reason as the final response.
          }
        }
        const response = await result.response;

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

// True only for a real FunctionResponsePart — plain strings and image/text parts
// from a user turn (e.g. an attached photo) never have this field set.
function isFunctionResponsePart(part: string | Part): part is FunctionResponsePart {
  return typeof part !== "string" && part.functionResponse != null;
}

async function streamSimulatedTurn(turn: CoachTurn, onDelta?: (delta: string) => void): Promise<CoachTurn> {
  if (!onDelta || !turn.text) {
    return turn;
  }
  for (let index = 0; index < turn.text.length; index += 24) {
    onDelta(turn.text.slice(index, index + 24));
    await new Promise((resolve) => setTimeout(resolve, 24));
  }
  return turn;
}

function createSimulatedCoachChatSession(context: CoachContext, today: DateKey): CoachChatSession {
  return {
    async send(request, onDelta) {
      await new Promise((resolve) => setTimeout(resolve, 600));

      if (Array.isArray(request) && request.every(isFunctionResponsePart)) {
        const allOk = request.every((part) => (part.functionResponse.response as { ok?: boolean }).ok === true);
        const isDelete = request.some(
          (part) => part.functionResponse.name === "delete_meal" || part.functionResponse.name === "delete_weight"
        );
        const text = !allOk ? "No problem, I won't log that." : isDelete ? "Removed that entry." : "Done — logged that for you!";
        return streamSimulatedTurn({ text, functionCalls: [] }, onDelta);
      }

      // Non-FunctionResponsePart array (plain strings / text parts / image parts, or a
      // mix) — derive a single text string to drive the same canned-response logic below.
      const requestText = Array.isArray(request)
        ? request
            .map((part) => (typeof part === "string" ? part : typeof part.text === "string" ? part.text : ""))
            .filter((text) => text.length > 0)
            .join(" ")
        : request;

      const normText = requestText.toLowerCase();

      const isDeleteIntent = normText.includes("delete") || normText.includes("remove");
      if (isDeleteIntent) {
        const matchedFoodKeyword = foodKeywords.find((keyword) => normText.includes(keyword));
        if (matchedFoodKeyword) {
          const allMeals = [...context.todayMeals, ...context.recentMeals];
          const matchedMeal = allMeals.find((meal) =>
            meal.foods.some((food) => food.name.toLowerCase().includes(matchedFoodKeyword))
          );
          return streamSimulatedTurn({
            text: "Sure — removing that.",
            functionCalls: [
              {
                name: "delete_meal",
                args: { date: matchedMeal?.date ?? today, mealId: matchedMeal?.id ?? "sim-meal" }
              }
            ]
          }, onDelta);
        }

        const hasWeightSignal = normText.includes("weight") || normText.includes("kg") || normText.includes("weigh");
        if (hasWeightSignal) {
          return streamSimulatedTurn({
            text: "Sure — removing that weight entry.",
            functionCalls: [{ name: "delete_weight", args: { date: today } }]
          }, onDelta);
        }
      }

      const goalModeKeywords: Record<string, string> = { bulk: "bulking", cut: "cutting", maintain: "maintenance" };
      const hasGoalSignal = normText.includes("goal") || normText.includes("target") || normText.includes("calorie");
      const matchedGoalModeKeyword = Object.keys(goalModeKeywords).find((keyword) => normText.includes(keyword));
      if (hasGoalSignal || matchedGoalModeKeyword) {
        const numberText = normText.match(/(\d+(?:\.\d+)?)/)?.[1];
        if (matchedGoalModeKeyword || numberText) {
          return streamSimulatedTurn({
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
          }, onDelta);
        }
      }

      const matchedFoodKeyword = foodKeywords.find((keyword) => normText.includes(keyword));
      if (matchedFoodKeyword) {
        const analysis = simulateMealAnalysis(requestText);
        return streamSimulatedTurn({
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
        }, onDelta);
      }

      const hasWeightSignal = normText.includes("kg") || normText.includes("weigh") || normText.includes("weighed");
      const numberText = normText.match(/(\d+(?:\.\d+)?)/)?.[1];
      if (hasWeightSignal && numberText) {
        const rawValue = parseFloat(numberText);
        const isPounds = normText.includes("lbs") || normText.includes("pounds") || normText.includes("pound");
        const weightKg = Math.round((isPounds ? rawValue * 0.453592 : rawValue) * 10) / 10;
        return streamSimulatedTurn({
          text: "Got it — here's the weight entry, confirm if that's right.",
          functionCalls: [
            {
              name: "log_weight",
              args: { date: today, weightKg }
            }
          ]
        }, onDelta);
      }

      return streamSimulatedTurn({
        text: simulatedCoachText(normText),
        functionCalls: []
      }, onDelta);
    },
    getHistory() {
      return Promise.resolve([]);
    }
  };
}

export function createCoachChatSession(context: CoachContext, options: CoachSessionOptions): CoachChatSession {
  if (!isFirebaseConfigured()) {
    return createSimulatedCoachChatSession(context, options.today);
  }
  return createRealCoachChatSession(context, options);
}
