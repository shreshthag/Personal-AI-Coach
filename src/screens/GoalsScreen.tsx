import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Pressable, View } from "react-native";

import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Notice } from "../components/Notice";
import { ScreenShell } from "../components/ScreenShell";
import { TextField } from "../components/TextField";
import { personas, type PersonaKey } from "../constants/personas";
import { useGoals, useUpdateGoals } from "../hooks/useGoals";
import { useBodyProfile, useCoachSetup, useSaveBodyProfile, useSaveCoachSetup } from "../hooks/useUserProfile";
import { useWeights } from "../hooks/useWeight";
import type { Goals } from "../models/nutrition";
import type { ActivityLevel, BodyProfile, Gender } from "../models/user";
import type { RootStackParamList } from "../types/navigation";
import { toDateKey } from "../utils/date";
import { toFriendlyError } from "../utils/errors";
import { classifyMode, computeTargets } from "../utils/nutrition";

type GoalsScreenProps = NativeStackScreenProps<RootStackParamList, "Goals">;

type GoalsFormValues = Record<keyof Pick<Goals, "calories" | "protein" | "carbs" | "fat" | "mode">, string>;

const genderOptions: { key: Gender; label: string }[] = [
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
  { key: "other", label: "Other" }
];

const activityOptions: { key: ActivityLevel; label: string }[] = [
  { key: "sedentary", label: "Sedentary" },
  { key: "moderate", label: "Moderate" },
  { key: "active", label: "Active" }
];

