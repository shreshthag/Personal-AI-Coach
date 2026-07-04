import type { PropsWithChildren } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ScreenShellProps = PropsWithChildren<{
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}>;

export function ScreenShell({ children, scroll = true, refreshing = false, onRefresh }: ScreenShellProps) {
  const content = scroll ? (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 px-4 pb-8 pt-3"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#1E6B57"]} // leaf green color in defaults/theme
            tintColor="#1E6B57"
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View className="flex-1 gap-4 px-4 pb-8 pt-3">{children}</View>
  );

  return (
    <SafeAreaView className="flex-1 bg-oat dark:bg-zinc-950" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

