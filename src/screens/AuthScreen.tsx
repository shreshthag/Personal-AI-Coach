import { useState } from "react";
import { View } from "react-native";

import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Notice } from "../components/Notice";
import { ScreenShell } from "../components/ScreenShell";
import { isFirebaseConfigured, isGoogleSignInConfigured } from "../services/config/env";
import { toFriendlyError } from "../utils/errors";
import { useAuth } from "../hooks/useAuth";

export function AuthScreen() {
  const { signInWithGoogle, signInSandbox } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = isFirebaseConfigured() && isGoogleSignInConfigured();

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (signInError) {
      setError(toFriendlyError(signInError, "Google Sign-In failed. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  async function handleSandboxSignIn() {
    setError(null);
    setLoading(true);
    try {
      await signInSandbox();
    } catch (signInError) {
      setError(toFriendlyError(signInError, "Sandbox Sign-In failed. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenShell>
      <View className="min-h-[560px] justify-center gap-5">
        <View className="gap-2">
          <AppText variant="title">AI Nutrition Tracker</AppText>
          <AppText variant="body" className="text-zinc-600 dark:text-zinc-300">
            Track meals, macros, weight, and coaching insights with your own private Firebase project or locally.
          </AppText>
        </View>

        <Card className="gap-4" accessibilityLabel="Sign in options">
          <AppText variant="subtitle">Sign in</AppText>
          <AppText variant="caption">
            Use your Google account to sync your logs, or test features locally without configuration.
          </AppText>
          
          <Button
            title="Continue with Google"
            loading={loading}
            disabled={!configured}
            onPress={handleSignIn}
            accessibilityLabel="Sign in with your Google account"
          />

          <Button
            title="Continue in Sandbox Mode"
            variant={configured ? "ghost" : "primary"}
            onPress={handleSandboxSignIn}
            accessibilityLabel="Explore the tracker locally in Sandbox Mode"
          />
        </Card>

        {!configured ? (
          <Notice
            tone="info"
            title="Firebase not configured"
            message="You can click 'Continue in Sandbox Mode' to try all app features offline using local storage and simulated AI."
          />
        ) : null}

        {error ? <Notice tone="error" title="Sign-in failed" message={error} /> : null}
      </View>
    </ScreenShell>
  );
}

