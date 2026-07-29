import { useQuery } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, Image, PanResponder, Pressable, TextInput, View } from "react-native";

import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { CoachMarkdown } from "../components/CoachMarkdown";
import { CoachProposalCard } from "../components/CoachProposalCard";
import { LoadingState } from "../components/LoadingState";
import { Notice } from "../components/Notice";
import { ScreenShell } from "../components/ScreenShell";
import { StreamingCaret, TypingDots } from "../components/TypingDots";
import { defaultGoals } from "../constants/defaults";
import { defaultPersonaKey } from "../constants/personas";
import { useAuth } from "../hooks/useAuth";
import { useCoachChat } from "../hooks/useCoach";
import { useDailyMeals } from "../hooks/useDailyMeals";
import { useGoals } from "../hooks/useGoals";
import { useBodyProfile, useCoachSetup } from "../hooks/useUserProfile";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { useWeights } from "../hooks/useWeight";
import type { CoachChatMessage, CoachContext } from "../models/gemini";
import { getMealsForDates } from "../repositories/mealRepository";
import { lastDateKeys, toDateKey } from "../utils/date";

const exampleQuestions = [
  "Can I eat pizza tonight?",
  "What should I eat for dinner?",
  "Why isn't my weight dropping?"
];

const HOLD_TO_RECORD_MS = 350;
const CANCEL_DISTANCE_PX = 80;

function formatSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function CoachScreen() {
  const today = toDateKey();
  const dates = lastDateKeys(8, today);
  const { user } = useAuth();
  const goals = useGoals();
  const todayMeals = useDailyMeals(today);
  const weights = useWeights(today);
  const setup = useCoachSetup();
  const profileQuery = useBodyProfile();
  const voice = useVoiceInput();
  const [draft, setDraft] = useState("");
  const [attachedImage, setAttachedImage] = useState<{ uri: string; base64: string; mimeType: string } | null>(null);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [recordingPulse] = useState(() => new Animated.Value(1));
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});
  const listRef = useRef<FlatList<CoachChatMessage>>(null);
  const recordHoldRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recentMeals = useQuery({
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
      recentMeals: recentMeals.data ?? [],
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
      recentMeals.data,
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
  const lastCoachMessageId = [...messages].reverse().find((message) => message.kind === "coach")?.id;
  const hasStreamingMessage = messages.some((message) => message.kind === "coach" && message.streaming);

  useEffect(() => {
    return () => {
      if (recordHoldRef.current) {
        clearTimeout(recordHoldRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!voice.recording) {
      recordingPulse.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(recordingPulse, { toValue: 0.35, duration: 650, useNativeDriver: true }),
        Animated.timing(recordingPulse, { toValue: 1, duration: 650, useNativeDriver: true })
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [recordingPulse, voice.recording]);

  const appendTranscript = useCallback((transcript: string) => {
    const trimmed = transcript.trim();
    if (!trimmed) {
      return;
    }
    setDraft((current) => (current.trim() ? `${current.trim()} ${trimmed}` : trimmed));
  }, []);

  const endMicGesture = useCallback(
    (shouldCancel: boolean) => {
      if (recordHoldRef.current) {
        clearTimeout(recordHoldRef.current);
        recordHoldRef.current = null;
      }
      setCancelArmed(false);
      if (shouldCancel) {
        voice.cancel();
        return;
      }
      void voice.stop().then(appendTranscript);
    },
    [appendTranscript, voice]
  );

  const beginMicGesture = useCallback(() => {
    setCancelArmed(false);
    recordHoldRef.current = setTimeout(() => {
      recordHoldRef.current = null;
      void voice.start();
    }, HOLD_TO_RECORD_MS);
  }, [voice]);

  const updateCancelArmed = useCallback((distance: number) => {
    setCancelArmed(distance <= -CANCEL_DISTANCE_PX);
  }, []);

  // PanResponder invokes these callbacks after a user gesture, not during render.
  /* eslint-disable react-hooks/refs */
  const micResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => status === "idle" && !attachedImage && draft.trim().length === 0,
        onPanResponderGrant: beginMicGesture,
        onPanResponderMove: (_, gesture) => updateCancelArmed(gesture.dx),
        onPanResponderRelease: (_, gesture) => endMicGesture(gesture.dx <= -CANCEL_DISTANCE_PX),
        onPanResponderTerminate: () => endMicGesture(true)
      }),
    [attachedImage, beginMicGesture, draft, endMicGesture, status, updateCancelArmed]
  );

  const recordingResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_, gesture) => updateCancelArmed(gesture.dx),
        onPanResponderRelease: (_, gesture) => endMicGesture(gesture.dx <= -CANCEL_DISTANCE_PX),
        onPanResponderTerminate: () => endMicGesture(true)
      }),
    [endMicGesture, updateCancelArmed]
  );
  /* eslint-enable react-hooks/refs */

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

  function renderCoachMessage(item: Extract<CoachChatMessage, { kind: "coach" }>) {
    const quickReplies = item.quickReplies ?? [];
    const showChips = item.id === lastCoachMessageId && !item.streaming && quickReplies.length > 0;
    const coachInitial = (setup.data?.coachName ?? "Coach").trim().charAt(0).toUpperCase() || "C";

    return (
      <View className="max-w-[90%] flex-row items-end gap-2 self-start">
        <View className="h-7 w-7 items-center justify-center rounded-full bg-leaf">
          <AppText variant="label" className="text-xs text-white">
            {coachInitial}
          </AppText>
        </View>
        <View className="flex-1 gap-2">
          <View className="flex-row items-end rounded-[20px] rounded-bl-md border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <View className="flex-1">
              <CoachMarkdown text={item.text} />
            </View>
            {item.streaming ? <StreamingCaret /> : null}
          </View>
          {item.thought && !item.streaming ? (
            <View className="mt-1">
              <Pressable
                onPress={() => setExpandedThoughts((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                accessibilityRole="button"
                accessibilityLabel={expandedThoughts[item.id] ? "Hide the coach's reasoning" : "Show the coach's reasoning"}
                className="self-start rounded-full border border-zinc-200 bg-white px-3 py-1 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <AppText variant="caption">{expandedThoughts[item.id] ? "Thought ▴" : "Thought ▾"}</AppText>
              </Pressable>
              {expandedThoughts[item.id] ? (
                <View className="mt-1 max-w-[92%] self-start rounded-2xl bg-zinc-100 px-3 py-2 dark:bg-zinc-900">
                  <AppText variant="caption">{item.thought}</AppText>
                </View>
              ) : null}
            </View>
          ) : null}
          {showChips ? (
            <View className="flex-row flex-wrap gap-2">
              {quickReplies.map((chip) => (
                <Pressable
                  key={chip}
                  onPress={() => sendMessage(chip)}
                  disabled={status !== "idle"}
                  accessibilityRole="button"
                  accessibilityLabel={`Ask coach: ${chip}`}
                  className="min-h-11 justify-center rounded-full border border-leaf/30 bg-mint px-4 dark:border-leaf/60 dark:bg-leaf/20"
                >
                  <AppText variant="label" className="text-leaf dark:text-mint">
                    {chip}
                  </AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    );
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
        <View className="max-w-[85%] self-end rounded-[20px] rounded-br-md bg-leaf px-4 py-3 shadow-sm">
          {item.imageUri ? (
            <Image source={{ uri: item.imageUri }} className="mb-2 h-40 w-40 rounded-2xl" resizeMode="cover" />
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
      return renderCoachMessage(item);
    }
    return <Notice tone="error" title="Coach issue" message={item.text} />;
  }

  return (
    <ScreenShell scroll={false}>
      <View className="flex-row items-center justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-zinc-800" accessibilityRole="header">
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
            className="rounded-full"
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
        contentContainerClassName="gap-3 py-3"
        ListFooterComponent={
          status === "waitingForModel" && !hasStreamingMessage ? (
            <View className="max-w-[90%] flex-row items-end gap-2 self-start">
              <View className="h-7 w-7 items-center justify-center rounded-full bg-leaf">
                <AppText variant="label" className="text-xs text-white">
                  {(setup.data?.coachName ?? "Coach").trim().charAt(0).toUpperCase() || "C"}
                </AppText>
              </View>
              <View className="rounded-[20px] rounded-bl-md border border-zinc-200 bg-white px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <TypingDots />
              </View>
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
                className="min-h-12 justify-center rounded-[20px] border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                accessibilityRole="button"
                accessibilityLabel={`Send suggested question: ${example}`}
              >
                <AppText variant="body">{example}</AppText>
              </Pressable>
            ))}
          </View>
        }
      />

      {voice.error ? <Notice tone="error" title="Voice input" message={voice.error} /> : null}

      {attachedImage && !voice.recording ? (
        <View className="flex-row items-center gap-2" accessibilityLabel="Attached photo preview">
          <Image source={{ uri: attachedImage.uri }} className="h-16 w-16 rounded-2xl" resizeMode="cover" />
          <Pressable
            onPress={() => setAttachedImage(null)}
            accessibilityRole="button"
            accessibilityLabel="Remove attached photo"
            className="min-h-11 min-w-11 items-center justify-center rounded-full border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          >
            <AppText variant="body">×</AppText>
          </Pressable>
        </View>
      ) : null}

      {voice.recording ? (
        <View className="flex-row items-center gap-3 rounded-full border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950">
          <Animated.View className="h-2.5 w-2.5 rounded-full bg-red-600" style={{ opacity: recordingPulse }} />
          <AppText variant="label" className="text-red-700 dark:text-red-300">
            {formatSeconds(voice.seconds)}
          </AppText>
          <AppText variant="body" className="flex-1 text-red-800 dark:text-red-200" numberOfLines={1}>
            {cancelArmed ? "Release to cancel" : voice.partialTranscript || "‹ Slide to cancel"}
          </AppText>
          <View
            {...recordingResponder.panHandlers}
            accessibilityRole="button"
            accessibilityLabel="Release to finish voice input"
            className="h-12 w-12 items-center justify-center rounded-full bg-red-600"
          >
            <AppText variant="body" className="text-white">●</AppText>
          </View>
        </View>
      ) : (
        <View className="flex-row items-end gap-2">
          <Pressable
            onPress={pickImage}
            disabled={status !== "idle"}
            accessibilityRole="button"
            accessibilityLabel="Attach a food photo"
            className="h-12 w-12 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
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
            className="max-h-32 min-h-12 flex-1 rounded-[20px] border border-zinc-200 bg-white px-4 py-3 text-base text-ink shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
            accessibilityLabel="Coach chat message input"
          />
          {draft.trim().length > 0 || attachedImage ? (
            <Pressable
              onPress={send}
              disabled={status !== "idle"}
              accessibilityRole="button"
              accessibilityLabel="Send message to your AI coach"
              className="h-12 w-12 items-center justify-center rounded-full bg-leaf shadow-sm disabled:opacity-55"
            >
              <AppText variant="body" className="text-white">➤</AppText>
            </Pressable>
          ) : (
            <View
              {...micResponder.panHandlers}
              accessibilityRole="button"
              accessibilityLabel="Hold to record a voice message"
              className={`h-12 w-12 items-center justify-center rounded-full bg-leaf shadow-sm${status !== "idle" ? " opacity-55" : ""}`}
            >
              <AppText variant="body" className="text-white">🎙</AppText>
            </View>
          )}
        </View>
      )}
    </ScreenShell>
  );
}
