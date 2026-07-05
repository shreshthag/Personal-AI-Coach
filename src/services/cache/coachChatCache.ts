import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Content } from "firebase/ai";

import type { CoachChatMessage, CoachProposal } from "../../models/gemini";

const key = {
  coachChat: (uid: string) => `coachChat:${uid}`
};

export type PersistedCoachChat = {
  messages: CoachChatMessage[];
  proposals: Record<string, CoachProposal>;
  history: Content[];
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
