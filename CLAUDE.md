# CLAUDE.md

## Git Conventions

- **NEVER add `Co-Authored-By: Claude` (or any AI attribution / "Generated with Claude Code" trailer) to commit messages or PR descriptions.** Write commit messages as the user, with no Claude/Anthropic co-author line.

## Building & Running the App (Android)

Expo **dev-client** app, **Android only** (`ios/` is not generated). Verified setup for building/running on the emulator:

- **Java:** there is no system JDK. Export `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` (Android Studio's bundled JDK 21) for any gradle/expo build.
- **SDK / emulator:** `ANDROID_HOME="$HOME/Library/Android/sdk"`. AVD is `Pixel_10_Pro` (arm64-v8a). Boot with `~/Library/Android/sdk/emulator/emulator -avd Pixel_10_Pro`, then wait until `adb shell getprop sys.boot_completed` returns `1`.
- **Run:** `npx expo run:android` (debug). **Do NOT pass `--device emulator-5554`** — expo rejects the adb serial with "Could not find device with name"; with a single running emulator, omit the flag. Builds are **arm64-only** (see PLAN.md for the x86 `react-native-worklets` link failure).
- **Dev launcher:** after install the app opens the Expo **DevLauncher**, not the app. Tap the dev-server row (`http://…:8081`) to load the JS bundle, and wait for `MainActivity` to resume before screenshotting. Metro must stay running on `:8081` for the debug build to load JS (`expo run:android` may exit after launch while leaving the dev server up).

### Stale JS bundle — the dev client silently serves a cache

**The single most misleading failure in this repo.** The installed dev client will happily run an *old* JS bundle with no error, no red screen and no warning, so your edits look like they simply had no effect — or worse, the app appears to work and you "verify" behaviour that isn't the code you just wrote.

It happens whenever the app can't reach Metro, most often because the `adb reverse` tunnel is gone (killing the `expo run:android` process tears it down, and force-stopping/relaunching the app does **not** recreate it).

Before trusting anything you observe on the emulator:

1. `adb reverse --list` must show `tcp:8081 tcp:8081`. If it's empty, `adb reverse tcp:8081 tcp:8081`.
2. Metro must actually log `Android Bundled <n>ms index.ts (<n> modules)` for the launch you just did. **No bundle line means the app never fetched your code** — reloading, force-stopping and clearing Metro's cache all fail to fix this on their own.
3. If there's still no bundle line, re-run `npx expo run:android`; that reinstalls and re-establishes the tunnel.

To positively confirm which prompt is live (JS `console.log` does **not** reach `adb logcat` — Metro owns stdout), ask the coach in-app to quote a sentence from its own system instruction back to you and compare it against the source.

### Icon / `app.config.ts` native changes — prebuild gotcha

- Changing `app.config.ts` (icon, adaptive icon, etc.) requires the `android/` native resources to be regenerated. **`expo run:android` does a non-destructive sync that does NOT regenerate the launcher icon** — the old icon persists no matter how many times you rebuild.
- `npx expo prebuild --platform android` regenerates them, **but it does a full "Clearing android" wipe that clobbers hand-tweaked native files.** This repo has custom edits in `android/settings.gradle` (macOS node-path resolver), `android/build.gradle`, `android/app/build.gradle`, `android/gradlew`, `android/gradle/gradle-daemon-jvm.properties`. After a prebuild, **`git checkout` those non-icon files** and keep only the icon resources (`res/mipmap-*`, `res/mipmap-anydpi-v26/`, and the `iconBackground` color in `res/values/colors.xml`), then rebuild with `./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a` directly — do not re-run prebuild.
- **`google-services.json` is not used** — the google-services Gradle plugin is not applied; Firebase runs entirely via the JS SDK. A "missing google-services.json" is expected, not a problem (the `.gitignore` entry is defensive).

## App Gotchas (data freshness & coach context)

- **React Query `initialData` + `staleTime` staleness trap.** React Query treats `initialData` as freshly-fetched, so within the global `staleTime` (60s, set in `App.tsx`) a query with `initialData` will **not** refetch on mount — it renders the seed value until something forces a refetch. Seeding a query's `initialData` with a hardcoded default for **user-specific** data (this bit us with `useGoals` seeding `defaultGoals` = 2200/"cut") makes the app show that default on every cold open until a manual pull-to-refresh. Two guards are in place, don't remove them: `App.tsx` sets `refetchOnMount: "always"` (mount always refetches behind the fallback) and bridges `AppState` → `focusManager` (RN has no window-focus event, so app-resume refetch must be wired manually). For user-specific data prefer **no `initialData`** + a loading state (as `useGoals` now does) over seeding a default.
- **The coach chat freezes its context at session creation.** `useCoach` builds the Gemini session once (`sessionRef.current ??= createCoachChatSession(getContext(), ...)`) and bakes `getContext()` (goals, today's meals, weights, profile) into the **system instruction**. So a goal/meal change **during** an open chat is not seen until the user starts a new chat. This is intentional: refreshing context per-turn would double-count running meal totals (the prompt tells the coach to add "today's meals plus anything logged during this chat"). If you ever need mid-chat freshness, solve the double-count first — don't just re-snapshot.
- **Never persist base64 images into AsyncStorage.** Coach chat history can contain inline image parts (food photos). `useCoach`'s `sanitizeHistoryForPersistence` strips `inlineData` (→ `[photo]`) before `saveCoachChat` so the persisted blob stays small; the live in-memory session keeps the real image. Keep that stripping if you touch coach persistence — large base64 in one AsyncStorage key risks hitting the size limit and breaking chat restore.

## Active Plans

Claude Code auto-saves approved plans to `.claude/plans/` (configured via `plansDirectory` in settings.json). Filenames don't matter — they may be cryptic. What matters is the **content** of each plan. The active plan is tracked in `.claude/plans/.active`.

### Plan Format Convention

Every plan in `.claude/plans/` must carry two trackable elements, regardless of how it was authored:

1. A `## Branches` section near the top — a table mapping each phase (or the single scope, for one-branch plans) to its branch name, plus a Status column.
2. Per-step `- [ ]` / `- [x]` checkboxes for each implementation step, so progress is trackable per the **Tracking Progress** rule below.

If a plan is saved without these (e.g. plain numbered prose with no checkboxes or Branches table), **normalize it**: add the `## Branches` table and insert a `- [ ]` checkbox under each step before treating the plan as active.

### Announcing the Current Plan

**Triggers:** at the start of every session, OR when the user says **"current plan"**, **"show current plan"**, or **"what's the current plan"**.

1. Read `.claude/plans/.active` to get the current plan filename. If missing or points to a non-existent file, fall back to the most recently modified `.md` in `.claude/plans/`.
2. **Read the active plan in full.** (Only the active one — not every plan in the directory.)
3. Announce in 2-4 sentences: **what this plan does**, **what phase/section we're in**, **what's done**, and **the next unchecked task**. Don't just name the file — describe the work.
4. If `.claude/plans/` is empty or missing, say "No active plans."

### Listing Plans

When the user says **"show plans"** or **"list plans"**:
1. List all `.md` files in `.claude/plans/`.
2. For each, read **only the first ~20 lines** (use `Read` with `limit: 20`) — enough to grab the title and intro. Do **not** read full files.
3. Show each as: title + 1-line summary. Mark which is active.
4. Wait for the user to pick one before reading anything in full.

### Switching Plans

When the user says **"switch plan"**, **"use plan <name>"**, or **"switch to <topic>"**:
1. If a name/topic is given, scan plan headers (first ~20 lines each) to match it.
2. Update `.claude/plans/.active` with the matched filename.
3. **Now** read the selected plan in full and describe it.

### Completing a Plan

When the user says **"plan complete"** or **"done with this plan"**:
1. Delete the active plan file.
2. Update `.claude/plans/.active` to the next most recent plan, or remove it if none remain.
3. Confirm.

### Implementing a Plan

When the user says **"implement current plan"**, **"start the plan"**, or similar — **do not start coding the whole plan.** Multi-phase plans span weeks; blindly executing one is unsafe. Instead:

1. Identify the next unshipped phase from the **Branches** table and checkbox state. Skip phases already marked ✅.
2. Confirm with the user that this is the phase to work on.
3. Ask which sub-task to start with. Default to the **critical path** item if the plan marks one. Otherwise suggest one and let the user pick.
4. Propose a branch name following the **Branching for Multi-Phase Plans** rule. Create the branch only after the user confirms the name.
5. Enter plan mode to design the specific sub-task before touching code. Do not skip straight to editing.

This protocol exists because "implement current plan" is almost always too broad to act on safely — the user usually means "start the next piece," not "execute everything."

### Branching for Multi-Phase Plans

Large plans with multiple phases get one branch per phase. When starting a new phase:

1. Create the branch off the main branch.
2. Update the plan file's **Branches** table with the branch name and status.
3. Work on that phase until it's shipped.

Each plan file should include a `## Branches` section near the top — a table mapping phase → branch name → status.

### Tracking Progress

Mark a checkbox `[x]` **only after** the commit for that specific step has landed — not retroactively, and not before. The workflow is: implement → commit → mark `[x]` → move to next step. Avoid retroactive git-log archaeology to fill in commit hashes or deviation notes unless the user explicitly asks.

Add brief inline notes when an implementation deviates meaningfully from the original plan.

---

## Code Writing Workflow

When writing or editing code, **always delegate to a subagent**:

1. Spin a `general-purpose` subagent with `model: "sonnet"` and effort `medium`.
2. Give it the full context: file paths, what to change and why, constraints.
3. Wait for it to finish, then **review every file it touched** before reporting the work as done.
4. If the changes are wrong or incomplete, **send corrections back to the same subagent** — all code is written by the subagent, not the main agent.

**Exception:** If the change is a few lines (e.g., adding one import, flipping a flag, fixing a typo) and spinning a subagent costs more than just doing it, make the edit directly.

This applies to all non-trivial code changes — new files, edits, refactors, bug fixes.

---

## Working Principles

These apply to every task — refactors, features, bug fixes alike.

### 1. Think Before Coding
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- Before a multi-step change, separate **substantive** edits from **cosmetic** ones and surface the cosmetic ones as a question — never default to making them.

### 2. Simplicity First
- Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

### 3. Surgical Changes
- Touch only what you must. Every changed line should trace directly to the request.
- Don't "improve" adjacent code, comments, or formatting. Specifically: don't collapse multi-line calls to single lines, don't remove blank lines between logical statements, don't re-indent unchanged code.
- Don't refactor things that aren't broken. Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- When your changes create orphans, remove imports/variables your changes made unused; do not remove pre-existing dead code unless asked.
- Don't change observable behavior as a side effect — removing a log, guard, or short-circuit IS a behavior change and needs an explicit reason.

### 4. Goal-Driven Execution
- Define success criteria. Loop until verified.
- Transform tasks into verifiable goals: "Add validation" → "write tests for invalid inputs, then make them pass."
- Run tests after changes. State explicitly when something can't be verified.

---

## Code Simplification Guidelines

When simplifying or refactoring code, **be careful with logs and comments — they are often there for a reason.**

### Comments
- Removing a `// what` (narration) comment is fine — well-named identifiers replace it.
- Removing a `// why` comment is **not** fine — that context can't be recovered from reading the code. Examples of WHY context that must survive:
  - Why a value is shaped a certain way (e.g., "array because multiple X per Y")
  - Why a step is or isn't taken (e.g., "no pubsub fan-out — same instance always")
  - Workarounds for specific bugs, race conditions, or upstream quirks
- When in doubt, keep the comment.
- **JSDoc rot patterns to avoid** — these phrases look informative but decay as the codebase evolves:
  - `"Phase X of the migration..."` — phase references are project history, not behavioral contract
  - `"Used when <flag> is false (current prod default for ...)"` — caller context belongs in the PR, not the function
  - `"currently only the X path does this"` — current-state claims become lies once a second caller arrives
  - Rule: JSDoc body should describe the function's behavior contract only — what it does and why it's shaped that way, not who calls it or what phase introduced it.

### Logs
- Before deleting any `logger.debug`/`logger.info`/etc., ask: **what does this log help diagnose in production?** Logs that capture routing decisions, IDs, branch taken, or cross-instance/cross-worker context are diagnostic — do not drop them.
- When consolidating duplicate functions, preserve any log statement that the original variant carried, even if other variants didn't have it. The asymmetry usually means someone added it after a real incident.
- Pure narration logs ("entering function X") can go; state-capturing logs (with IDs, sizes, decisions) stay.
