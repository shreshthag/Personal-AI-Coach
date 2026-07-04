import type { TextInputProps } from "react-native";
import { TextInput, View } from "react-native";

import { AppText } from "./AppText";

type TextFieldProps = TextInputProps & {
  label: string;
  error?: string | undefined;
  className?: string;
};

export function TextField({ label, error, className = "", ...props }: TextFieldProps) {
  return (
    <View className={`gap-2 ${className}`}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ? `Error: ${error}` : undefined}
        {...props}
        placeholderTextColor="#8A968E"
        className="min-h-12 rounded-lg border border-zinc-200 bg-white px-3 text-base text-ink dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
      />
      {error ? (
        <AppText variant="caption" className="text-red-700 dark:text-red-300" accessibilityLiveRegion="assertive">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
