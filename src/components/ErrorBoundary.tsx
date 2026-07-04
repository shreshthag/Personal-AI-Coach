import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { View } from "react-native";

import { AppText } from "./AppText";
import { Button } from "./Button";
import { ScreenShell } from "./ScreenShell";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <ScreenShell scroll={false}>
          <View className="flex-1 items-center justify-center gap-6 p-6">
            <View className="items-center gap-2">
              <AppText variant="title" className="text-center text-red-600 dark:text-red-400">
                Something went wrong
              </AppText>
              <AppText variant="body" className="text-center text-zinc-600 dark:text-zinc-400">
                An unexpected error occurred in the application.
              </AppText>
            </View>

            {this.state.error?.message ? (
              <View className="w-full rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-950 dark:bg-red-950/30">
                <AppText variant="caption" className="font-mono text-red-800 dark:text-red-300">
                  {this.state.error.message}
                </AppText>
              </View>
            ) : null}

            <Button
              title="Try Again"
              onPress={this.handleReset}
              className="w-full max-w-xs"
              accessibilityLabel="Restart or reload the app after error"
            />
          </View>
        </ScreenShell>
      );
    }

    return this.props.children;
  }
}
