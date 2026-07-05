import type { CompositeNavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Pressable, View } from "react-native";
import { useState, useCallback } from "react";

import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { MacroSummary } from "../components/MacroSummary";
import { MetricCard } from "../components/MetricCard";
import { Notice } from "../components/Notice";
import { ScreenShell } from "../components/ScreenShell";
import { useDailyMeals } from "../hooks/useDailyMeals";
import { useGoals } from "../hooks/useGoals";
import { useWeightSummary } from "../hooks/useWeight";
import { useWeeklySummary } from "../hooks/useWeeklySummary";
import type { AppTabParamList, RootStackParamList } from "../types/navigation";
import { toDateKey } from "../utils/date";
import { formatCalories, formatMacro, formatWeight } from "../utils/format";
import { buildDailySummary } from "../utils/nutrition";

type DashboardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<AppTabParamList, "Dashboard">,
  NativeStackNavigationProp<RootStackParamList>
>;

export function DashboardScreen() {
  const navigation = useNavigation<DashboardNavigation>();
  const today = toDateKey();
  const goals = useGoals();
  const meals = useDailyMeals(today);
  const weights = useWeightSummary(today);
  const weekly = useWeeklySummary(today);
  const summary = buildDailySummary(today, meals.data ?? [], goals.data);

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        goals.refetch(),
        meals.refetch(),
        weights.refetch(),
        weekly.refetch()
      ]);
    } catch (error) {
      console.warn("Refresh failed (likely offline):", error);
    } finally {
      setRefreshing(false);
    }
  }, [goals, meals, weights, weekly]);

  return (
    <ScreenShell refreshing={refreshing} onRefresh={onRefresh}>
      <View className="flex-row items-center justify-between" accessibilityRole="header">
        <View className="gap-1">
          <AppText variant="title">Dashboard</AppText>
          <AppText variant="caption">Today’s nutrition and weight snapshot</AppText>
        </View>
        <Pressable
          onPress={() => navigation.navigate("Goals")}
          className="rounded-full border border-leaf/30 bg-mint px-3 py-1.5 dark:bg-zinc-900"
          accessibilityLabel="Current goal mode — open goals"
        >
          <AppText variant="caption">
            {goals.data.mode.charAt(0).toUpperCase() + goals.data.mode.slice(1)}
          </AppText>
        </Pressable>
      </View>

      <MacroSummary summary={summary} goals={goals.data} />

      <View className="flex-row gap-3">
        <MetricCard label="Protein" value={formatMacro(summary.protein)} detail={`${formatMacro(summary.proteinRemaining)} remaining`} />
        <MetricCard label="Carbs" value={formatMacro(summary.carbs)} detail={`${formatMacro(summary.carbsRemaining)} remaining`} />
      </View>

      <View className="flex-row gap-3">
        <MetricCard label="Fat" value={formatMacro(summary.fat)} detail={`${formatMacro(summary.fatRemaining)} remaining`} />
        <MetricCard label="Weight" value={formatWeight(weights.summary.todayWeightKg)} detail="Today" />
      </View>

      <Card className="gap-3" accessibilityLabel="Quick Actions">
        <AppText variant="subtitle">Quick actions</AppText>
        <View className="flex-row gap-3">
          <Button
            title="Add Meal"
            className="flex-1"
            onPress={() => navigation.navigate("LogMeal", { mode: "text" })}
            accessibilityLabel="Quick add a text-based meal log"
          />
          <Button
            title="Upload Photo"
            variant="secondary"
            className="flex-1"
            onPress={() => navigation.navigate("LogMeal")}
            accessibilityLabel="Log a meal by uploading a photo"
          />
        </View>
        <View className="flex-row gap-3">
          <Button
            title="Goals"
            variant="ghost"
            className="flex-1"
            onPress={() => navigation.navigate("Goals")}
            accessibilityLabel="Edit daily nutrition targets and goals"
          />
          <Button
            title="Weekly"
            variant="ghost"
            className="flex-1"
            onPress={() => navigation.navigate("WeeklySummary")}
            accessibilityLabel="View weekly nutrition and weight summary"
          />
        </View>
      </Card>

      <Card className="gap-2" accessibilityLabel="Weekly Progress Summary">
        <AppText variant="subtitle">Weekly progress</AppText>
        <View className="flex-row justify-between" accessibilityLabel={`Average calories: ${formatCalories(weekly.data.averageCalories)}`}>
          <AppText variant="caption">Average calories</AppText>
          <AppText variant="label">{formatCalories(weekly.data.averageCalories)}</AppText>
        </View>
        <View className="flex-row justify-between" accessibilityLabel={`Goal adherence: ${weekly.data.goalAdherencePercent} percent`}>
          <AppText variant="caption">Goal adherence</AppText>
          <AppText variant="label">{weekly.data.goalAdherencePercent}%</AppText>
        </View>
        <View className="flex-row justify-between" accessibilityLabel={`Weight trend: ${weekly.data.weightTrendKg === null ? "Not enough data" : `${weekly.data.weightTrendKg.toFixed(1)} kilograms`}`}>
          <AppText variant="caption">Weight trend</AppText>
          <AppText variant="label">
            {weekly.data.weightTrendKg === null ? "Not enough data" : `${weekly.data.weightTrendKg.toFixed(1)} kg`}
          </AppText>
        </View>
      </Card>

      {meals.error ? (
        <Notice tone="error" title="Meals not refreshed" message="Showing cached data if available. Pull this screen again once your connection is stable." />
      ) : null}
    </ScreenShell>
  );
}

