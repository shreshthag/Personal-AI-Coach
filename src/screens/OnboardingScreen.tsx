import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Notice } from "../components/Notice";
import { ScreenShell } from "../components/ScreenShell";
import { TextField } from "../components/TextField";
import { personas, type PersonaKey } from "../constants/personas";
import { useAuth } from "../hooks/useAuth";
import { useGoals, useUpdateGoals } from "../hooks/useGoals";
import { useCoachSetup, useSaveBodyProfile, useSaveCoachSetup } from "../hooks/useUserProfile";
import { useSaveWeight, useWeights } from "../hooks/useWeight";
import type { ActivityLevel, BodyProfile, Gender } from "../models/user";
import { toDateKey } from "../utils/date";
import { toFriendlyError } from "../utils/errors";
import { computeTargets } from "../utils/nutrition";

const genderOptions: { key: Gender; label: string }[] = [
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
  { key: "other", label: "Other" }
];

const activityOptions: { key: ActivityLevel; label: string; tagline: string }[] = [
  { key: "sedentary", label: "Sedentary", tagline: "Desk job, little exercise" },
  { key: "moderate", label: "Moderate", tagline: "Exercise 2–4×/week" },
  { key: "active", label: "Active", tagline: "Hard training 5+×/week" }
];

export function OnboardingScreen() {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(" ")[0] ?? null;
  const today = toDateKey();

  const setup = useCoachSetup();
  const saveCoachSetup = useSaveCoachSetup();
  const saveBodyProfile = useSaveBodyProfile();
  const weights = useWeights(today);
  const saveWeight = useSaveWeight();
  const goals = useGoals();
  const updateGoals = useUpdateGoals();

  const [coachName, setCoachName] = useState("Coach");
  const [selectedPersona, setSelectedPersona] = useState<PersonaKey | null>(null);
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(null);
  const [goalText, setGoalText] = useState(goals.data.mode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (setup.data?.coachName) {
      setCoachName(setup.data.coachName);
    }
    if (setup.data?.persona && personas.some((persona) => persona.key === setup.data?.persona)) {
      setSelectedPersona(setup.data.persona as PersonaKey);
    }
  }, [setup.data]);

  useEffect(() => {
    const latestWeightKg = weights.data.at(-1)?.weightKg;
    if (weight === "" && latestWeightKg !== undefined) {
      setWeight(String(latestWeightKg));
    }
  }, [weights.data, weight]);

  const trimmedName = coachName.trim();
  const trimmedGoal = goalText.trim();
  const heightNumber = Number(height);
  const weightNumber = Number(weight);
  const ageNumber = Number(age);
  const isSaving =
    saveCoachSetup.isPending || saveBodyProfile.isPending || saveWeight.isPending || updateGoals.isPending;

  const canSubmit =
    trimmedName.length > 0 &&
    selectedPersona !== null &&
    Number.isFinite(heightNumber) &&
    heightNumber > 0 &&
    Number.isFinite(weightNumber) &&
    weightNumber > 0 &&
    Number.isFinite(ageNumber) &&
    ageNumber > 0 &&
    gender !== null &&
    activityLevel !== null &&
    trimmedGoal.length > 0;

  async function submit() {
    if (!canSubmit || !selectedPersona || !gender || !activityLevel) {
      return;
    }
    setError(null);
    try {
      await saveCoachSetup.mutateAsync({ coachName: trimmedName, persona: selectedPersona });

      const profile: BodyProfile = {
        heightCm: heightNumber,
        gender,
        age: ageNumber,
        activityLevel
      };
      await saveBodyProfile.mutateAsync(profile);

      await saveWeight.mutateAsync({ date: today, weightKg: weightNumber });

      const targets = computeTargets(profile, weightNumber, trimmedGoal);
      await updateGoals.mutateAsync(targets);
    } catch (saveError) {
      setError(toFriendlyError(saveError, "Could not save your coach setup. Please retry."));
    }
  }

  return (
    <ScreenShell>
      <View className="gap-1" accessibilityRole="header">
        <AppText variant="title">{firstName ? `Welcome, ${firstName}` : "Welcome"}</AppText>
        <AppText variant="caption">Set up your coach and tell us about yourself — we'll compute your daily targets.</AppText>
      </View>

      <Card className="gap-4" accessibilityLabel="Coach name form">
        <TextField
          label="Coach name"
          value={coachName}
          onChangeText={setCoachName}
          placeholder="Coach"
          accessibilityLabel="Coach name field"
        />
      </Card>

      <View className="gap-3">
        <AppText variant="label">Pick a coaching style</AppText>
        {personas.map((persona) => {
          const isSelected = persona.key === selectedPersona;
          return (
            <Pressable
              key={persona.key}
              onPress={() => setSelectedPersona(persona.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`Select ${persona.label} coaching style`}
            >
              <Card className={isSelected ? "border-leaf bg-mint dark:border-leaf dark:bg-zinc-900" : ""}>
                <AppText variant="label">{persona.label}</AppText>
                <AppText variant="caption" className="mt-1">
                  {persona.tagline}
                </AppText>
              </Card>
            </Pressable>
          );
        })}
      </View>

      <Card className="gap-4" accessibilityLabel="About you form">
        <AppText variant="label">About you</AppText>
        <TextField
          label="Height (cm)"
          keyboardType="number-pad"
          value={height}
          onChangeText={setHeight}
          accessibilityLabel="Height in centimeters field"
        />
        <TextField
          label="Weight (kg)"
          keyboardType="number-pad"
          value={weight}
          onChangeText={setWeight}
          accessibilityLabel="Weight in kilograms field"
        />
        <TextField
          label="Age"
          keyboardType="number-pad"
          value={age}
          onChangeText={setAge}
          accessibilityLabel="Age field"
        />

        <View className="gap-2">
          <AppText variant="label">Gender</AppText>
          <View className="flex-row gap-3">
            {genderOptions.map((option) => {
              const isSelected = option.key === gender;
              return (
                <Pressable
                  key={option.key}
                  className="flex-1"
                  onPress={() => setGender(option.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`Select gender ${option.label}`}
                >
                  <Card
                    className={`items-center py-2 ${isSelected ? "border-leaf bg-mint dark:border-leaf dark:bg-zinc-900" : ""}`}
                  >
                    <AppText variant="label">{option.label}</AppText>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Card>

      <View className="gap-3">
        <AppText variant="label">Activity level</AppText>
        {activityOptions.map((option) => {
          const isSelected = option.key === activityLevel;
          return (
            <Pressable
              key={option.key}
              onPress={() => setActivityLevel(option.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`Select activity level ${option.label}`}
            >
              <Card className={isSelected ? "border-leaf bg-mint dark:border-leaf dark:bg-zinc-900" : ""}>
                <AppText variant="label">{option.label}</AppText>
                <AppText variant="caption" className="mt-1">
                  {option.tagline}
                </AppText>
              </Card>
            </Pressable>
          );
        })}
      </View>

      <Card className="gap-4" accessibilityLabel="Goal form">
        <TextField
          label="Goal (e.g. cut, bulk, maintenance)"
          value={goalText}
          onChangeText={setGoalText}
          accessibilityLabel="Goal field"
        />
      </Card>

      <Button
        title="Start coaching"
        loading={isSaving}
        disabled={!canSubmit}
        onPress={submit}
        accessibilityLabel="Start coaching with this setup"
      />

      {error ? <Notice tone="error" title="Setup issue" message={error} /> : null}
    </ScreenShell>
  );
}
