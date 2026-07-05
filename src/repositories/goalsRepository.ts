import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { defaultGoals } from "../constants/defaults";
import type { Goals } from "../models/nutrition";
import { db } from "../services/firebase/config";
import { readNumber, readString } from "./firestoreParsers";
import { isFirebaseConfigured } from "../services/config/env";
import { cacheGoals, readCachedGoals } from "../services/cache/offlineCache";

function goalsRef(uid: string) {
  return doc(db, "users", uid, "goals", "current");
}

export async function getGoals(uid: string): Promise<Goals> {
  const cached = await readCachedGoals(uid);

  if (!isFirebaseConfigured() || uid.startsWith("sandbox")) {
    return cached || defaultGoals;
  }

  try {
    const snapshot = await getDoc(goalsRef(uid));
    if (!snapshot.exists()) {
      await saveGoals(uid, defaultGoals);
      return defaultGoals;
    }

    const data = snapshot.data() as Record<string, unknown>;
    const goals = {
      calories: readNumber(data.calories, defaultGoals.calories),
      protein: readNumber(data.protein, defaultGoals.protein),
      carbs: readNumber(data.carbs, defaultGoals.carbs),
      fat: readNumber(data.fat, defaultGoals.fat),
      mode: readString(data.mode, defaultGoals.mode),
      updatedAt: readString(data.updatedAt)
    };
    await cacheGoals(uid, goals);
    return goals;
  } catch (error) {
    return cached || defaultGoals;
  }
}

export async function saveGoals(uid: string, goals: Goals): Promise<Goals> {
  const normalized: Goals = {
    calories: Math.round(goals.calories),
    protein: Math.round(goals.protein),
    carbs: Math.round(goals.carbs),
    fat: Math.round(goals.fat),
    mode: goals.mode.trim() || defaultGoals.mode
  };

  if (!isFirebaseConfigured() || uid.startsWith("sandbox")) {
    await cacheGoals(uid, normalized);
    return normalized;
  }

  try {
    await setDoc(
      goalsRef(uid),
      {
        ...normalized,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    await cacheGoals(uid, normalized);
    return normalized;
  } catch (error) {
    await cacheGoals(uid, normalized);
    throw error;
  }
}

