# Personal AI Nutrition Tracker

Production-shaped MVP for a single-user nutrition tracker built with Expo, React Native, TypeScript, Firebase, Gemini, React Navigation, TanStack Query, React Hook Form, Zustand, and NativeWind.

## Features

- Google Sign-In with Firebase Authentication.
- Firestore user profile, goals, daily meal logs, and weight entries.
- Firebase Storage uploads for meal images.
- Text and photo-upload meal logging.
- Gemini structured JSON meal estimates with clarification before saving.
- Dashboard with calories, macros, weight, and weekly progress.
- Meal history, editable goals, weight tracking, weekly summary, and AI coach.
- Offline cache for recent logs plus queued retries for meals, goals, and weights.
- Dark mode via system theme.

## Firestore Layout

Firestore paths alternate collections and documents, so the app stores the requested structure as:

```text
users/{uid}
users/{uid}/goals/current
users/{uid}/dailyLogs/{date}/meals/{mealId}
users/{uid}/weightEntries/{date}
```

Daily and weekly summaries are computed from stored meals. No daily summary totals are duplicated.

## Environment

Copy `.env.example` to `.env` and fill in the public Expo values:

```bash
cp .env.example .env
```

Firebase web config values are safe to include in the mobile app when Firestore and Storage rules are enforced. The Gemini API key is not included in the app; it is stored as a Firebase Functions secret.

## Gemini Proxy

The app calls `EXPO_PUBLIC_GEMINI_PROXY_URL`, which should point to the deployed `geminiProxy` Firebase Function.

Set the Gemini secret:

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

Deploy rules and the proxy:

```bash
firebase deploy --only firestore:rules,storage,functions:geminiProxy
```

The proxy defaults to `gemini-2.5-flash`. Set a `GEMINI_MODEL` environment variable for the function if you want to override it.

## Install And Run

This project uses native Google Sign-In, so run it with an Expo development build, not Expo Go.

```bash
npm install
npm run android
```

For later runs:

```bash
npm start
```

## Firebase Setup Notes

- Enable Google as a Firebase Authentication provider.
- Add the Android package name `com.personalainutrition.tracker` to the Firebase app.
- Configure the SHA fingerprints required by Google Sign-In.
- Put the deployed function URL into `EXPO_PUBLIC_GEMINI_PROXY_URL`.

## Validation

```bash
npm run typecheck
```

The function can be checked separately:

```bash
cd functions
npm install
npm run build
```
