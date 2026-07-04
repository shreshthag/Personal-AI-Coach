import { View } from "react-native";

import type { DailySummary, Goals } from "../models/nutrition";
import { clampPercent, formatCalories, formatMacro } from "../utils/format";
import { AppText } from "./AppText";
import { Card } from "./Card";

type MacroSummaryProps = {
  summary: DailySummary;
  goals: Goals;
};

function ProgressLine({ label, value, target, unit }: { label: string; value: number; target: number; unit: "cal" | "g" }) {
  const percent = clampPercent(value, target);
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <AppText variant="caption">{label}</AppText>
        <AppText variant="caption">
          {unit === "cal" ? formatCalories(value) : formatMacro(value)} / {unit === "cal" ? formatCalories(target) : formatMacro(target)}
        </AppText>
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <View className="h-2 rounded-full bg-leaf" style={{ width: `${percent}%` }} />
      </View>
    </View>
  );
}

export function MacroSummary({ summary, goals }: MacroSummaryProps) {
  return (
    <Card className="gap-4">
      <View className="flex-row items-start justify-between">
        <View>
          <AppText variant="caption">Today</AppText>
          <AppText variant="title">{formatCalories(summary.calories)}</AppText>
        </View>
        <View className="items-end">
          <AppText variant="caption">Remaining</AppText>
          <AppText variant="subtitle">{formatCalories(summary.caloriesRemaining)}</AppText>
        </View>
      </View>

      <ProgressLine label="Calories" value={summary.calories} target={goals.calories} unit="cal" />
      <ProgressLine label="Protein" value={summary.protein} target={goals.protein} unit="g" />
      <ProgressLine label="Carbs" value={summary.carbs} target={goals.carbs} unit="g" />
      <ProgressLine label="Fat" value={summary.fat} target={goals.fat} unit="g" />
    </Card>
  );
}
