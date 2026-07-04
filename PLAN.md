# Personal AI Nutrition Tracker Plan

## Current Status

The project is now a validated Expo + React Native + TypeScript MVP scaffold for a single-user AI nutrition tracker. App typecheck, app lint, and Firebase Function build all pass locally.

## Done

- Replaced the initial native Android scaffold with an Expo TypeScript project.
- Added React Navigation with:
  - Auth flow
  - Bottom tabs
  - Dashboard
  - Meal logging
  - Meal history
  - Weight tracking
  - AI coach
  - Goals modal
  - Weekly summary modal
- Added clean architecture folders under `src/`:
  - `components/`
  - `screens/`
  - `navigation/`
  - `hooks/`
  - `services/`
  - `repositories/`
  - `models/`
  - `store/`
  - `utils/`
  - `constants/`
  - `types/`
- Added Firebase client setup for:
  - Authentication
  - Firestore
  - Storage
- Added Google Sign-In flow.
- Added Firestore repositories for:
  - User profile creation
  - Goals
  - Meals
  - Weight entries
  - Weekly summaries
  - Offline sync queue
- Added Firebase security rules:
  - `firestore.rules`
  - `storage.rules`
- Added Firebase Functions Gemini proxy scaffold.
- Kept Gemini API key out of the mobile app.
- Added structured Gemini output validation with Zod.
- Added text meal logging.
- Added photo upload from image library.
- Removed camera capture based on updated requirement.
- Removed camera permission from Expo Android config.
- Added Dashboard with:
  - Calories
  - Calories remaining
  - Protein
  - Carbs
  - Fat
  - Weight
  - Quick meal logging
  - Photo upload
  - Weekly progress
- Added meal history screen.
- Added weight tracking screen.
- Added goals editing screen.
- Added weekly summary screen.
- Added AI coach screen.
- Added NativeWind setup.
- Added Zustand local store for transient app state.
- Added TanStack Query hooks with cache and invalidation.
- Added React Hook Form usage for meal, goals, and weight forms.
- Added offline cache and queued retry writes for meals, goals, and weights.
- Installed npm dependencies successfully.
- Added Expo ESLint configuration and pointed linting at this React Navigation project structure.
- Fixed the TypeScript issues found during the first validation pass.
- `npm run typecheck` passes.
- `npm run lint` passes.
- Firebase Function dependencies were installed.
- `cd functions && npm run build` passes.
- Added production polish (ErrorBoundary, Pull-to-refresh on scrollable screens, Initial Loading states, field-level react-hook-form validations, accessibility roles and labels).
- Added local Sandbox fallback mode support in auth, repositories, and AI client so the app runs fully client-side and simulated without active Firebase or Gemini credentials.

## Pending

- Verify the Expo app in a development build:
  - `npm run android`
- Configure real Firebase project values in `.env`.
- Configure Google OAuth client and SHA fingerprints for Android.
- Deploy Firestore and Storage rules.
- Deploy the Gemini proxy Firebase Function.
- Set `GEMINI_API_KEY` as a Firebase Functions secret.
- Test Google Sign-In on device/emulator.
- Test Firestore writes for:
  - User profile
  - Goals
  - Meals
  - Weight entries
- Test image upload to Firebase Storage.
- Test Gemini meal analysis through the proxy.
- Test Gemini clarification flow before saving meals.
- Test AI coach responses using real user context.
- Test offline cache and sync retry behavior.
- Add app icons and splash assets.
- Decide whether Firebase Auth persistence should be upgraded from the current `getAuth` fallback once the installed Firebase RN persistence export path is confirmed at runtime.
- Add production polish:
  - Loading states per screen
  - Empty states
  - Pull-to-refresh
  - Better form validation messages
  - Accessibility labels
  - Error boundary

## Important Findings

- The app does not need camera capture. It now supports text logging and photo upload from the image library only.
- `expo-camera` is not needed and was not included.
- Android camera permission was removed.
- The app uses native Google Sign-In, so it should run through an Expo development build, not plain Expo Go.
- `npm install` completed successfully after aligning Expo SDK 57 package versions.
- `npm install` reported 11 moderate npm audit vulnerabilities. These are dependency-tree findings and still need review.
- `functions/npm install` reported 9 moderate npm audit vulnerabilities. These are dependency-tree findings and still need review.
- The original app typecheck failures were fixed:
  - Removed top-level `splash` config and kept `backgroundColor` until real splash assets are added.
  - Replaced broad `Object.values(nextGoals)` validation with explicit numeric goal fields.
  - Allowed `TextField.error` to be explicitly `undefined` under strict optional property typing.
  - Replaced the unavailable `getReactNativePersistence` import with a deliberate `getAuth` fallback.
- Expo's generated lint command expected an `app/` directory. This project uses React Navigation, so the lint script now targets `App.tsx`, `index.ts`, `app.config.ts`, and `src`.
- Auto-opening the image picker from a navigation effect triggered a React lint rule. The flow is now explicit: Dashboard opens the Log screen, and the user taps `Upload photo`.

## Suggested Next Implementation Order

1. Create Firebase project configuration and `.env`.
2. Set up Google OAuth client and Android SHA fingerprints.
3. Set `GEMINI_API_KEY` as a Firebase Functions secret.
4. Deploy Firestore rules, Storage rules, and the Gemini proxy.
5. Run the app in an Expo Android development build.
6. Test auth, meal logging, photo upload, goals, weight, weekly summary, coach, and offline sync end to end.
