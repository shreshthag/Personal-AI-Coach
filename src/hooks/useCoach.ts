import { useEffect, useRef, useState } from "react";
import type { Content, FunctionResponsePart, Part } from "firebase/ai";

import type { CoachChatMessage, CoachContext, CoachGoalProposalData, CoachProposal, CoachTurn } from "../models/gemini";
import type { DateKey } from "../models/nutrition";
import { clearCoachChat, readCoachChat, saveCoachChat } from "../services/cache/coachChatCache";
import {
  buildCoachDataBlock,
  coachStaticSignature,
  createCoachChatSession,
  runWebSearch,
  type CoachChatSession
} from "../services/gemini/coachChat";
import {
  deleteMealArgsSchema,
  deleteWeightArgsSchema,
  logMealArgsSchema,
  logWeightArgsSchema,
  updateGoalArgsSchema,
  webSearchArgsSchema
} from "../services/gemini/schemas";
import { toClockTime, toDateKey } from "../utils/date";
import { toFriendlyError } from "../utils/errors";
import { createId } from "../utils/id";
import { buildMealTotals, computeTargets } from "../utils/nutrition";
import { useAddMeal, useDeleteMealEntry } from "./useDailyMeals";
import { useAuth } from "./useAuth";
import { useUpdateGoals } from "./useGoals";
import { useDeleteWeight, useSaveWeight } from "./useWeight";

type CoachChatStatus = "idle" | "waitingForModel" | "awaitingConfirmation";

// Cap on chained function-call rounds within a single user turn, to stop runaway tool loops.
const MAX_ROUNDS = 4;

type PendingBatch = {
  calls: CoachTurn["functionCalls"];
  // Responses keyed by the call's index within the batch, so the flush can
  // rebuild the parts in the original call order regardless of resolution order.
  responses: Map<number, FunctionResponsePart>;
  slotByProposalId: Map<string, number>;
  // True when the batch contains an auto-executing call (web_search / delete_*): the model
  // needs those results to continue, so such a batch keeps the old blocking flush. A batch of
  // only user-confirmable proposals resolves lazily and never triggers a model turn on its own.
  autoFlush: boolean;
};

function buildResponsePart(call: { id?: string; name: string }, response: object): FunctionResponsePart {
  // Copy call.id through when present, but internal app state is never keyed
  // on it — the Developer API backend leaves it undefined, so proposals always
  // get their own createId instead.
  return {
    functionResponse: {
      name: call.name,
      ...(call.id ? { id: call.id } : {}),
      response
    }
  };
}

// Strips base64 image data out of chat history before it's persisted to AsyncStorage —
// the live session object still keeps the real inlineData for continued conversation context.
function sanitizeHistoryForPersistence(history: Content[]): Content[] {
  return history.map((content) => ({
    ...content,
    parts: content.parts.map((part) => (part.inlineData ? { text: "[photo]" } : part))
  }));
}

function describeProposalOutcome(proposal: CoachProposal): string {
  if (proposal.status === "confirmed") {
    if (proposal.tool === "log_meal") {
      const items = proposal.meal.foods.map((food) => food.name).join(", ");
      return `Your ${proposal.meal.mealType} suggestion (${items}) was accepted and saved.`;
    }
    if (proposal.tool === "log_weight") {
      return `Your weight suggestion was accepted and saved.`;
    }
    if (proposal.tool === "update_goal") {
      return `Your goal-change suggestion was accepted and saved.`;
    }
  }
  if (proposal.status === "failed") {
    return `Saving your ${proposal.tool} suggestion failed — nothing was saved.`;
  }
  return `The user dismissed your ${proposal.tool} suggestion — nothing was saved.`;
}

export function parseCoachText(raw: string): { text: string; chips: string[] } {
  const markerIndex = raw.indexOf("[[");
  if (markerIndex === -1) {
    return { text: raw, chips: [] };
  }
  const marker = raw.slice(markerIndex);
  const chipsValue = marker.match(/^\[\[chips:\s*([^\]]+)\]\]/i)?.[1];
  return {
    text: raw.slice(0, markerIndex).trimEnd(),
    chips: chipsValue
      ? chipsValue
          .split("|")
          .map((chip) => chip.trim())
          .filter(Boolean)
          .slice(0, 3)
      : []
  };
}

