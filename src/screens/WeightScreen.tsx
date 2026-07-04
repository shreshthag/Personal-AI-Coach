import { Controller, useForm } from "react-hook-form";
import { View } from "react-native";
import { useState, useCallback } from "react";

import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { MetricCard } from "../components/MetricCard";
import { Notice } from "../components/Notice";
import { ScreenShell } from "../components/ScreenShell";
import { TextField } from "../components/TextField";
import { LoadingState } from "../components/LoadingState";
import { useSaveWeight, useWeightSummary, useWeights } from "../hooks/useWeight";
import { toDateKey } from "../utils/date";
import { toFriendlyError } from "../utils/errors";
import { formatWeight } from "../utils/format";

type WeightFormValues = {
  weightKg: string;
};

export function WeightScreen() {
  const today = toDateKey();
  const weights = useWeights(today);
  const { summary } = useWeightSummary(today);
  const saveWeight = useSaveWeight();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, reset } = useForm<WeightFormValues>({
    defaultValues: {
      weightKg: ""
    }
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await weights.refetch();
    setRefreshing(false);
  }, [weights]);

  async function submit(values: WeightFormValues) {
    const weightKg = Number(values.weightKg);
    setError(null);
    setMessage(null);
    try {
      const saved = await saveWeight.mutateAsync({ date: today, weightKg });
      setMessage(saved.pending ? "Saved offline. It will sync automatically." : "Weight saved.");
      reset({ weightKg: "" });
    } catch (saveError) {
      setError(toFriendlyError(saveError, "Could not save weight. Please retry."));
    }
  }

  return (
    <ScreenShell refreshing={refreshing} onRefresh={onRefresh}>
      <View className="gap-1" accessibilityRole="header">
        <AppText variant="title">Weight</AppText>
        <AppText variant="caption">Track today’s weight and your 7-day trend.</AppText>
      </View>

      <View className="flex-row gap-3" accessibilityLabel="Weight Metrics Summary">
        <MetricCard label="Today" value={formatWeight(summary.todayWeightKg)} />
        <MetricCard label="7-day avg" value={formatWeight(summary.sevenDayAverageKg)} />
      </View>

      <Card className="gap-3" accessibilityLabel="Log Weight Form">
        <AppText variant="subtitle">Log today</AppText>
        <Controller
          control={control}
          name="weightKg"
          rules={{
            required: "Weight is required",
            validate: {
              positiveNumber: (v) => {
                const n = Number(v);
                return (Number.isFinite(n) && n > 0) || "Enter a valid positive weight in kilograms.";
              }
            }
          }}
          render={({ field: { onChange, value }, fieldState: { error: fieldError } }) => (
            <TextField
              label="Weight in kg"
              keyboardType="decimal-pad"
              value={value}
              onChangeText={onChange}
              placeholder="72.5"
              error={fieldError?.message}
            />
          )}
        />
        <Button
          title="Save weight"
          loading={saveWeight.isPending}
          onPress={handleSubmit(submit)}
          accessibilityLabel="Log today's weight measurement"
        />
      </Card>

      <Card className="gap-2" accessibilityLabel="Recent weight logs">
        <AppText variant="subtitle">Recent entries</AppText>
        {weights.isFetching && weights.data.length === 0 ? (
          <LoadingState label="Loading weights..." />
        ) : weights.data.length === 0 ? (
          <AppText variant="caption">No weights logged yet.</AppText>
        ) : (
          weights.data
            .slice()
            .reverse()
            .map((entry) => (
              <View key={entry.date} className="flex-row justify-between" accessibilityLabel={`${entry.date}: ${entry.weightKg.toFixed(1)} kilograms`}>
                <AppText variant="caption">{entry.date}</AppText>
                <AppText variant="label">
                  {entry.weightKg.toFixed(1)} kg {entry.pending ? "(syncing)" : ""}
                </AppText>
              </View>
            ))
        )}
      </Card>

      {summary.changeThisWeekKg !== null ? (
        <Notice
          title="This week"
          message={`Weight changed by ${summary.changeThisWeekKg.toFixed(1)} kg across your logged entries.`}
        />
      ) : null}

      {message ? <Notice tone="success" title="Saved" message={message} /> : null}
      {error ? <Notice tone="error" title="Weight issue" message={error} /> : null}
    </ScreenShell>
  );
}

