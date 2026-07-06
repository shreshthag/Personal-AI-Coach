# Personal AI Nutrition Tracker Plan

## Current Status

Working Expo + React Native + TypeScript app for a single-user AI nutrition tracker,
running as a signed **release** build on a physical Android device (arm64) and emulator.
Gemini is wired up on the **paid (prepaid) Gemini API tier** and the AI coach, meal/weight
logging, web search, and AI-computed goals are all verified working end to end on device.

`npx tsc --noEmit` passes except for two known pre-existing errors (see Known Issues).

## Architecture

- **Expo SDK 57 / React Native 0.86**, New Architecture enabled, edge-to-edge enabled.
- **Gemini via Firebase AI Logic**, client-side — `getAI(firebaseApp, { backend: new GoogleAIBackend() })`
  in `src/services/gemini/geminiClient.ts`. The Developer-API (`generativelanguage`) backend is used
  directly from the app; there is **no longer a Firebase Functions proxy** in the request path
  (a `functions/` scaffold still exists but is not used by the client).
- **Model:** `gemini-2.5-flash` for meal analysis, coach chat, web search, and goal computation.
- **Data:** Firestore (`users/{uid}` doc + `goals/current` subdoc + meal/weight collections),
  Firebase Storage for meal photos, offline cache + queued-retry writes for meals/goals/weights.
- **Sandbox mode:** fully client-side fallback (uid prefixed `sandbox`) that skips Firestore/Auth
  but still reaches real Gemini when Firebase is configured. Used for local testing.
- **State:** TanStack Query (server cache) + Zustand (transient UI state) + React Hook Form.
- **Styling:** NativeWind. `Card` merges class names with `tailwind-merge` so caller overrides win.

## Done — Core MVP

- Auth flow (Google Sign-In + Sandbox mode), bottom tabs, and screens:
  Dashboard, Log Meal, Meal History, Weight, Coach, Goals modal, Weekly Summary modal, Onboarding.
- Firestore repositories: user profile, goals, meals, weight, weekly summary, offline sync queue.
- Firestore + Storage security rules (`firestore.rules`, `storage.rules`).
- Text meal logging and photo upload from image library (no camera capture by design).
- Dashboard: calories + remaining, protein/carbs/fat, weight, quick actions, weekly progress.
- Structured Gemini output validated with Zod.
- Production polish: ErrorBoundary, pull-to-refresh, loading states, field validation, a11y labels.

## Done — This Session (AI Coach + Profile + Goals)

