import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { TextInput, View } from "react-native";

import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Notice } from "../components/Notice";
import { ScreenShell } from "../components/ScreenShell";
import { useCoach } from "../hooks/useCoach";
import { useDailyMeals } from "../hooks/useDailyMeals";
import { useGoals } from "../hooks/useGoals";
import { useWeights } from "../hooks/useWeight";
import { useAuth } from "../hooks/useAuth";
import type { CoachContext } from "../models/gemini";
import { getMealsForDates } from "../repositories/mealRepository";
import { useAppStore } from "../store/appStore";
import { lastDateKeys, toDateKey } from "../utils/date";
import { toFriendlyError } from "../utils/errors";

const exampleQuestions = [
  "Can I eat pizza tonight?",
  "What should I eat for dinner?",
  "Why isn't my weight dropping?"
];

export function CoachScreen() {
  const today = toDateKey();
  const dates = lastDateKeys(7, today);
  const { user } = useAuth();
  const goals = useGoals();
  const todayMeals = useDailyMeals(today);
  const weights = useWeights(today);
  const coach = useCoach();
  const lastCoachQuestion = useAppStore((state) => state.lastCoachQuestion);
  const setLastCoachQuestion = useAppStore((state) => state.setLastCoachQuestion);
  const [question, setQuestion] = useState(lastCoachQuestion);
  const [error, setError] = useState<string | null>(null);

  const last7Meals = useQuery({
    queryKey: user ? ["coachMeals", user.uid, today] : ["coachMeals", "anonymous", today],
    enabled: Boolean(user),
    queryFn: async () => {
      if (!user) {
        return [];
      }
      const mealsByDate = await getMealsForDates(user.uid, dates);
      return Object.values(mealsByDate).flat();
    },
    initialData: []
  });

  async function ask() {
    const trimmed = question.trim();
    if (!trimmed) {
      setError("Ask a nutrition question first.");
      return;
    }

    const context: CoachContext = {
      todayMeals: todayMeals.data ?? [],
      last7Days: last7Meals.data ?? [],
      goals: goals.data,
      currentWeight: weights.data.find((entry) => entry.date === today) ?? weights.data.at(-1) ?? null
    };

    setError(null);
    try {
      setLastCoachQuestion(trimmed);
      await coach.mutateAsync({ question: trimmed, context });
    } catch (coachError) {
      setError(toFriendlyError(coachError, "The coach could not answer right now. Please retry."));
    }
  }

  return (
    <ScreenShell>
      <View className="gap-1" accessibilityRole="header">
        <AppText variant="title">Ask Coach</AppText>
        <AppText variant="caption">AI coaching can read your data, but it cannot change anything.</AppText>
      </View>

      <Card className="gap-3" accessibilityLabel="Nutrition coaching query form">
        <AppText variant="subtitle">Question</AppText>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          multiline
          placeholder="Ask about dinner, cravings, progress, or macros"
          placeholderTextColor="#8A968E"
          className="min-h-28 rounded-lg border border-zinc-200 bg-white p-3 text-base text-ink dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
          accessibilityLabel="Coaching question text input"
        />
        <View className="gap-2" accessibilityLabel="Suggested questions list">
          {exampleQuestions.map((example) => (
            <Button
              key={example}
              title={example}
              variant="ghost"
              onPress={() => setQuestion(example)}
              accessibilityLabel={`Select suggested question: ${example}`}
            />
          ))}
        </View>
        <Button
          title="Ask coach"
          loading={coach.isPending}
          onPress={ask}
          accessibilityLabel="Submit question to your AI coach"
        />
      </Card>

      {coach.data ? (
        <Card className="gap-3" accessibilityLabel="AI Coach response summary">
          <AppText variant="subtitle">Coach</AppText>
          <AppText variant="body">{coach.data.answer}</AppText>
          {coach.data.suggestions.length > 0 ? (
            <View className="gap-2" accessibilityLabel="Coach suggestions list">
              <AppText variant="label">Suggestions</AppText>
              {coach.data.suggestions.map((suggestion, index) => (
                <AppText key={`${suggestion}-${index}`} variant="caption">
                  {suggestion}
                </AppText>
              ))}
            </View>
          ) : null}
          {coach.data.cautions.length > 0 ? (
            <View className="gap-2" accessibilityLabel="Coach caution items list">
              <AppText variant="label">Cautions</AppText>
              {coach.data.cautions.map((caution, index) => (
                <AppText key={`${caution}-${index}`} variant="caption">
                  {caution}
                </AppText>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      {error ? <Notice tone="error" title="Coach issue" message={error} /> : null}
    </ScreenShell>
  );
}
