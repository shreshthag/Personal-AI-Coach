import {
  collection,
  doc,
  documentId,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where
} from "firebase/firestore";

import type { DateKey, WeightEntry } from "../models/nutrition";
import { db } from "../services/firebase/config";
import { readBoolean, readNumber, readRecord } from "./firestoreParsers";
import { isFirebaseConfigured } from "../services/config/env";
import { saveWeightLocal, getWeightsLocal } from "../services/cache/offlineCache";

function weightsCollection(uid: string) {
  return collection(db, "users", uid, "weightEntries");
}

function weightDocument(uid: string, date: DateKey) {
  return doc(db, "users", uid, "weightEntries", date);
}

export async function saveWeight(uid: string, entry: WeightEntry): Promise<WeightEntry> {
  const normalized: WeightEntry = {
    date: entry.date,
    weightKg: Math.round(entry.weightKg * 10) / 10
  };

  if (!isFirebaseConfigured() || uid.startsWith("sandbox")) {
    await saveWeightLocal(uid, normalized);
    return normalized;
  }

  try {
    await setDoc(
      weightDocument(uid, entry.date),
      {
        ...normalized,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      },
      { merge: true }
    );
    await saveWeightLocal(uid, normalized);
    return normalized;
  } catch (error) {
    await saveWeightLocal(uid, { ...normalized, pending: true });
    throw error;
  }
}

export async function getWeightsForRange(uid: string, startDate: DateKey, endDate: DateKey): Promise<WeightEntry[]> {
  const cached = await getWeightsLocal(uid, startDate, endDate);

  if (!isFirebaseConfigured() || uid.startsWith("sandbox")) {
    return cached;
  }

  try {
    const snapshot = await getDocs(
      query(
        weightsCollection(uid),
        where(documentId(), ">=", startDate),
        where(documentId(), "<=", endDate),
        orderBy(documentId())
      )
    );

    const weights = snapshot.docs.map((document) => {
      const data = readRecord(document);
      return {
        date: document.id,
        weightKg: readNumber(data.weightKg),
        pending: readBoolean(data.pending)
      };
    });
    // Update local cache with server data
    await cacheWeights(uid, weights);
    return weights;
  } catch (error) {
    return cached;
  }
}
