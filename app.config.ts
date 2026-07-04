import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "AI Nutrition Tracker",
  slug: "ai-nutrition-tracker",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  scheme: "ainutrition",
  backgroundColor: "#F8FAF7",
  android: {
    package: "com.personalainutrition.tracker",
    adaptiveIcon: {
      backgroundColor: "#F8FAF7"
    },
    permissions: ["READ_MEDIA_IMAGES"]
  },
  ios: {
    bundleIdentifier: "com.personalainutrition.tracker",
    supportsTablet: true
  },
  web: {
    bundler: "metro"
  },
  plugins: [
    "expo-dev-client",
    "expo-image-picker",
    "@react-native-google-signin/google-signin"
  ],
  extra: {
    firebaseApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    firebaseAuthDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    firebaseStorageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    firebaseMessagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    firebaseAppId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  }
};

export default config;
