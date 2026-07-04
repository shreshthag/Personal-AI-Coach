import { View } from "react-native";
import { useState, useCallback } from "react";

import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { MealCard } from "../components/MealCard";
import { Notice } from "../components/Notice";
import { ScreenShell } from "../components/ScreenShell";
import { LoadingState } from "../components/LoadingState";
import { useDailyMeals, useDeleteMeal } from "../hooks/useDailyMeals";
import { useAppStore } from "../store/appStore";
import { addDays, formatFriendlyDate, toDateKey } from "../utils/date";

export function MealHistoryScreen() {
  const date = useAppStore((state) => state.selectedDate);
  const setDate = useAppStore((state) => state.setSelectedDate);
  const meals = useDailyMeals(date);
  const deleteMeal = useDeleteMeal(date);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await meals.refetch();
    setRefreshing(false);
  }, [meals]);

  return (
    <ScreenShell refreshing={refreshing} onRefresh={onRefresh}>
      <View className="gap-1" accessibilityRole="header">
        <AppText variant="title">Meal history</AppText>
        <AppText variant="caption">Review and remove logged meals by day.</AppText>
      </View>

      <View className="flex-row items-center justify-between gap-3" accessibilityLabel="Select date navigation">
        <Button
          title="Prev"
          variant="ghost"
          className="flex-1"
          onPress={() => setDate(addDays(date, -1))}
          accessibilityLabel="Go to previous day"
        />
        <View className="flex-1 items-center" accessibilityLabel={`Current view: ${formatFriendlyDate(date)}`}>
          <AppText variant="label">{formatFriendlyDate(date)}</AppText>
        </View>
        <Button
          title="Next"
          variant="ghost"
          className="flex-1"
          disabled={date >= toDateKey()}
          onPress={() => setDate(addDays(date, 1))}
          accessibilityLabel="Go to next day"
        />
      </View>

      {meals.isFetching && meals.data.length === 0 ? (
        <LoadingState label="Loading history..." />
      ) : meals.data.length === 0 ? (
        <Notice title="No meals logged" message="Meals you save for this day will appear here." />
      ) : (
        meals.data.map((meal) => (
          <MealCard key={meal.id} meal={meal} onDelete={(mealId) => deleteMeal.mutate(mealId)} />
        ))
      )}

      {meals.error ? (
        <Notice tone="error" title="History not refreshed" message="Could not refresh Firestore data. Cached meals are shown when available." />
      ) : null}
    </ScreenShell>
  );
}

