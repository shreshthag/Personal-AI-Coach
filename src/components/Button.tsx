import { ActivityIndicator, Pressable, type PressableProps } from "react-native";

import { AppText } from "./AppText";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = PressableProps & {
  title: string;
  loading?: boolean;
  variant?: ButtonVariant;
  className?: string;
};

const variantClassName: Record<ButtonVariant, string> = {
  primary: "bg-leaf",
  secondary: "bg-clay",
  ghost: "border border-zinc-300 bg-transparent dark:border-zinc-700",
  danger: "bg-red-700"
};

const textClassName: Record<ButtonVariant, string> = {
  primary: "text-white",
  secondary: "text-white",
  ghost: "text-ink dark:text-zinc-100",
  danger: "text-white"
};

export function Button({
  title,
  loading = false,
  variant = "primary",
  disabled,
  className = "",
  ...props
}: ButtonProps) {
  const isDisabled = Boolean(disabled || loading);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={props.accessibilityLabel ?? title}
      {...props}
      disabled={isDisabled}
      className={`min-h-12 items-center justify-center rounded-lg px-4 ${variantClassName[variant]} ${
        isDisabled ? "opacity-55" : "opacity-100"
      } ${className}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === "ghost" ? "#1E6B57" : "#FFFFFF"} />
      ) : (
        <AppText variant="label" className={`text-center ${textClassName[variant]}`}>
          {title}
        </AppText>
      )}
    </Pressable>
  );
}
