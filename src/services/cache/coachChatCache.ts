import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Content } from "firebase/ai";

import type { CoachChatMessage, CoachProposal } from "../../models/gemini";
import type { DateKey } from "../../models/nutrition";

const key = {
  coachChat: (uid: string) => `coachChat:${uid}`
};

export type PersistedCoachChat = {
  messages: CoachChatMessage[];
  proposals: Record<string, CoachProposal>;
  history: Content[];
  // Day of the last message, so a new day can trigger the coach's daily briefing exactly once.
  lastActiveDate?: DateKey;
  // Outcomes not yet reported to the coach; lost notes would leave it out of sync with real data.
  pendingOutcomes?: string[];
};

export async function readCoachChat(uid: string): Promise<PersistedCoachChat | null> {
  const raw = await AsyncStorage.getItem(key.coachChat(uid));
  return raw ? (JSON.parse(raw) as PersistedCoachChat) : null;
}

export async function saveCoachChat(uid: string, snapshot: PersistedCoachChat): Promise<void> {
  await AsyncStorage.setItem(key.coachChat(uid), JSON.stringify(snapshot));
}

export async function clearCoachChat(uid: string): Promise<void> {
  await AsyncStorage.removeItem(key.coachChat(uid));
}
