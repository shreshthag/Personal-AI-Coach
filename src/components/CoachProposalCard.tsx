import { ActivityIndicator, Pressable, View } from "react-native";

import type { CoachProposal } from "../models/gemini";
import { formatCalories, formatWeight } from "../utils/format";
import { buildMealTotals } from "../utils/nutrition";
import { AppText } from "./AppText";

type CoachProposalCardProps = {
  proposal: CoachProposal;
  onConfirm: () => void;
  onCancel: () => void;
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function CoachProposalCard({ proposal, onConfirm, onCancel }: CoachProposalCardProps) {
  const isDelete = proposal.tool === "delete_meal" || proposal.tool === "delete_weight";
  const actionable = !isDelete && (proposal.status === "pending" || proposal.status === "confirming");

  const emoji =
    proposal.tool === "log_meal"
      ? "🍽"
      : proposal.tool === "log_weight"
        ? "⚖️"
        : proposal.tool === "update_goal"
          ? "🎯"
          : "🗑";

  let summary: string;
  if (proposal.tool === "log_meal") {
    const { mealType, foods } = proposal.meal;
    const totals = buildMealTotals(foods);
    summary = `${capitalize(mealType)} · ${foods.length === 1 ? foods[0]!.name : `${foods.length} items`} · ${formatCalories(totals.totalCalories)}`;
  } else if (proposal.tool === "log_weight") {
    summary = `Weight · ${formatWeight(proposal.weight.weightKg)}`;
  } else if (proposal.tool === "update_goal") {
    summary = `Goal · ${formatCalories(proposal.goal.calories)} · ${proposal.goal.mode}`;
  } else if (proposal.tool === "delete_meal") {
    const { mealType, foods } = proposal.deleteMeal;
    summary = `Deleting · ${capitalize(mealType)} · ${foods.length === 1 ? foods[0]!.name : `${foods.length} items`}`;
  } else {
    summary = `Deleting · ${formatWeight(proposal.deleteWeight.weightKg)}`;
  }

  return (
    <View
      className={
        isDelete
          ? "flex-row items-center self-start max-w-full rounded-full border border-clay/40 bg-orange-50 px-3 py-2 gap-2 shadow-sm dark:border-clay/50 dark:bg-zinc-900"
          : "flex-row items-center self-start max-w-full rounded-full border border-leaf/30 bg-mint px-3 py-2 gap-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
      }
    >
      <AppText variant="body">{emoji}</AppText>
      <View className="flex-1">
        <AppText variant="caption" numberOfLines={1}>
          {summary}
        </AppText>
      </View>

      {actionable ? (
        <View className="flex-row items-center gap-2">
          <Pressable
            className="h-8 w-8 items-center justify-center rounded-full bg-white/70 disabled:opacity-55 dark:bg-zinc-800"
            disabled={proposal.status === "confirming"}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel this coach suggestion"
          >
            <AppText variant="label">✕</AppText>
          </Pressable>
          <Pressable
            className="h-8 w-8 items-center justify-center rounded-full bg-leaf disabled:opacity-55"
            disabled={proposal.status === "confirming"}
            onPress={onConfirm}
            accessibilityRole="button"
            accessibilityLabel="Confirm and log this coach suggestion"
          >
            <AppText variant="label" className="text-white">
              ✓
            </AppText>
          </Pressable>
        </View>
      ) : isDelete ? (
        proposal.status === "confirming" ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator size="small" color="#D56A3A" />
            <AppText variant="caption">Deleting…</AppText>
          </View>
        ) : proposal.status === "confirmed" ? (
          <AppText variant="caption" className="text-clay">
            Deleted ✓
          </AppText>
        ) : (
          <AppText variant="caption" className="text-red-700 dark:text-red-400">
            Couldn&apos;t delete
          </AppText>
        )
      ) : proposal.status === "confirmed" ? (
        <AppText variant="caption" className="text-leaf">
          {proposal.tool === "update_goal" ? "Goal updated ✓" : "Logged ✓"}
        </AppText>
      ) : proposal.status === "declined" ? (
        <AppText variant="caption">Dismissed</AppText>
      ) : (
        <AppText variant="caption" className="text-red-700 dark:text-red-400">
          Failed to save
        </AppText>
      )}
    </View>
  );
}
