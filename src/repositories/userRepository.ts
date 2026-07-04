import type { User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { defaultGoals } from "../constants/defaults";
import type { UserProfile } from "../models/user";
import { db } from "../services/firebase/config";

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
