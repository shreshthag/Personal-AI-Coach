import { ActivityIndicator, View } from "react-native";

import { AppText } from "./AppText";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-3 p-6">
      <ActivityIndicator color="#1E6B57" />
      <AppText variant="caption">{label}</AppText>
    </View>
  );
}
