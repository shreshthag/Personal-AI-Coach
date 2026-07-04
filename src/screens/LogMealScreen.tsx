import * as ImagePicker from "expo-image-picker";
import { useCallback, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Image, View } from "react-native";

import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { FoodReviewCard } from "../components/FoodReviewCard";
import { Notice } from "../components/Notice";
import { ScreenShell } from "../components/ScreenShell";
import { TextField } from "../components/TextField";
import { mealTypeLabels, mealTypes } from "../constants/defaults";
import { useAddMeal } from "../hooks/useDailyMeals";
import { useMealAnalysis } from "../hooks/useMealAnalysis";
import type { GeminiMealAnalysis } from "../models/gemini";
import type { MealDraft, MealSource, MealType } from "../models/nutrition";
import { toDateKey } from "../utils/date";
import { toFriendlyError } from "../utils/errors";

type MealFormValues = {
  text: string;
  notes: string;
  clarification: string;
  mealType: MealType;
};

type SelectedImage = {
  uri: string;
  mimeType: string;
  base64: string;
};

export function LogMealScreen() {
  const [image, setImage] = useState<SelectedImage | null>(null);
  const [analysis, setAnalysis] = useState<GeminiMealAnalysis | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const analysisMutation = useMealAnalysis();
  const addMeal = useAddMeal();

  const { control, handleSubmit, setValue, getValues, reset } = useForm<MealFormValues>({
    defaultValues: {
      text: "",
      notes: "",
      clarification: "",
      mealType: "lunch"
    }
  });

  const selectedMealType = useWatch({ control, name: "mealType" });

  const source: MealSource = useMemo(() => {
    const text = getValues("text").trim();
    if (image && text) {
      return "mixed";
    }
    return image ? "image" : "text";
  }, [getValues, image]);

  const normalizeImage = useCallback(async (result: ImagePicker.ImagePickerResult): Promise<void> => {
    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    if (!asset?.uri || !asset.base64) {
      setError("Could not read the selected image. Please try another photo.");
      return;
    }

    setImage({
      uri: asset.uri,
      mimeType: asset.mimeType ?? "image/jpeg",
      base64: asset.base64
    });
    setAnalysis(null);
  }, []);

  const pickFromLibrary = useCallback(async () => {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
      base64: true
    });
    await normalizeImage(result);
  }, [normalizeImage]);

  async function runAnalysis(values: MealFormValues) {
    const text = values.text.trim();
    const clarification = values.clarification.trim();

    if (!text && !image) {
      setError("Describe the meal or upload a photo before analyzing.");
      return;
    }

    setError(null);
    setMessage(null);

    try {
      const nextAnalysis = await analysisMutation.mutateAsync({
        ...(text ? { text } : {}),
        ...(image ? { imageBase64: image.base64, imageMimeType: image.mimeType } : {}),
        ...(clarification ? { clarification } : {})
      });
      setAnalysis(nextAnalysis);
      if (nextAnalysis.needsClarification) {
        setMessage(nextAnalysis.question);
      }
    } catch (analysisError) {
      setError(toFriendlyError(analysisError, "Could not analyze that meal. Please retry."));
    }
  }

  async function saveAnalyzedMeal() {
    if (!analysis || analysis.needsClarification) {
      setError("Review a complete AI estimate before saving.");
      return;
    }

    const values = getValues();
    const draft: MealDraft = {
      date: toDateKey(),
      mealType: values.mealType,
      foods: analysis.foods,
      source,
      notes: values.notes.trim(),
      ...(image ? { imageUri: image.uri, imageMimeType: image.mimeType } : {})
    };

    setError(null);
    try {
      const saved = await addMeal.mutateAsync(draft);
      setMessage(saved.pending ? "Saved offline. It will sync when your connection returns." : "Meal saved.");
      setAnalysis(null);
      setImage(null);
      reset({
        text: "",
        notes: "",
        clarification: "",
        mealType: values.mealType
      });
    } catch (saveError) {
      setError(toFriendlyError(saveError, "Could not save the meal. Please retry."));
    }
  }

  return (
    <ScreenShell>
      <View className="gap-1" accessibilityRole="header">
        <AppText variant="title">Log meal</AppText>
        <AppText variant="caption">Describe a meal, upload a photo, then review the AI estimate before saving.</AppText>
      </View>

      <Card className="gap-4" accessibilityLabel="Meal entry form">
        <View className="flex-row flex-wrap gap-2" accessibilityLabel="Select meal category">
          {mealTypes.map((type) => (
            <Button
              key={type}
              title={mealTypeLabels[type]}
              variant={selectedMealType === type ? "primary" : "ghost"}
              className="min-h-10 px-3"
              onPress={() => setValue("mealType", type, { shouldDirty: true })}
              accessibilityLabel={`Category: ${mealTypeLabels[type]}`}
              accessibilityState={{ selected: selectedMealType === type }}
            />
          ))}
        </View>

        <Controller
          control={control}
          name="text"
          render={({ field: { onChange, value } }) => (
            <TextField
              label="Meal description"
              value={value}
              onChangeText={(next) => {
                onChange(next);
                setAnalysis(null);
              }}
              multiline
              placeholder="Example: 2 idlis with sambar"
              className="min-h-24"
              accessibilityLabel="Meal description text input"
            />
          )}
        />

        <View className="flex-row gap-3">
          <Button
            title="Upload photo"
            variant="secondary"
            className="flex-1"
            onPress={pickFromLibrary}
            accessibilityLabel="Choose food image from device photo library"
          />
        </View>

        {image ? (
          <View className="gap-2" accessibilityLabel="Selected meal photo preview container">
            <Image source={{ uri: image.uri }} className="h-44 w-full rounded-lg" resizeMode="cover" accessibilityLabel="Selected food item picture" />
            <Button
              title="Remove photo"
              variant="ghost"
              onPress={() => setImage(null)}
              accessibilityLabel="Remove selected food image"
            />
          </View>
        ) : null}

        <Controller
          control={control}
          name="notes"
          render={({ field: { onChange, value } }) => (
            <TextField
              label="Notes"
              value={value}
              onChangeText={onChange}
              placeholder="Optional"
              accessibilityLabel="Additional meal notes"
            />
          )}
        />

        <Button
          title="Analyze with AI"
          loading={analysisMutation.isPending}
          onPress={handleSubmit(runAnalysis)}
          accessibilityLabel="Submit description and photo for AI nutrition analysis"
        />
      </Card>

      {message ? <Notice title="AI needs your input" message={message} /> : null}

      {analysis?.needsClarification ? (
        <Card className="gap-3" accessibilityLabel="AI clarification prompt">
          <Controller
            control={control}
            name="clarification"
            rules={{ required: "Add a clarification before retrying." }}
            render={({ field: { onChange, value }, fieldState: { error: fieldError } }) => (
              <TextField
                label="Clarification"
                value={value}
                onChangeText={onChange}
                placeholder="Example: Each idli was medium sized"
                error={fieldError?.message}
                accessibilityLabel="Clarification text input"
              />
            )}
          />
          <Button
            title="Re-analyze"
            loading={analysisMutation.isPending}
            onPress={handleSubmit(runAnalysis)}
            accessibilityLabel="Resubmit with clarification details"
          />
        </Card>
      ) : null}

      {analysis && !analysis.needsClarification ? (
        <>
          <FoodReviewCard foods={analysis.foods} />
          <Button
            title="Save meal"
            loading={addMeal.isPending}
            onPress={saveAnalyzedMeal}
            accessibilityLabel="Confirm and save meal macros to today's log"
          />
        </>
      ) : null}

      {error ? <Notice tone="error" title="Meal logging issue" message={error} /> : null}
    </ScreenShell>
  );
}
