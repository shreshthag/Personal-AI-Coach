import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { View } from "react-native";

import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { MetricCard } from "../components/MetricCard";
import { ScreenShell } from "../components/ScreenShell";
import { useWeeklySummary } from "../hooks/useWeeklySummary";
import type { RootStackParamList } from "../types/navigation";
import { formatShortDate, toDateKey } from "../utils/date";
import { formatCalories, formatMacro } from "../utils/format";

type WeeklySummaryScreenProps = NativeStackScreenProps<RootStackParamList, "WeeklySummary">;

export function WeeklySummaryScreen({ navigation }: WeeklySummaryScreenProps) {
  const today = toDateKey();
  const weekly = useWeeklySummary(today);
  const summary = weekly.data;

  return (
    <ScreenShell>
      <View className="flex-row items-center justify-between" accessibilityRole="header">
        <View>
          <AppText variant="title">Weekly summary</AppText>
          <AppText variant="caption">
            {formatShortDate(summary.startDate)} to {formatShortDate(summary.endDate)}
          </AppText>
        </View>
        <Button
          title="Done"
          variant="ghost"
          className="min-h-10 px-3"
          onPress={() => navigation.goBack()}
          accessibilityLabel="Close weekly summary modal screen"
        />
      </View>

      <View className="flex-row gap-3" accessibilityLabel="Macro averages summary">
        <MetricCard label="Avg calories" value={formatCalories(summary.averageCalories)} />
        <MetricCard label="Avg protein" value={formatMacro(summary.averageProtein)} />
      </View>
      <View className="flex-row gap-3">
        <MetricCard label="Avg carbs" value={formatMacro(summary.averageCarbs)} />
        <MetricCard label="Avg fat" value={formatMacro(summary.averageFat)} />
      </View>

      <Card className="gap-3" accessibilityLabel="Weekly trends and metrics summary">
        <AppText variant="subtitle">Trends</AppText>
        <View className="flex-row justify-between" accessibilityLabel={`Tracked days: ${summary.daysTracked} of 7`}>
          <AppText variant="caption">Days tracked</AppText>
          <AppText variant="label">{summary.daysTracked}/7</AppText>
        </View>
        <View className="flex-row justify-between" accessibilityLabel={`Goal adherence: ${summary.goalAdherencePercent} percent`}>
          <AppText variant="caption">Goal adherence</AppText>
          <AppText variant="label">{summary.goalAdherencePercent}%</AppText>
        </View>
        <View className="flex-row justify-between" accessibilityLabel={`Weight trend: ${summary.weightTrendKg === null ? "Not enough data" : `${summary.weightTrendKg.toFixed(1)} kilograms`}`}>
          <AppText variant="caption">Weight trend</AppText>
          <AppText variant="label">
            {summary.weightTrendKg === null ? "Not enough data" : `${summary.weightTrendKg.toFixed(1)} kg`}
          </AppText>
        </View>
      </Card>
    </ScreenShell>
  );
}