export function useCoachChat(getContext: () => CoachContext) {
  const { user } = useAuth();
  const uid = user?.uid;
  const addMeal = useAddMeal();
  const saveWeight = useSaveWeight();
  const deleteMealEntry = useDeleteMealEntry();
  const deleteWeight = useDeleteWeight();
  const updateGoals = useUpdateGoals();

  const [messages, setMessages] = useState<CoachChatMessage[]>([]);
  const [proposals, setProposals] = useState<Record<string, CoachProposal>>({});
  const [status, setStatus] = useState<CoachChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<CoachChatSession | null>(null);
  const historyRef = useRef<Content[]>([]);
  const lastActiveDateRef = useRef<DateKey | null>(null);
  // Rebuilding the session replaces the system instruction, which breaks Gemini's prefix cache.
  // So it is rebuilt only when a value the static instruction embeds actually changes — the date,
  // goals, profile, persona or names. Fresh numbers ride in the per-turn data block instead.
  const sessionSignatureRef = useRef<string | null>(null);
  // Bumped by resetChat; async continuations capture the epoch at start and
  // bail if it changed, so a mid-flight reset can never resurrect stale state.
  const epochRef = useRef(0);
  const roundRef = useRef(0);
  const batchRef = useRef<PendingBatch | null>(null);
  // Outcomes of pills the user resolved (or walked away from) since the last message.
  // These ride along as text, not as functionResponse parts: the SDK rejects a message that
  // mixes a FunctionResponse with any other part, and Gemini is happy to accept a plain user
  // turn while an earlier functionCall sits unanswered.
  const pendingOutcomesRef = useRef<string[]>([]);
  const streamMsgIdRef = useRef<string | null>(null);
  const streamRawTextRef = useRef("");

  // Ref mirrors so async continuations always read/write the latest state
  // instead of a stale render closure.
  const messagesRef = useRef<CoachChatMessage[]>([]);
  const proposalsRef = useRef<Record<string, CoachProposal>>({});
  const statusRef = useRef<CoachChatStatus>("idle");

  function applyMessages(updater: (prev: CoachChatMessage[]) => CoachChatMessage[]): void {
    messagesRef.current = updater(messagesRef.current);
    setMessages(messagesRef.current);
  }

  function applyProposals(updater: (prev: Record<string, CoachProposal>) => Record<string, CoachProposal>): void {
    proposalsRef.current = updater(proposalsRef.current);
    setProposals(proposalsRef.current);
  }

  function applyStatus(next: CoachChatStatus): void {
    statusRef.current = next;
    setStatus(next);
  }

  useEffect(() => {
    if (!uid) {
      return;
    }
    const epoch = epochRef.current;
    readCoachChat(uid).then((snapshot) => {
      // Skip if reset happened or the user already started chatting before hydration resolved.
      if (!snapshot || epoch !== epochRef.current || messagesRef.current.length > 0) {
        return;
      }
      const restoredProposals: Record<string, CoachProposal> = {};
      for (const proposal of Object.values(snapshot.proposals)) {
        // A proposal still pending/confirming at restart can't be safely resumed —
        // force it to declined so the thread is fully resolved.
        restoredProposals[proposal.id] =
          proposal.status === "pending" || proposal.status === "confirming"
            ? { ...proposal, status: "declined" }
            : proposal;
      }
      // A trailing model turn with an unanswered function call can't be resumed — the
      // responses lived in memory and died with the process. Drop it so the restored
      // session starts from a clean turn boundary.
      const restoredHistory = snapshot.history.filter((content, index) => {
        const isLast = index === snapshot.history.length - 1;
        return !(isLast && content.parts.some((part) => part.functionCall != null));
      });
      historyRef.current = restoredHistory;
      lastActiveDateRef.current = snapshot.lastActiveDate ?? null;
      pendingOutcomesRef.current = snapshot.pendingOutcomes ?? [];
      applyMessages(() => snapshot.messages);
      applyProposals(() => restoredProposals);
    });
  }, [uid]);

  function persistSnapshot(): void {
    if (!uid) {
      return;
    }
    void saveCoachChat(uid, {
      messages: messagesRef.current,
      proposals: proposalsRef.current,
      history: sanitizeHistoryForPersistence(historyRef.current),
      ...(lastActiveDateRef.current ? { lastActiveDate: lastActiveDateRef.current } : {}),
      ...(pendingOutcomesRef.current.length > 0 ? { pendingOutcomes: pendingOutcomesRef.current } : {})
    });
  }

  function beginStreamingTurn(): void {
    streamMsgIdRef.current = null;
    streamRawTextRef.current = "";
  }

  function handleStreamDelta(delta: string, epoch: number): void {
    if (epoch !== epochRef.current) {
      return;
    }
    streamRawTextRef.current += delta;
    const { text } = parseCoachText(streamRawTextRef.current);
    if (!text) {
      return;
    }
    if (!streamMsgIdRef.current) {
      const id = createId("msg");
      streamMsgIdRef.current = id;
      applyMessages((prev) => [...prev, { id, kind: "coach", text, streaming: true }]);
      return;
    }
    const id = streamMsgIdRef.current;
    applyMessages((prev) =>
      prev.map((message) => (message.id === id && message.kind === "coach" ? { ...message, text } : message))
    );
  }

  function finalizeCoachText(raw: string, thought?: string): void {
    const { text, chips } = parseCoachText(raw);
    const streamMsgId = streamMsgIdRef.current;
    streamMsgIdRef.current = null;
    streamRawTextRef.current = "";

    if (streamMsgId) {
      if (!text) {
        applyMessages((prev) => prev.filter((message) => message.id !== streamMsgId));
        return;
      }
      applyMessages((prev) =>
        prev.map((message) => {
          if (message.id !== streamMsgId || message.kind !== "coach") {
            return message;
          }
          const { streaming: _streaming, quickReplies: _quickReplies, thought: _thought, ...settled } = message;
          return { ...settled, text, ...(chips.length > 0 ? { quickReplies: chips } : {}), ...(thought ? { thought } : {}) };
        })
      );
      return;
    }

    if (text) {
      applyMessages((prev) => [...prev, { id: createId("msg"), kind: "coach", text, ...(chips.length > 0 ? { quickReplies: chips } : {}), ...(thought ? { thought } : {}) }]);
    }
  }

  function clearStreamingMessage(): void {
    const streamMsgId = streamMsgIdRef.current;
    streamMsgIdRef.current = null;
    streamRawTextRef.current = "";
    if (!streamMsgId) {
      return;
    }
    applyMessages((prev) =>
      prev.map((message) => {
        if (message.id !== streamMsgId || message.kind !== "coach") {
          return message;
        }
        const { streaming: _streaming, ...settled } = message;
        return settled;
      })
    );
  }

  function handleSendError(sendError: unknown, wasFlush: boolean): void {
    const friendly = toFriendlyError(sendError, "The coach could not respond. Please retry.");
    clearStreamingMessage();
    applyMessages((prev) => [...prev, { id: createId("msg"), kind: "error", text: friendly }]);
    setError(friendly);
    if (wasFlush) {
      // We don't know whether the model received our function responses, so the
      // session history can't be trusted anymore — discard it.
      sessionRef.current = null;
    }
    batchRef.current = null;
    applyStatus("idle");
  }

  async function finishTurn(epoch: number, session: CoachChatSession | null): Promise<void> {
    if (session) {
      try {
        const history = await session.getHistory();
        if (epoch !== epochRef.current) {
          return;
        }
        historyRef.current = history;
      } catch {
        // Keep the last known history if reading fails.
      }
    } else {
      historyRef.current = [];
    }
    applyStatus("idle");
    persistSnapshot();
  }

  async function handleTurn(turn: CoachTurn, epoch: number, session: CoachChatSession): Promise<void> {
    finalizeCoachText(turn.text, turn.thought);

    if (turn.functionCalls.length === 0) {
      await finishTurn(epoch, session);
      return;
    }

    if (roundRef.current >= MAX_ROUNDS) {
      // Round cap: refuse every call in one flush so the history never ends on
      // an unanswered functionCall, then discard the session anyway rather than
      // reuse a history whose final turns are refusals.
      const parts = turn.functionCalls.map((call) =>
        buildResponsePart(call, { ok: false, error: "Action limit reached, please try a simpler request." })
      );
      try {
        beginStreamingTurn();
        const closing = await session.send(parts, (delta) => handleStreamDelta(delta, epoch));
        if (epoch !== epochRef.current) {
          return;
        }
        finalizeCoachText(closing.text, closing.thought);
      } catch (sendError) {
        if (epoch !== epochRef.current) {
          return;
        }
        handleSendError(sendError, true);
        return;
      }
      sessionRef.current = null;
      await finishTurn(epoch, null);
      return;
    }

    const batch: PendingBatch = {
      calls: turn.functionCalls,
      responses: new Map(),
      slotByProposalId: new Map(),
      autoFlush: false
    };
    const context = getContext();
    const autoExecuteIds: string[] = [];
    let pendingCount = 0;

    turn.functionCalls.forEach((call, index) => {
      if (call.name === "log_meal") {
        const parsed = logMealArgsSchema.safeParse(call.args);
        if (parsed.success) {
          const proposalId = createId("proposal");
          applyProposals((prev) => ({
            ...prev,
            [proposalId]: { id: proposalId, ...(call.id ? { callId: call.id } : {}), tool: "log_meal", status: "pending", meal: parsed.data }
          }));
          batch.slotByProposalId.set(proposalId, index);
          applyMessages((prev) => [...prev, { id: createId("msg"), kind: "proposal", proposalId }]);
          pendingCount += 1;
        } else {
          batch.responses.set(
            index,
            buildResponsePart(call, {
              ok: false,
              error: `Invalid arguments: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`
            })
          );
        }
      } else if (call.name === "log_weight") {
        const parsed = logWeightArgsSchema.safeParse(call.args);
        if (parsed.success) {
          const proposalId = createId("proposal");
          applyProposals((prev) => ({
            ...prev,
            [proposalId]: { id: proposalId, ...(call.id ? { callId: call.id } : {}), tool: "log_weight", status: "pending", weight: parsed.data }
          }));
          batch.slotByProposalId.set(proposalId, index);
          applyMessages((prev) => [...prev, { id: createId("msg"), kind: "proposal", proposalId }]);
          pendingCount += 1;
        } else {
          batch.responses.set(
            index,
            buildResponsePart(call, {
              ok: false,
              error: `Invalid arguments: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`
            })
          );
        }
      } else if (call.name === "delete_meal") {
        batch.autoFlush = true;
        const parsed = deleteMealArgsSchema.safeParse(call.args);
        const meal = parsed.success
          ? (context.todayMeals.find((item) => item.id === parsed.data.mealId && item.date === parsed.data.date) ??
              context.recentMeals.find((item) => item.id === parsed.data.mealId && item.date === parsed.data.date))
          : undefined;
        if (parsed.success && meal) {
          const proposalId = createId("proposal");
          applyProposals((prev) => ({
            ...prev,
            [proposalId]: {
              id: proposalId,
              ...(call.id ? { callId: call.id } : {}),
              tool: "delete_meal",
              status: "confirming",
              deleteMeal: { date: meal.date, mealId: meal.id, mealType: meal.mealType, foods: meal.foods }
            }
          }));
          batch.slotByProposalId.set(proposalId, index);
          applyMessages((prev) => [...prev, { id: createId("msg"), kind: "proposal", proposalId }]);
          autoExecuteIds.push(proposalId);
        } else if (!parsed.success) {
          batch.responses.set(
            index,
            buildResponsePart(call, {
              ok: false,
              error: `Invalid arguments: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`
            })
          );
        } else {
          batch.responses.set(index, buildResponsePart(call, { ok: false, error: "That meal isn't in your recent data." }));
        }
      } else if (call.name === "delete_weight") {
        batch.autoFlush = true;
        const parsed = deleteWeightArgsSchema.safeParse(call.args);
        const weight = parsed.success
          ? (context.recentWeights.find((entry) => entry.date === parsed.data.date) ??
              (context.currentWeight?.date === parsed.data.date ? context.currentWeight : undefined))
          : undefined;
        if (parsed.success && weight) {
          const proposalId = createId("proposal");
          applyProposals((prev) => ({
            ...prev,
            [proposalId]: {
              id: proposalId,
              ...(call.id ? { callId: call.id } : {}),
              tool: "delete_weight",
              status: "confirming",
              deleteWeight: { date: weight.date, weightKg: weight.weightKg }
            }
          }));
          batch.slotByProposalId.set(proposalId, index);
          applyMessages((prev) => [...prev, { id: createId("msg"), kind: "proposal", proposalId }]);
          autoExecuteIds.push(proposalId);
        } else if (!parsed.success) {
          batch.responses.set(
            index,
            buildResponsePart(call, {
              ok: false,
              error: `Invalid arguments: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`
            })
          );
        } else {
          batch.responses.set(index, buildResponsePart(call, { ok: false, error: "That weight entry isn't in your recent data." }));
        }
      } else if (call.name === "update_goal") {
        const parsed = updateGoalArgsSchema.safeParse(call.args);
        if (parsed.success) {
          const proposalId = createId("proposal");
          const currentGoals = context.goals;
          const weightKg = context.currentWeight?.weightKg ?? context.recentWeights.at(-1)?.weightKg;
          const noMacrosGiven =
            parsed.data.calories === undefined &&
            parsed.data.protein === undefined &&
            parsed.data.carbs === undefined &&
            parsed.data.fat === undefined;
          const goal: CoachGoalProposalData =
            parsed.data.mode !== undefined && noMacrosGiven && context.profile && weightKg !== undefined
              ? computeTargets(context.profile, weightKg, parsed.data.mode)
              : {
                  calories: parsed.data.calories ?? currentGoals.calories,
                  protein: parsed.data.protein ?? currentGoals.protein,
                  carbs: parsed.data.carbs ?? currentGoals.carbs,
                  fat: parsed.data.fat ?? currentGoals.fat,
                  mode: parsed.data.mode ?? currentGoals.mode
                };
          applyProposals((prev) => ({
            ...prev,
            [proposalId]: { id: proposalId, ...(call.id ? { callId: call.id } : {}), tool: "update_goal", status: "pending", goal }
          }));
          batch.slotByProposalId.set(proposalId, index);
          applyMessages((prev) => [...prev, { id: createId("msg"), kind: "proposal", proposalId }]);
          pendingCount += 1;
        } else {
          batch.responses.set(
            index,
            buildResponsePart(call, {
              ok: false,
              error: `Invalid arguments: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`
            })
          );
        }
      } else if (call.name === "web_search") {
        batch.autoFlush = true;
        const parsed = webSearchArgsSchema.safeParse(call.args);
        if (parsed.success) {
          // Auto-executes with no proposal card; the flush waits until the
          // search response lands (responses.size < calls.length until then).
          void (async () => {
            let part: FunctionResponsePart;
            try {
              const answer = await runWebSearch(parsed.data.query);
              part = buildResponsePart(call, { ok: true, answer });
            } catch (searchError) {
              part = buildResponsePart(call, {
                ok: false,
                error: toFriendlyError(searchError, "Web search failed — answer from your own knowledge.")
              });
            }
            if (epoch !== epochRef.current) {
              return;
            }
            batch.responses.set(index, part);
            await maybeFlushBatch(epoch, session);
          })();
        } else {
          batch.responses.set(
            index,
            buildResponsePart(call, {
              ok: false,
              error: `Invalid arguments: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`
            })
          );
        }
      } else {
        batch.responses.set(index, buildResponsePart(call, { ok: false, error: `Unknown tool: ${call.name}` }));
      }
    });

    batchRef.current = batch;

    if (pendingCount > 0 && batch.autoFlush) {
      applyStatus("awaitingConfirmation");
    }

    autoExecuteIds.forEach((proposalId) => {
      void runProposal(proposalId, epoch, session);
    });

    if (batch.slotByProposalId.size === 0) {
      // Every call resolved immediately (validation/unknown-tool failures) — no
      // user action to wait for, flush right away.
      await maybeFlushBatch(epoch, session);
    }

    if (pendingCount > 0 && !batch.autoFlush) {
      // Pure-proposal batch: the pill is on screen and the user can keep chatting. The
      // function responses stay in batchRef and ride along with their next message.
      await finishTurn(epoch, session);
    }
  }

  async function maybeFlushBatch(epoch: number, session: CoachChatSession): Promise<void> {
    const batch = batchRef.current;
    if (!batch || batch.responses.size < batch.calls.length) {
      return;
    }
    batchRef.current = null;
    const parts = batch.calls.map((_, index) => batch.responses.get(index) as FunctionResponsePart);
    roundRef.current += 1;
    applyStatus("waitingForModel");
    try {
      beginStreamingTurn();
      const turn = await session.send(parts, (delta) => handleStreamDelta(delta, epoch));
      if (epoch !== epochRef.current) {
        return;
      }
      await handleTurn(turn, epoch, session);
    } catch (sendError) {
      if (epoch !== epochRef.current) {
        return;
      }
      handleSendError(sendError, true);
    }
  }

  // Marks anything the user never answered as dismissed and drains the notes for sending.
  function harvestPendingOutcomes(): string[] {
    const batch = batchRef.current;
    if (batch && !batch.autoFlush) {
      batch.slotByProposalId.forEach((_slot, proposalId) => {
        const proposal = proposalsRef.current[proposalId];
        if (proposal && proposal.status === "pending") {
          applyProposals((prev) => ({ ...prev, [proposalId]: { ...prev[proposalId], status: "declined" } as CoachProposal }));
          pendingOutcomesRef.current = [
            ...pendingOutcomesRef.current,
            describeProposalOutcome({ ...proposal, status: "declined" } as CoachProposal)
          ];
        }
      });
      batchRef.current = null;
    }
    const outcomes = pendingOutcomesRef.current;
    pendingOutcomesRef.current = [];
    return outcomes;
  }

  async function sendMessage(text: string, image?: { uri: string; base64: string; mimeType: string }): Promise<void> {
    if (statusRef.current !== "idle") {
      return;
    }
    const epoch = epochRef.current;
    const today = toDateKey();
    const now = toClockTime();
    const context = getContext();
    const signature = coachStaticSignature(context, today);
    if (sessionSignatureRef.current !== null && sessionSignatureRef.current !== signature) {
      sessionRef.current = null;
    }
    sessionRef.current ??= createCoachChatSession(context, {
      today,
      now,
      isFirstMessageOfDay: lastActiveDateRef.current !== today,
      history: historyRef.current
    });
    sessionSignatureRef.current = signature;
    lastActiveDateRef.current = today;
    const session = sessionRef.current;
    const trimmed = text.trim();
    const outcomes = harvestPendingOutcomes();
    const prefix =
      outcomes.length > 0
        ? `[What happened to the cards you last proposed — the resulting numbers are already in MY DATA below: ${outcomes.join(" ")}]\n\n`
        : "";
    const dataBlock = buildCoachDataBlock(context, today, now);
    const request: string | (string | Part)[] = image
      ? [`${dataBlock}\n\n${prefix}${trimmed || "Here's a photo of what I ate."}`, { inlineData: { mimeType: image.mimeType, data: image.base64 } }]
      : `${dataBlock}\n\n${prefix}${trimmed}`;
    applyMessages((prev) => [...prev, { id: createId("msg"), kind: "user", text: trimmed, ...(image ? { imageUri: image.uri } : {}) }]);
    roundRef.current = 0;
    setError(null);
    applyStatus("waitingForModel");
    try {
      beginStreamingTurn();
      const turn = await session.send(request, (delta) => handleStreamDelta(delta, epoch));
      if (epoch !== epochRef.current) {
        return;
      }
      await handleTurn(turn, epoch, session);
    } catch (sendError) {
      if (epoch !== epochRef.current) {
        return;
      }
      handleSendError(sendError, false);
    }
  }

  async function runProposal(proposalId: string, epoch: number, session: CoachChatSession): Promise<void> {
    const proposal = proposalsRef.current[proposalId];
    const batch = batchRef.current;
    const slot = batch?.slotByProposalId.get(proposalId);
    const call = slot !== undefined ? batch?.calls[slot] : undefined;
    if (!proposal || !batch || slot === undefined || !call) {
      return;
    }
    applyProposals((prev) => ({ ...prev, [proposalId]: { ...prev[proposalId], status: "confirming" } as CoachProposal }));
    try {
      if (proposal.tool === "log_meal") {
        const result = await addMeal.mutateAsync({
          date: proposal.meal.date,
          mealType: proposal.meal.mealType,
          foods: proposal.meal.foods,
          source: "text",
          notes: proposal.meal.notes
        });
        if (epoch !== epochRef.current) {
          return;
        }
        batch.responses.set(
          slot,
          buildResponsePart(call, {
            ok: true,
            logged: { ...proposal.meal, totals: buildMealTotals(proposal.meal.foods) },
            queuedOffline: Boolean(result.pending)
          })
        );
      } else if (proposal.tool === "log_weight") {
        const result = await saveWeight.mutateAsync({
          date: proposal.weight.date,
          weightKg: proposal.weight.weightKg
        });
        if (epoch !== epochRef.current) {
          return;
        }
        batch.responses.set(
          slot,
          buildResponsePart(call, {
            ok: true,
            logged: proposal.weight,
            queuedOffline: Boolean(result.pending)
          })
        );
      } else if (proposal.tool === "delete_meal") {
        await deleteMealEntry.mutateAsync({ date: proposal.deleteMeal.date, mealId: proposal.deleteMeal.mealId });
        if (epoch !== epochRef.current) {
          return;
        }
        batch.responses.set(
          slot,
          buildResponsePart(call, {
            ok: true,
            deleted: { date: proposal.deleteMeal.date, mealType: proposal.deleteMeal.mealType, foods: proposal.deleteMeal.foods }
          })
        );
      } else if (proposal.tool === "delete_weight") {
        await deleteWeight.mutateAsync({ date: proposal.deleteWeight.date });
        if (epoch !== epochRef.current) {
          return;
        }
        batch.responses.set(
          slot,
          buildResponsePart(call, {
            ok: true,
            deleted: { date: proposal.deleteWeight.date, weightKg: proposal.deleteWeight.weightKg }
          })
        );
      } else {
        await updateGoals.mutateAsync({ ...proposal.goal });
        if (epoch !== epochRef.current) {
          return;
        }
        batch.responses.set(
          slot,
          buildResponsePart(call, {
            ok: true,
            goal: proposal.goal
          })
        );
      }
      applyProposals((prev) => ({ ...prev, [proposalId]: { ...prev[proposalId], status: "confirmed" } as CoachProposal }));
    } catch (writeError) {
      if (epoch !== epochRef.current) {
        return;
      }
      applyProposals((prev) => ({ ...prev, [proposalId]: { ...prev[proposalId], status: "failed" } as CoachProposal }));
      const isDelete = proposal.tool === "delete_meal" || proposal.tool === "delete_weight";
      const friendly = toFriendlyError(writeError, isDelete ? "Deleting failed. Please try again." : "Saving failed. Please try again.");
      applyMessages((prev) => [...prev, { id: createId("msg"), kind: "error", text: friendly }]);
      batch.responses.set(slot, buildResponsePart(call, { ok: false, error: friendly }));
    }
    if (batch.autoFlush) {
      await maybeFlushBatch(epoch, session);
      return;
    }
    const resolved = proposalsRef.current[proposalId];
    if (resolved) {
      pendingOutcomesRef.current = [...pendingOutcomesRef.current, describeProposalOutcome(resolved)];
    }
    // A pure-proposal batch triggers no model turn, so nothing else will persist the
    // resolved pill — without this, a kill before the next message would restore a
    // meal that really was logged as a dismissed suggestion.
    persistSnapshot();
  }

  async function confirmProposal(proposalId: string): Promise<void> {
    const proposal = proposalsRef.current[proposalId];
    const session = sessionRef.current;
    if (!proposal || proposal.status !== "pending" || !session) {
      return;
    }
    await runProposal(proposalId, epochRef.current, session);
  }

  async function cancelProposal(proposalId: string): Promise<void> {
    const proposal = proposalsRef.current[proposalId];
    const batch = batchRef.current;
    const session = sessionRef.current;
    const slot = batch?.slotByProposalId.get(proposalId);
    const call = slot !== undefined ? batch?.calls[slot] : undefined;
    if (!proposal || proposal.status !== "pending" || !batch || !session || slot === undefined || !call) {
      return;
    }
    const epoch = epochRef.current;
    applyProposals((prev) => ({ ...prev, [proposalId]: { ...prev[proposalId], status: "declined" } as CoachProposal }));
    batch.responses.set(
      slot,
      buildResponsePart(call, { ok: false, declined: true, reason: "The user declined this action." })
    );
    if (batch.autoFlush) {
      await maybeFlushBatch(epoch, session);
      return;
    }
    pendingOutcomesRef.current = [...pendingOutcomesRef.current, describeProposalOutcome(proposalsRef.current[proposalId] as CoachProposal)];
    persistSnapshot();
  }

  function resetChat(): void {
    epochRef.current += 1;
    sessionRef.current = null;
    sessionSignatureRef.current = null;
    // lastActiveDateRef intentionally survives a reset: the daily briefing is once per day, not once per chat.
    historyRef.current = [];
    batchRef.current = null;
    roundRef.current = 0;
    pendingOutcomesRef.current = [];
    streamMsgIdRef.current = null;
    streamRawTextRef.current = "";
    applyMessages(() => []);
    applyProposals(() => ({}));
    setError(null);
    applyStatus("idle");
    if (uid) {
      void clearCoachChat(uid);
    }
  }

  return { messages, proposals, status, error, sendMessage, confirmProposal, cancelProposal, resetChat };
}
