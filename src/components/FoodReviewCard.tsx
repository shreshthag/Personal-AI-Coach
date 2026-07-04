import { View } from "react-native";

import type { FoodItem } from "../models/nutrition";
import { formatCalories, formatMacro } from "../utils/format";
import { AppText } from "./AppText";
import { Card } from "./Card";

type FoodReviewCardProps = {
  foods: FoodItem[];
};

export function FoodReviewCard({ foods }: FoodReviewCardProps) {
  return (
    <Card className="gap-3">
      <AppText variant="subtitle">AI estimate</AppText>
      {foods.map((food, index) => (
        <View key={`${food.name}-${index}`} className="gap-1 border-b border-zinc-100 pb-3 last:border-b-0 last:pb-0 dark:border-zinc-800">
          <View className="flex-row justify-between gap-3">
            <View className="flex-1">
              <AppText variant="label">{food.name}</AppText>
              <AppText variant="caption">{food.quantity}</AppText>
            </View>
            <AppText variant="label">{formatCalories(food.calories)}</AppText>
          </View>
          <AppText variant="caption">
            P {formatMacro(food.protein)} · C {formatMacro(food.carbs)} · F {formatMacro(food.fat)} · {Math.round(food.confidence * 100)}%
          </AppText>
        </View>
      ))}
    </Card>
  );
}