- **AI coach chat** (`src/hooks/useCoach.ts`, `src/services/gemini/coachChat.ts`):
  - Function-calling tools: `log_meal`, `log_weight`, `delete_meal`, `delete_weight`,
    `update_goal`, `web_search`.
  - Log/weight/goal actions surface a **confirmation card**; deletes run immediately.
  - Coach writes a **natural conversational reply in the same turn as a proposal** (system-prompt
    rule) so a bare confirmation card never appears — feels like a real conversation.
  - **Web search grounding**: `web_search` is a function tool backed by a separate search-only
    Gemini call (Google Search grounding and function-calling can't be combined in one request).
    Returns grounded answers for restaurant/packaged foods, current facts, unfamiliar dishes.
  - Chat history + proposals persisted and safely restored (pending proposals become declined).
- **Coach persona + name**: 4 personas (Warm, Tough love, Witty, Clinical) with distinct
  system-prompt personalities. Set in onboarding, **editable anytime** from the Goals screen.
- **Body profile** (`heightCm`, `gender`, `age`, `activityLevel`) in `users/{uid}`, with offline
  cache mirror. Collected in onboarding; editable in the Goals screen.
- **Onboarding gate**: new users (and existing users missing a body profile) are routed through a
  single onboarding screen that collects coach name/persona, height/weight/age/gender/activity,
  and a free-text goal — then logs today's weight and computes daily targets.
- **AI-computed goal targets**: onboarding sends the profile + free-text goal to Gemini
  (`generateGoalTargets`), which returns calorie/macro targets grounded in Mifflin-St Jeor TDEE
  math but tuned to the goal wording (e.g. "recomp" → higher protein, maintenance calories).
  Falls back **silently to the local formula** (`computeTargets` in `src/utils/nutrition.ts`) on
  any failure, so onboarding can never break on a bad/offline AI response. Verified on device:
  "recomp" produced 140 g protein vs the local formula's 110 g.
- **Local goal formula** (`computeTargets` / `classifyMode`): Mifflin-St Jeor BMR × activity,
  cut −20% / bulk +10% / maintain ±0, protein 2.0/1.8/1.6 g·kg by mode, fat 25% kcal, carbs
  remainder. Used by the Goals-screen auto-fill and the coach's `update_goal` (mode-only change),
  since those aren't one-time operations.
- **Dashboard mode pill**: the current goal mode (e.g. "Recomp") shows as a tappable pill in the
  header that opens the Goals screen — mode is no longer a silent default.
- **Goals screen is now combined settings**: goals form (with macro auto-recompute when the mode
  bucket changes) + "Your profile" card + "Coach" card (name/persona).
- **Billing**: project moved to the paid prepaid Gemini tier; the app picked it up with no code
  change (same key/config). Free tier was 20 requests/day/model, which the earlier failures hit.

## Done — Bug Fixes (This Session)

- **Meal history crash** ("Cannot read property 'length' of undefined" on Prev day): `useDailyMeals`
  had no `initialData`, so uncached dates returned `undefined`. Added `initialData: []`.
- **Persona card selection had no visual feedback**: `Card` concatenated conflicting Tailwind
  classes and NativeWind resolved by CSS order, so base `bg-white` always won. `Card` now uses
  `tailwind-merge`.
- **Keyboard hid text inputs on Android**: `ScreenShell`'s `KeyboardAvoidingView` only applied on
  iOS, and edge-to-edge disables Android's `adjustResize`. Switched to `behavior="padding"` on both.

## Build / Run Notes

- Release build for device: from `android/`, `./gradlew :app:installRelease -PreactNativeArchitectures=arm64-v8a`
  with `JAVA_HOME` set to Android Studio's bundled JDK 21.
- **x86/x86_64 release build fails** on an `expo-modules-core` ↔ `react-native-worklets` 0.10.1
  native linker mismatch (undefined `worklets::` symbols). arm64 links cleanly, so device + arm64
  emulator builds work; a full multi-arch release build does not until that dep mismatch is fixed.
- Release build is signed with the **debug keystore** (Expo prebuild default) — fine for personal
  device installs, needs a real keystore before Play Store distribution.

## Known Issues / Tech Debt

- Two pre-existing `tsc` errors remain (not introduced this session, not yet fixed):
  - `src/repositories/weightRepository.ts` — `cacheWeights` not defined.
  - `src/services/firebase/config.ts` — `getReactNativePersistence` not exported by `firebase/auth`
    (currently using a `getAuth` fallback; Auth persistence upgrade still pending).
- Coach errors surface as a generic "coach request failed" message — quota/billing errors (which
  include a retry-after hint) could be surfaced distinctly. Not yet done.
- The unused `functions/` Gemini-proxy scaffold could be removed for clarity.
- npm audit reported moderate dependency-tree vulnerabilities (app + functions) — not reviewed.
- App icons / splash assets still to be added.

## Pending / Next Steps

- Remove or repurpose the unused `functions/` proxy scaffold.
- Fix the two pre-existing `tsc` errors (weightRepository cache import, Auth persistence).
- Surface quota/billing/coach errors with actionable messaging + retry.
- Add app icons and splash assets.
- Resolve the x86 release native-link failure if emulator release builds are needed.
- Generate a real release keystore before any distribution.
- Review npm audit findings.
