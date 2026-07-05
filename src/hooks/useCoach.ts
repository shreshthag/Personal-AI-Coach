import { useEffect, useRef, useState } from "react";
import type { Content, FunctionResponsePart } from "firebase/ai";

import type { CoachChatMessage, CoachContext, CoachGoalProposalData, CoachProposal, CoachTurn } from "../models/gemini";
import { clearCoachChat, readCoachChat, saveCoachChat } from "../services/cache/coachChatCache";
import { createCoachChatSession, runWebSearch, type CoachChatSession } from "../services/gemini/coachChat";
import {
  deleteMealArgsSchema,
  deleteWeightArgsSchema,
  logMealArgsSchema,
  logWeightArgsSchema,
  updateGoalArgsSchema,
  webSearchArgsSchema
} from "../services/gemini/schemas";
import { toDateKey } from "../utils/date";
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
  // Bumped by resetChat; async continuations capture the epoch at start and
  // bail if it changed, so a mid-flight reset can never resurrect stale state.
  const epochRef = useRef(0);
  const roundRef = useRef(0);
  const batchRef = useRef<PendingBatch | null>(null);

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
      historyRef.current = snapshot.history;
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
      history: historyRef.current
    });
  }

  function appendCoachText(text: string): void {
    if (text) {
      applyMessages((prev) => [...prev, { id: createId("msg"), kind: "coach", text }]);
    }
  }

  function handleSendError(sendError: unknown, wasFlush: boolean): void {
    const friendly = toFriendlyError(sendError, "The coach could not respond. Please retry.");
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
    appendCoachText(turn.text);

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
        const closing = await session.send(parts);
        if (epoch !== epochRef.current) {
          return;
        }
        appendCoachText(closing.text);
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
      slotByProposalId: new Map()
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
        const parsed = deleteMealArgsSchema.safeParse(call.args);
        const meal = parsed.success
          ? (context.todayMeals.find((item) => item.id === parsed.data.mealId && item.date === parsed.data.date) ??
              context.last7Days.find((item) => item.id === parsed.data.mealId && item.date === parsed.data.date))
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

    if (pendingCount > 0) {
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
      const turn = await session.send(parts);
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

  async function sendMessage(text: string): Promise<void> {
    if (statusRef.current !== "idle") {
      return;
    }
    const epoch = epochRef.current;
    sessionRef.current ??= createCoachChatSession(getContext(), toDateKey(), historyRef.current);
    const session = sessionRef.current;
    applyMessages((prev) => [...prev, { id: createId("msg"), kind: "user", text }]);
    roundRef.current = 0;
    setError(null);
    applyStatus("waitingForModel");
    try {
      const turn = await session.send(text);
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
    await maybeFlushBatch(epoch, session);
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
    await maybeFlushBatch(epoch, session);
  }

  function resetChat(): void {
    epochRef.current += 1;
    sessionRef.current = null;
    historyRef.current = [];
    batchRef.current = null;
    roundRef.current = 0;
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
