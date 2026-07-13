# Personal AI Nutrition Tracker Plan

## Current Status

Working Expo + React Native + TypeScript app for a single-user AI nutrition tracker,
running as a signed **release** build on a physical Android device (arm64) and emulator.
Gemini is wired up on the **paid (prepaid) Gemini API tier** and the AI coach, meal/weight
logging, web search, and AI-computed goals are all verified working end to end on device.

`npx tsc --noEmit` passes clean.

## In Progress — Coach Chat Voice, Streaming, Rich Text + Restyle

- **Branch:** `feat/coach-chat-voice-streaming`
- **Step 1 — native speech gate:** `expo-speech-recognition` 56.0.1 is installed and configured.
  It compiled successfully against Expo SDK 57 / React Native 0.86 in an arm64 Android debug build.
  The Android manifest includes package visibility for Google speech recognition and
  `android.speech.RecognitionService`. The emulator does not expose a recognition service, so the
  runtime voice smoke test remains for the physical Android device.
- **Step 2 — streamed coach replies:** the existing coach session now streams real Gemini and
  sandbox responses into an epoch-guarded in-progress bubble, then replaces it with the
  authoritative final text. The existing proposal batch/flush behavior is unchanged. Coach output
  supports `**bold**`, bullet lists, and up to three protocol-driven quick replies, with markers
  stripped before rendering.
- **Next:** finish the voice composer and visual restyle, then verify the end-to-end coach flow on
  the emulator and physical Android device.

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

- Coach errors surface as a generic "coach request failed" message — quota/billing errors (which
  include a retry-after hint) could be surfaced distinctly. Not yet done.
- npm audit reported moderate dependency-tree vulnerabilities — not reviewed.
- Splash assets still to be added (app icon is done — leaf + fork on a green field, see below).
- **x86/x86_64 release build fails** on the `react-native-worklets` 0.10.1 native linker mismatch
  (undefined `worklets::` symbols); worklets is pulled in transitively by both `expo-modules-core`
  and `reanimated` (via nativewind). Decision: **stay arm64-only** — device + arm64 emulator build
  cleanly and x86 emulators aren't used. Revisit only if x86 emulator release builds are needed.

## Done — Fixes / Cleanup (This Session)

- **Fixed both pre-existing `tsc` errors** — `tsc --noEmit` now passes clean:
  - `weightRepository.ts` — `cacheWeights` was called but not imported; added it to the
    `offlineCache` import (the function already existed).
  - `config.ts` `getReactNativePersistence` — the RN build of `firebase/auth` exports it (Metro
    resolves that at runtime), but the default type defs omit it. Added a module augmentation
    (`src/types/firebase-auth.d.ts`) so tsc sees the export; **no runtime change**.
- **Removed the unused `functions/` Gemini-proxy scaffold** — dir deleted, `functions` block dropped
  from `firebase.json`, stale `functions/` lines removed from `.gitignore`. Nothing in `src`
  imported it (app calls Gemini client-side directly).
- **App icon** — leaf + fork mark on a green (`#2E9E5B`) field, generated at 1024px into `assets/`
  (`icon.png` full-bleed + `adaptive-icon.png` transparent foreground). Wired into `app.config.ts`
  (`icon` + `android.adaptiveIcon.foregroundImage`/`backgroundColor`). App name kept as
  "AI Nutrition Tracker".

## Done — Coach Photos + Data Freshness (This Session)

- **Attach food photos to the coach chat** (`CoachScreen.tsx`, `useCoach.ts`, `coachChat.ts`,
  `models/gemini.ts`): a 📎 button in the composer opens the photo library (library only, matching
  app design); the photo is sent to `gemini-2.5-flash` as an inline image part, so the coach
  identifies the food, estimates per-item calories/macros, and proposes `log_meal` via the normal
  confirmation card. The user bubble shows the thumbnail + optional caption. System prompt updated
  (it previously said photo logging only lived on the Log Meal screen). Base64 image data is
  **stripped from persisted chat history** (`sanitizeHistoryForPersistence`, replaced with `[photo]`)
  so it can't bloat/break AsyncStorage; the live in-memory session keeps the real image.
- **Bulking goal framing in the coach prompt** (MODE + GOALS rules): the calorie target is treated
  as a **ceiling when cutting** and a **floor/minimum when bulking**. While bulking the coach never
  tells you to stay under the target, accepts your set number as your chosen minimum (won't argue
  it's "too low for a bulk" or recompute it unless asked), and nudges you to eat more when short.
- **Data-freshness fixes** — the app showed stale/default values on open until a manual refresh:
  - **Root cause**: queries seed `initialData` (e.g. `defaultGoals` = 2200 kcal / "cut"), and
    React Query counts `initialData` as fresh, so with `staleTime: 60s` it **skipped the mount
    fetch** and left the default on screen until pull-to-refresh.
  - `App.tsx` bridges `AppState` → React Query `focusManager` (RN fires no window-focus event), so
    returning to the foreground refetches stale queries.
  - `App.tsx` sets `refetchOnMount: "always"`, so app open always refetches real values behind the
    instant fallback.
  - `useGoals` no longer seeds `defaultGoals`; Dashboard/Goals/Coach show a **loading state** (never
    the 2200/cut default) until goals load, and the Dashboard main content no longer waits on the
    slower weekly-summary query (only that section does). `useWeeklySummary` gates on goals;
    `WeeklySummaryScreen`/`OnboardingScreen` handle the now-optional data.
  - Note: the coach snapshots its context into the system prompt once at session creation (`??=`),
    so a goal change *during* an open chat needs a new chat — left as-is on purpose to avoid
    double-counting running meal totals (see CLAUDE.md gotchas).

## Pending / Next Steps

- Surface quota/billing/coach errors with actionable messaging + retry.
- Add splash assets.
- Generate a real release keystore before any distribution.
- Review npm audit findings.
