/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable import/first */
let GoogleSignin: any;
try {
  GoogleSignin = require("@react-native-google-signin/google-signin").GoogleSignin;
} catch {
  GoogleSignin = {
    configure: () => {},
    hasPlayServices: () => Promise.resolve(true),
    signIn: () => Promise.reject(new Error("Google Sign-In is only supported in Dev Clients.")),
    signOut: () => Promise.resolve()
  };
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut as firebaseSignOut,
  type User
} from "firebase/auth";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";

import { createUserDocumentIfNeeded } from "../../repositories/userRepository";
import { env, isFirebaseConfigured, isGoogleSignInConfigured } from "../config/env";
import { auth } from "./config";

type GoogleSignInResult = {
  idToken?: string | null;
  data?: {
    idToken?: string | null;
  } | null;
};

type AuthContextValue = {
  user: User | null;
  initializing: boolean;
  signInWithGoogle: () => Promise<void>;
  signInSandbox: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    if (isGoogleSignInConfigured()) {
      GoogleSignin.configure({
        webClientId: env.googleWebClientId,
        offlineAccess: false
      });
    }
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let timeoutId: NodeJS.Timeout;

    async function init() {
      try {
        // 1. Check for sandbox session first
        const stored = await AsyncStorage.getItem("sandbox-user-session");
        if (stored) {
          setUser(JSON.parse(stored));
          // If in sandbox, we can show the app immediately
          setInitializing(false);
        }

        // 2. Start listening to Firebase Auth
        unsub = onAuthStateChanged(auth, async (nextUser) => {
          if (timeoutId) clearTimeout(timeoutId);

          if (nextUser) {
            setUser(nextUser);
            // Don't await sync - keep initialization fast
            if (isFirebaseConfigured()) {
              createUserDocumentIfNeeded(nextUser).catch(console.warn);
            }
          } else {
            const isSandbox = await AsyncStorage.getItem("sandbox-user-session");
            if (!isSandbox) {
              setUser(null);
            }
          }
          setInitializing(false);
        });

        // 3. Safety net: Unblock UI after 6 seconds if Firebase hangs
        timeoutId = setTimeout(() => {
          setInitializing((current) => {
            if (current) {
              console.warn("Auth initialization timed out; unblocking UI.");
              return false;
            }
            return false;
          });
        }, 6000);

      } catch (error) {
        console.error("Initialization error:", error);
        setInitializing(false);
      }
    }

    init();
    return () => {
      unsub?.();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      throw new Error("Firebase is not configured. Add the Expo Firebase environment values first.");
    }
    if (!isGoogleSignInConfigured()) {
      throw new Error("Google Sign-In is not configured. Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.");
    }

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = (await GoogleSignin.signIn()) as GoogleSignInResult;
    const idToken = result.data?.idToken ?? result.idToken;

    if (!idToken) {
      throw new Error("Google did not return an ID token. Check the OAuth client configuration.");
    }

    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(auth, credential);
  }, []);

  const signInSandbox = useCallback(async () => {
    const sandboxUser = {
      uid: "sandbox-user-123",
      email: "sandbox@example.com",
      displayName: "Sandbox Explorer",
      photoURL: "https://lh3.googleusercontent.com/a/default-user"
    } as unknown as User;

    await AsyncStorage.setItem("sandbox-user-session", JSON.stringify(sandboxUser));
    setUser(sandboxUser);
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem("sandbox-user-session");
    try {
      await GoogleSignin.signOut();
    } catch {
      // The native Google session may not exist; Firebase sign-out remains the source of truth.
    }
    await firebaseSignOut(auth);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      initializing,
      signInWithGoogle,
      signInSandbox,
      signOut
    }),
    [initializing, signInWithGoogle, signInSandbox, signOut, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
