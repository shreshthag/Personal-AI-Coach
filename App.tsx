import "./global.css";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { AppState, Platform } from "react-native";

import { AuthProvider } from "./src/services/firebase/AuthProvider";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { useNetworkSync } from "./src/hooks/useNetworkSync";
import { ErrorBoundary } from "./src/components/ErrorBoundary";

function AppBootstrap() {
  useNetworkSync();
  return <RootNavigator />;
}

export default function App() {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            // Queries seed `initialData` (e.g. default goals) so screens render
            // instantly, but React Query counts initialData as fresh, so within
            // staleTime it would skip the mount fetch and leave the defaults on
            // screen until a manual refresh. Always refetch on mount so app open
            // loads the real stored values.
            refetchOnMount: "always",
            retry: 1
          },
          mutations: {
            retry: 0
          }
        }
      }),
    []
  );

  useEffect(() => {
    // React Native fires no window-focus event, so React Query never treats an app
    // resume as a focus and stale queries (goals, meals) linger until a manual pull
    // to refresh — which let a stale goal reach the dashboard and the coach's prompt.
    // Bridge AppState "active" into focusManager so returning to the foreground
    // refetches anything past its staleTime.
    const subscription = AppState.addEventListener("change", (status) => {
      if (Platform.OS !== "web") {
        focusManager.setFocused(status === "active");
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="auto" />
          <AppBootstrap />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

