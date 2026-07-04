import { View } from "react-native";

import { mealTypeLabels } from "../constants/defaults";
import type { Meal } from "../models/nutrition";
import { formatCalories, formatMacro } from "../utils/format";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { Card } from "./Card";

type MealCardProps = {
  meal: Meal;
  onDelete?: (mealId: string) => void;
};

export function MealCard({ meal, onDelete }: MealCardProps) {
  return (
    <Card className="gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <AppText variant="label">
            {mealTypeLabels[meal.mealType]} {meal.pending ? "(syncing)" : ""}
          </AppText>
          <AppText variant="subtitle">{formatCalories(meal.totalCalories)}</AppText>
          <AppText variant="caption">
            P {formatMacro(meal.totalProtein)} · C {formatMacro(meal.totalCarbs)} · F {formatMacro(meal.totalFat)}
          </AppText>
        </View>
        {onDelete ? (
          <Button title="Delete" variant="ghost" className="min-h-10 px-3" onPress={() => onDelete(meal.id)} />
        ) : null}
      </View>

      <View className="gap-2">
        {meal.foods.map((food, index) => (
          <View key={`${food.name}-${index}`} className="flex-row justify-between gap-3">
            <AppText variant="body" className="flex-1">
              {food.name}
            </AppText>
            <AppText variant="caption">{food.quantity}</AppText>
          </View>
        ))}
      </View>

      {meal.notes ? <AppText variant="caption">{meal.notes}</AppText> : null}
    </Card>
  );
}
