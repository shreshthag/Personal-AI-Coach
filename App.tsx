import "./global.css";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

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
    // Firestore and React Query both handle transient offline states; this keeps
    // mutation errors explicit so screens can show retry actions.
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

