import { collection, deleteDoc, doc, getDocs, orderBy, query, setDoc } from "firebase/firestore";

import type { CoachMemory } from "../models/memory";
import { db } from "../services/firebase/config";
import { readRecord, readString } from "./firestoreParsers";
import { isFirebaseConfigured } from "../services/config/env";
import { deleteMemoryLocal, getMemoriesLocal, saveMemoryLocal } from "../services/cache/offlineCache";

function memoriesCollection(uid: string) {
  return collection(db, "users", uid, "memories");
}

function memoryDocument(uid: string, memoryId: string) {
  return doc(db, "users", uid, "memories", memoryId);
}

export async function getMemories(uid: string): Promise<CoachMemory[]> {
  if (!isFirebaseConfigured() || uid.startsWith("sandbox")) {
    return getMemoriesLocal(uid);
  }

  try {
    const snapshot = await getDocs(query(memoriesCollection(uid), orderBy("createdAt")));
    const memories = snapshot.docs.map((document) => {
      const data = readRecord(document);
      return {
        id: document.id,
        text: readString(data.text),
        createdAt: readString(data.createdAt),
        learnedOn: readString(data.learnedOn)
      };
    });
    for (const memory of memories) {
      await saveMemoryLocal(uid, memory);
    }
    return memories;
  } catch {
    return getMemoriesLocal(uid);
  }
}

export async function saveMemory(uid: string, memory: CoachMemory): Promise<CoachMemory> {
  if (!isFirebaseConfigured() || uid.startsWith("sandbox")) {
    await saveMemoryLocal(uid, memory);
    return memory;
  }

  await setDoc(memoryDocument(uid, memory.id), {
    text: memory.text,
    createdAt: memory.createdAt,
    learnedOn: memory.learnedOn
  });
  await saveMemoryLocal(uid, memory);
  return memory;
}

export async function deleteMemory(uid: string, memoryId: string): Promise<void> {
  if (!isFirebaseConfigured() || uid.startsWith("sandbox")) {
    await deleteMemoryLocal(uid, memoryId);
    return;
  }

  await deleteDoc(memoryDocument(uid, memoryId));
  await deleteMemoryLocal(uid, memoryId);
}
