import { useQuery } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, TextInput, View } from "react-native";

import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { CoachProposalCard } from "../components/CoachProposalCard";
import { LoadingState } from "../components/LoadingState";
import { Notice } from "../components/Notice";
import { ScreenShell } from "../components/ScreenShell";
import { defaultGoals } from "../constants/defaults";
import { defaultPersonaKey } from "../constants/personas";
import { useCoachChat } from "../hooks/useCoach";
import { useBodyProfile, useCoachSetup } from "../hooks/useUserProfile";
import { useDailyMeals } from "../hooks/useDailyMeals";
import { useGoals } from "../hooks/useGoals";
import { useWeights } from "../hooks/useWeight";
import { useAuth } from "../hooks/useAuth";
import type { CoachChatMessage, CoachContext } from "../models/gemini";
import { getMealsForDates } from "../repositories/mealRepository";
import { lastDateKeys, toDateKey } from "../utils/date";

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
  const setup = useCoachSetup();
  const profileQuery = useBodyProfile();
  const [draft, setDraft] = useState("");
  const [attachedImage, setAttachedImage] = useState<{ uri: string; base64: string; mimeType: string } | null>(null);
  const listRef = useRef<FlatList<CoachChatMessage>>(null);

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

  const getContext = useCallback(
    (): CoachContext => ({
      todayMeals: todayMeals.data ?? [],
      last7Days: last7Meals.data ?? [],
      // Fallback is unreachable: the screen returns a loading state below until goals.data exists.
      goals: goals.data ?? defaultGoals,
      currentWeight: weights.data.find((entry) => entry.date === today) ?? weights.data.at(-1) ?? null,
      recentWeights: weights.data ?? [],
      userName: user?.displayName ?? null,
      coachName: setup.data?.coachName ?? "Coach",
      persona: setup.data?.persona ?? defaultPersonaKey,
      profile: profileQuery.data ?? null
    }),
    [
      todayMeals.data,
      last7Meals.data,
      goals.data,
      weights.data,
      today,
      setup.data,
      user?.displayName,
      profileQuery.data
    ]
  );

  const { messages, proposals, status, sendMessage, confirmProposal, cancelProposal, resetChat } =
    useCoachChat(getContext);

  if (!goals.data) {
    return (
      <ScreenShell scroll={false}>
        <LoadingState label="Loading your coach..." />
      </ScreenShell>
    );
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
      base64: true
    });
    if (result.canceled) {
      return;
    }
    const asset = result.assets[0];
    if (!asset?.uri || !asset.base64) {
      return;
    }
    setAttachedImage({ uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType ?? "image/jpeg" });
  }

  function send() {
    const trimmed = draft.trim();
    if (!trimmed && !attachedImage) {
      return;
    }
    sendMessage(trimmed, attachedImage ?? undefined);
    setDraft("");
    setAttachedImage(null);
  }

  function renderMessage({ item }: { item: CoachChatMessage }) {
    if (item.kind === "proposal") {
      const proposal = proposals[item.proposalId];
      if (!proposal) {
        return null;
      }
      return (
        <CoachProposalCard
          proposal={proposal}
          onConfirm={() => confirmProposal(item.proposalId)}
          onCancel={() => cancelProposal(item.proposalId)}
        />
      );
    }
    if (item.kind === "user") {
      return (
        <View className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-leaf px-4 py-2.5">
          {item.imageUri ? (
            <Image source={{ uri: item.imageUri }} className="mb-2 h-40 w-40 rounded-xl" resizeMode="cover" />
          ) : null}
          {item.text ? (
            <AppText variant="body" className="text-white">
              {item.text}
            </AppText>
          ) : null}
        </View>
      );
    }
    if (item.kind === "coach") {
      return (
        <View className="max-w-[85%] self-start rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
          <AppText variant="body">{item.text}</AppText>
        </View>
      );
    }
    return <Notice tone="error" title="Coach issue" message={item.text} />;
  }

  return (
    <ScreenShell scroll={false}>
      <View className="flex-row items-center justify-between gap-3" accessibilityRole="header">
        <View className="flex-1 gap-1">
          <AppText variant="title">{setup.data?.coachName ?? "Coach"}</AppText>
          <AppText variant="caption">The coach can log meals and weight — with your confirmation.</AppText>
        </View>
        {messages.length > 0 ? (
          <Button
            title="New chat"
            variant="ghost"
            onPress={resetChat}
            accessibilityLabel="Start a new coach chat"
          />
        ) : null}
      </View>

      <FlatList
        ref={listRef}
        className="flex-1"
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        contentContainerClassName="gap-3 pb-2"
        ListFooterComponent={
          status === "waitingForModel" ? (
            <View className="max-w-[85%] flex-row items-center gap-2 self-start rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
              <ActivityIndicator color="#1E6B57" />
              <AppText variant="caption">Thinking…</AppText>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View className="gap-2" accessibilityLabel="Suggested questions list">
            <AppText variant="caption">
              Ask a question, or tell the coach what you ate or weigh — it can log it for you.
            </AppText>
            {exampleQuestions.map((example) => (
              <Pressable
                key={example}
                onPress={() => sendMessage(example)}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
                accessibilityRole="button"
                accessibilityLabel={`Send suggested question: ${example}`}
              >
                <AppText variant="body">{example}</AppText>
              </Pressable>
            ))}
          </View>
        }
      />

      {attachedImage ? (
        <View className="flex-row items-center gap-2" accessibilityLabel="Attached photo preview">
          <Image source={{ uri: attachedImage.uri }} className="h-16 w-16 rounded-xl" resizeMode="cover" />
          <Pressable
            onPress={() => setAttachedImage(null)}
            accessibilityRole="button"
            accessibilityLabel="Remove attached photo"
            className="rounded-full border border-zinc-200 px-3 py-1.5 dark:border-zinc-800"
          >
            <AppText variant="body">×</AppText>
          </Pressable>
        </View>
      ) : null}

      <View className="flex-row items-end gap-2">
        <Pressable
          onPress={pickImage}
          disabled={status !== "idle"}
          accessibilityRole="button"
          accessibilityLabel="Attach a food photo"
          className="h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        >
          <AppText variant="body">📎</AppText>
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          editable={status === "idle"}
          placeholder={
            status === "awaitingConfirmation"
              ? "Confirm or cancel the suggestion above"
              : "Ask about dinner, cravings, progress, or macros"
          }
          placeholderTextColor="#8A968E"
          className="max-h-32 flex-1 rounded-2xl border border-zinc-200 bg-white p-3 text-base text-ink dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
          accessibilityLabel="Coach chat message input"
        />
        <Button
          title="Send"
          disabled={status !== "idle" || (draft.trim().length === 0 && !attachedImage)}
          onPress={send}
          accessibilityLabel="Send message to your AI coach"
        />
      </View>
    </ScreenShell>
  );
}
