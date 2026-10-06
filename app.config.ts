import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "AI Nutrition Tracker",
  slug: "ai-nutrition-tracker",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  scheme: "ainutrition",
  backgroundColor: "#F8FAF7",
  icon: "./assets/icon.png",
  android: {
    package: "com.personalainutrition.tracker",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#2E9E5B"
    },
    // The health.* permissions are Health Connect's own, and are how watch data reaches this
    // app: Samsung Health syncs the watch into Health Connect, and we read from there. The
    // library's config plugin only adds the permissions-rationale intent filter, not these.
    permissions: [
      "READ_MEDIA_IMAGES",
      "android.permission.health.READ_STEPS",
      "android.permission.health.READ_ACTIVE_CALORIES_BURNED",
      "android.permission.health.READ_TOTAL_CALORIES_BURNED",
      "android.permission.health.READ_SLEEP",
      "android.permission.health.READ_EXERCISE",
      "android.permission.health.READ_WEIGHT",
      "android.permission.health.READ_BODY_FAT"
    ]
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
    "expo-speech-recognition",
    "react-native-health-connect",
    "./plugins/withHealthConnectAndroid",
    // Health Connect's client requires API 26; this project's default floor is 24.
    ["expo-build-properties", { android: { minSdkVersion: 26 } }],
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
