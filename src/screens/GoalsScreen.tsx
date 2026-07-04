import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { View } from "react-native";

import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Notice } from "../components/Notice";
import { ScreenShell } from "../components/ScreenShell";
import { TextField } from "../components/TextField";
import { useGoals, useUpdateGoals } from "../hooks/useGoals";
import type { Goals } from "../models/nutrition";
import type { RootStackParamList } from "../types/navigation";
import { toFriendlyError } from "../utils/errors";

type GoalsScreenProps = NativeStackScreenProps<RootStackParamList, "Goals">;

type GoalsFormValues = Record<keyof Pick<Goals, "calories" | "protein" | "carbs" | "fat">, string>;

export function GoalsScreen({ navigation }: GoalsScreenProps) {
  const goals = useGoals();
  const updateGoals = useUpdateGoals();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, reset } = useForm<GoalsFormValues>({
    defaultValues: {
      calories: String(goals.data.calories),
      protein: String(goals.data.protein),
      carbs: String(goals.data.carbs),
      fat: String(goals.data.fat)
    }
  });

  useEffect(() => {
    reset({
      calories: String(goals.data.calories),
      protein: String(goals.data.protein),
      carbs: String(goals.data.carbs),
      fat: String(goals.data.fat)
    });
  }, [goals.data, reset]);

  async function submit(values: GoalsFormValues) {
    const nextGoals: Goals = {
      calories: Number(values.calories),
      protein: Number(values.protein),
      carbs: Number(values.carbs),
      fat: Number(values.fat)
    };

    setError(null);
    setMessage(null);
    try {
      await updateGoals.mutateAsync(nextGoals);
      setMessage("Goals saved.");
    } catch (saveError) {
      setError(toFriendlyError(saveError, "Could not save goals. Please retry."));
    }
  }

  return (
    <ScreenShell>
      <View className="flex-row items-center justify-between" accessibilityRole="header">
        <View>
          <AppText variant="title">Goals</AppText>
          <AppText variant="caption">Set your daily nutrition targets.</AppText>
        </View>
        <Button
          title="Done"
          variant="ghost"
          className="min-h-10 px-3"
          onPress={() => navigation.goBack()}
          accessibilityLabel="Close goals modal screen"
        />
      </View>

      <Card className="gap-4" accessibilityLabel="Daily targets form">
        {(["calories", "protein", "carbs", "fat"] as const).map((name) => (
          <Controller
            key={name}
            control={control}
            name={name}
            rules={{
              required: `${name[0]?.toUpperCase()}${name.slice(1)} is required`,
              validate: {
                positiveNumber: (v) => {
                  const n = Number(v);
                  return (Number.isFinite(n) && n > 0) || "Enter a valid positive number.";
                }
              }
            }}
            render={({ field: { onChange, value }, fieldState: { error: fieldError } }) => (
              <TextField
                label={name === "calories" ? "Calories" : `${name[0]?.toUpperCase()}${name.slice(1)} grams`}
                keyboardType="number-pad"
                value={value}
                onChangeText={onChange}
                error={fieldError?.message}
                accessibilityLabel={`${name} goal field`}
              />
            )}
          />
        ))}
        <Button
          title="Save goals"
          loading={updateGoals.isPending}
          onPress={handleSubmit(submit)}
          accessibilityLabel="Save daily nutrition goals"
        />
      </Card>

      {message ? <Notice tone="success" title="Saved" message={message} /> : null}
      {error ? <Notice tone="error" title="Goal issue" message={error} /> : null}
    </ScreenShell>
  );
}

