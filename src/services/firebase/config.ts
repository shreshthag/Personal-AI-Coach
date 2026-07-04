import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getReactNativePersistence,
  initializeAuth
} from "firebase/auth";
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";
import { getStorage } from "firebase/storage";

import { env } from "../config/env";

const firebaseConfig = {
  apiKey: env.firebaseApiKey || "missing-api-key",
  authDomain: env.firebaseAuthDomain || "missing-auth-domain",
  projectId: env.firebaseProjectId || "missing-project-id",
  storageBucket: env.firebaseStorageBucket || "missing-storage-bucket",
  messagingSenderId: env.firebaseMessagingSenderId || "missing-sender-id",
  appId: env.firebaseAppId || "missing-app-id"
};

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/**
 * React Native requires explicit AsyncStorage provider for Firebase Auth persistence.
 */
export const auth = initializeAuth(firebaseApp, {
  persistence: getReactNativePersistence(AsyncStorage)
});

/**
 * React Native (JS SDK) doesn't support IndexedDB for persistentLocalCache.
 * We use memoryLocalCache for Firestore's internal session caching and rely on
 * our custom offlineCache.ts (AsyncStorage) for true cross-session persistence.
 */
export const db = initializeFirestore(firebaseApp, {
  localCache: memoryLocalCache()
});

export const storage = getStorage(firebaseApp);
