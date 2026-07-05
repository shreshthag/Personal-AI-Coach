import { ActivityIndicator, View } from "react-native";

import type { CoachProposal } from "../models/gemini";
import { formatFriendlyDate } from "../utils/date";
import { formatCalories, formatMacro, formatWeight } from "../utils/format";
import { buildMealTotals } from "../utils/nutrition";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { Card } from "./Card";

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

  const date =
    proposal.tool === "log_meal"
      ? proposal.meal.date
      : proposal.tool === "log_weight"
        ? proposal.weight.date
        : proposal.tool === "delete_meal"
          ? proposal.deleteMeal.date
          : proposal.tool === "delete_weight"
            ? proposal.deleteWeight.date
            : null;
  const mealType =
    proposal.tool === "log_meal" ? proposal.meal.mealType : proposal.tool === "delete_meal" ? proposal.deleteMeal.mealType : null;
  const foods =
    proposal.tool === "log_meal" ? proposal.meal.foods : proposal.tool === "delete_meal" ? proposal.deleteMeal.foods : null;
  const weightKg =
    proposal.tool === "log_weight" ? proposal.weight.weightKg : proposal.tool === "delete_weight" ? proposal.deleteWeight.weightKg : null;
  const goal = proposal.tool === "update_goal" ? proposal.goal : null;

  return (
    <Card
      className={
        isDelete
          ? "gap-3 border-clay/40 bg-orange-50 dark:border-clay/50 dark:bg-zinc-900"
          : "gap-3 border-leaf/30 bg-mint dark:border-zinc-700 dark:bg-zinc-900"
      }
    >
      <View className="gap-1">
        <AppText variant="label">
          {proposal.tool === "log_meal"
            ? "Log this meal?"
            : proposal.tool === "log_weight"
              ? "Save this weight?"
              : proposal.tool === "delete_meal"
                ? "Deleting meal…"
                : proposal.tool === "delete_weight"
                  ? "Deleting weight…"
                  : "Update your goal?"}
        </AppText>
        {date ? (
          <AppText variant="caption">
            {mealType ? `${capitalize(mealType)} · ${formatFriendlyDate(date)}` : formatFriendlyDate(date)}
          </AppText>
        ) : null}
      </View>

      {foods ? (
        <View className="gap-2">
          {foods.map((food, index) => (
            <View key={`${food.name}-${index}`} className="gap-1">
              <View className="flex-row justify-between gap-3">
                <View className="flex-1">
                  <AppText variant="label">{food.name}</AppText>
                  <AppText variant="caption">{food.quantity}</AppText>
                </View>
                <AppText variant="label">{formatCalories(food.calories)}</AppText>
              </View>
              <AppText variant="caption">
                P {formatMacro(food.protein)} · C {formatMacro(food.carbs)} · F {formatMacro(food.fat)}
              </AppText>
            </View>
          ))}
          {(() => {
            const totals = buildMealTotals(foods);
            return (
              <View className="gap-1 border-t border-leaf/20 pt-2 dark:border-zinc-700">
                <View className="flex-row justify-between gap-3">
                  <AppText variant="label">Total</AppText>
                  <AppText variant="label">{formatCalories(totals.totalCalories)}</AppText>
                </View>
                <AppText variant="caption">
                  P {formatMacro(totals.totalProtein)} · C {formatMacro(totals.totalCarbs)} · F {formatMacro(totals.totalFat)}
                </AppText>
              </View>
            );
          })()}
        </View>
      ) : goal ? (
        <View className="gap-1">
          <View className="flex-row justify-between gap-3">
            <AppText variant="label">Calories</AppText>
            <AppText variant="label">{formatCalories(goal.calories)}</AppText>
          </View>
          <AppText variant="caption">
            P {formatMacro(goal.protein)} · C {formatMacro(goal.carbs)} · F {formatMacro(goal.fat)}
          </AppText>
          <AppText variant="caption">Mode: {goal.mode}</AppText>
        </View>
      ) : (
        <AppText variant="subtitle">{formatWeight(weightKg)}</AppText>
      )}

      {actionable ? (
        <View className="flex-row gap-3">
          <Button
            title="Cancel"
            variant="ghost"
            className="flex-1"
            disabled={proposal.status === "confirming"}
            onPress={onCancel}
            accessibilityLabel="Cancel this coach suggestion"
          />
          <Button
            title="Confirm"
            variant="primary"
            className="flex-1"
            loading={proposal.status === "confirming"}
            onPress={onConfirm}
            accessibilityLabel="Confirm and log this coach suggestion"
          />
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
        <AppText variant="caption">Cancelled</AppText>
      ) : (
        <AppText variant="caption" className="text-red-700 dark:text-red-400">
          Failed to save
        </AppText>
      )}
    </Card>
  );
}