export function GoalsScreen({ navigation }: GoalsScreenProps) {
  const today = toDateKey();
  const goals = useGoals();
  const updateGoals = useUpdateGoals();
  const bodyProfile = useBodyProfile();
  const saveBodyProfile = useSaveBodyProfile();
  const coachSetup = useCoachSetup();
  const saveCoachSetup = useSaveCoachSetup();
  const weights = useWeights(today);
  const latestWeightKg = weights.data.at(-1)?.weightKg;

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, reset, setValue, getValues } = useForm<GoalsFormValues>({
    defaultValues: {
      calories: String(goals.data.calories),
      protein: String(goals.data.protein),
      carbs: String(goals.data.carbs),
      fat: String(goals.data.fat),
      mode: goals.data.mode
    }
  });
  const lastBucket = useRef(classifyMode(goals.data.mode));

  useEffect(() => {
    reset({
      calories: String(goals.data.calories),
      protein: String(goals.data.protein),
      carbs: String(goals.data.carbs),
      fat: String(goals.data.fat),
      mode: goals.data.mode
    });
    lastBucket.current = classifyMode(goals.data.mode);
  }, [goals.data, reset]);

  const [profileHeight, setProfileHeight] = useState("");
  const [profileAge, setProfileAge] = useState("");
  const [profileGender, setProfileGender] = useState<Gender | null>(null);
  const [profileActivityLevel, setProfileActivityLevel] = useState<ActivityLevel | null>(null);

  useEffect(() => {
    if (bodyProfile.data) {
      setProfileHeight(String(bodyProfile.data.heightCm));
      setProfileAge(String(bodyProfile.data.age));
      setProfileGender(bodyProfile.data.gender);
      setProfileActivityLevel(bodyProfile.data.activityLevel);
    }
  }, [bodyProfile.data]);

  const [coachName, setCoachName] = useState("Coach");
  const [selectedPersona, setSelectedPersona] = useState<PersonaKey | null>(null);

  useEffect(() => {
    if (coachSetup.data?.coachName) {
      setCoachName(coachSetup.data.coachName);
    }
    if (coachSetup.data?.persona && personas.some((persona) => persona.key === coachSetup.data?.persona)) {
      setSelectedPersona(coachSetup.data.persona as PersonaKey);
    }
  }, [coachSetup.data]);

  async function submit(values: GoalsFormValues) {
    const nextGoals: Goals = {
      calories: Number(values.calories),
      protein: Number(values.protein),
      carbs: Number(values.carbs),
      fat: Number(values.fat),
      mode: values.mode
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

  const profileHeightNumber = Number(profileHeight);
  const profileAgeNumber = Number(profileAge);
  const canSaveProfile =
    Number.isFinite(profileHeightNumber) &&
    profileHeightNumber > 0 &&
    Number.isFinite(profileAgeNumber) &&
    profileAgeNumber > 0 &&
    profileGender !== null &&
    profileActivityLevel !== null;

  async function submitProfile() {
    if (!canSaveProfile || !profileGender || !profileActivityLevel) {
      return;
    }
    setError(null);
    setMessage(null);
    try {
      const nextProfile: BodyProfile = {
        heightCm: profileHeightNumber,
        gender: profileGender,
        age: profileAgeNumber,
        activityLevel: profileActivityLevel
      };
      await saveBodyProfile.mutateAsync(nextProfile);
      setMessage("Profile saved.");

      if (latestWeightKg !== undefined) {
        const targets = computeTargets(nextProfile, latestWeightKg, getValues("mode"));
        setValue("calories", String(targets.calories));
        setValue("protein", String(targets.protein));
        setValue("carbs", String(targets.carbs));
        setValue("fat", String(targets.fat));
      }
    } catch (saveError) {
      setError(toFriendlyError(saveError, "Could not save your profile. Please retry."));
    }
  }

  const trimmedCoachName = coachName.trim();
  const canSaveCoach = trimmedCoachName.length > 0 && selectedPersona !== null;

  async function submitCoach() {
    if (!canSaveCoach || !selectedPersona) {
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await saveCoachSetup.mutateAsync({ coachName: trimmedCoachName, persona: selectedPersona });
      setMessage("Coach saved.");
    } catch (saveError) {
      setError(toFriendlyError(saveError, "Could not save your coach. Please retry."));
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
        <Controller
          control={control}
          name="mode"
          rules={{ required: "Mode is required" }}
          render={({ field: { onChange, value }, fieldState: { error: fieldError } }) => (
            <TextField
              label="Mode (e.g. cutting, bulking, maintenance)"
              value={value}
              onChangeText={(text) => {
                onChange(text);
                const newBucket = classifyMode(text);
                if (newBucket !== lastBucket.current && bodyProfile.data && latestWeightKg !== undefined) {
                  const targets = computeTargets(bodyProfile.data, latestWeightKg, text);
                  setValue("calories", String(targets.calories));
                  setValue("protein", String(targets.protein));
                  setValue("carbs", String(targets.carbs));
                  setValue("fat", String(targets.fat));
                  lastBucket.current = newBucket;
                }
              }}
              error={fieldError?.message}
              accessibilityLabel="Goal mode field"
            />
          )}
        />
        <Button
          title="Save goals"
          loading={updateGoals.isPending}
          onPress={handleSubmit(submit)}
          accessibilityLabel="Save daily nutrition goals"
        />
      </Card>

      <Card className="gap-4" accessibilityLabel="Your profile form">
        <AppText variant="subtitle">Your profile</AppText>
        <TextField
          label="Height (cm)"
          keyboardType="number-pad"
          value={profileHeight}
          onChangeText={setProfileHeight}
          accessibilityLabel="Height in centimeters field"
        />
        <TextField
          label="Age"
          keyboardType="number-pad"
          value={profileAge}
          onChangeText={setProfileAge}
          accessibilityLabel="Age field"
        />

        <View className="gap-2">
          <AppText variant="label">Gender</AppText>
          <View className="flex-row gap-3">
            {genderOptions.map((option) => {
              const isSelected = option.key === profileGender;
              return (
                <Pressable
                  key={option.key}
                  className="flex-1"
                  onPress={() => setProfileGender(option.key)}
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

        <View className="gap-2">
          <AppText variant="label">Activity level</AppText>
          <View className="flex-row gap-3">
            {activityOptions.map((option) => {
              const isSelected = option.key === profileActivityLevel;
              return (
                <Pressable
                  key={option.key}
                  className="flex-1"
                  onPress={() => setProfileActivityLevel(option.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`Select activity level ${option.label}`}
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

        <Button
          title="Save profile"
          loading={saveBodyProfile.isPending}
          disabled={!canSaveProfile}
          onPress={submitProfile}
          accessibilityLabel="Save body profile"
        />
      </Card>

      <Card className="gap-4" accessibilityLabel="Coach form">
        <AppText variant="subtitle">Coach</AppText>
        <TextField
          label="Coach name"
          value={coachName}
          onChangeText={setCoachName}
          placeholder="Coach"
          accessibilityLabel="Coach name field"
        />

        <View className="gap-3">
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

        <Button
          title="Save coach"
          loading={saveCoachSetup.isPending}
          disabled={!canSaveCoach}
          onPress={submitCoach}
          accessibilityLabel="Save coach setup"
        />
        <AppText variant="caption">Changes apply from your next chat.</AppText>
      </Card>

      {message ? <Notice tone="success" title="Saved" message={message} /> : null}
      {error ? <Notice tone="error" title="Goal issue" message={error} /> : null}
    </ScreenShell>
  );
}
