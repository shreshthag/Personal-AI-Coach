import type { User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { defaultGoals } from "../constants/defaults";
import type { ActivityLevel, BodyProfile, Gender, UserProfile } from "../models/user";
import { db } from "../services/firebase/config";
import { readNullableString } from "./firestoreParsers";
import { isFirebaseConfigured } from "../services/config/env";
import {
  cacheBodyProfile,
  cacheCoachSetup,
  readCachedBodyProfile,
  readCachedCoachSetup,
  type CoachSetup
} from "../services/cache/offlineCache";

const genders: Gender[] = ["male", "female", "other"];
const activityLevels: ActivityLevel[] = ["sedentary", "moderate", "active"];

function parseBodyProfile(data: Record<string, unknown>): BodyProfile | null {
  const { heightCm, gender, age, activityLevel } = data;
  const heightValid = typeof heightCm === "number" && Number.isFinite(heightCm) && heightCm > 0;
  const ageValid = typeof age === "number" && Number.isFinite(age) && age > 0;
  const genderValid = typeof gender === "string" && genders.includes(gender as Gender);
  const activityValid = typeof activityLevel === "string" && activityLevels.includes(activityLevel as ActivityLevel);

  if (!heightValid || !ageValid || !genderValid || !activityValid) {
    return null;
  }

  return {
    heightCm: heightCm as number,
    gender: gender as Gender,
    age: age as number,
    activityLevel: activityLevel as ActivityLevel
  };
}

export async function createUserDocumentIfNeeded(user: User): Promise<void> {
  try {
    const userRef = doc(db, "users", user.uid);
    const snapshot = await getDoc(userRef);
    const profile: UserProfile = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL
    };

    await setDoc(
      userRef,
      {
        ...profile,
        ...(snapshot.exists() ? {} : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    if (!snapshot.exists()) {
      await setDoc(doc(userRef, "goals", "current"), {
        ...defaultGoals,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error("Critical: Failed to sync user document with Firestore:", error);
    // Rethrowing so the UI/Auth flow knows it failed
    throw error;
  }
}

function userRef(uid: string) {
  return doc(db, "users", uid);
}

export async function getCoachSetup(uid: string): Promise<{ coachName: string | null; persona: string | null }> {
  const cached = await readCachedCoachSetup(uid);

  if (!isFirebaseConfigured() || uid.startsWith("sandbox")) {
    return { coachName: cached?.coachName ?? null, persona: cached?.persona ?? null };
  }

  try {
    const snapshot = await getDoc(userRef(uid));
    const data = (snapshot.data() ?? {}) as Record<string, unknown>;
    const coachName = readNullableString(data.coachName);
    const persona = readNullableString(data.persona);

    if (coachName && persona) {
      await cacheCoachSetup(uid, { coachName, persona });
    }

    return { coachName, persona };
  } catch {
    return { coachName: cached?.coachName ?? null, persona: cached?.persona ?? null };
  }
}

export async function saveCoachSetup(uid: string, setup: CoachSetup): Promise<CoachSetup> {
  if (!isFirebaseConfigured() || uid.startsWith("sandbox")) {
    await cacheCoachSetup(uid, setup);
    return setup;
  }

  try {
    await setDoc(
      userRef(uid),
      {
        coachName: setup.coachName,
        persona: setup.persona,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    await cacheCoachSetup(uid, setup);
    return setup;
  } catch (error) {
    await cacheCoachSetup(uid, setup);
    throw error;
  }
}

export async function getBodyProfile(uid: string): Promise<BodyProfile | null> {
  const cached = await readCachedBodyProfile(uid);

  if (!isFirebaseConfigured() || uid.startsWith("sandbox")) {
    return cached;
  }

  try {
    const snapshot = await getDoc(userRef(uid));
    const data = (snapshot.data() ?? {}) as Record<string, unknown>;
    const profile = parseBodyProfile(data);

    if (profile) {
      await cacheBodyProfile(uid, profile);
    }

    return profile;
  } catch {
    return cached;
  }
}

export async function saveBodyProfile(uid: string, profile: BodyProfile): Promise<BodyProfile> {
  if (!isFirebaseConfigured() || uid.startsWith("sandbox")) {
    await cacheBodyProfile(uid, profile);
    return profile;
  }

  try {
    await setDoc(
      userRef(uid),
      {
        heightCm: profile.heightCm,
        gender: profile.gender,
        age: profile.age,
        activityLevel: profile.activityLevel,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    await cacheBodyProfile(uid, profile);
    return profile;
  } catch (error) {
    await cacheBodyProfile(uid, profile);
    throw error;
  }
}
