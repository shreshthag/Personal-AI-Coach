import type { PropsWithChildren } from "react";
import type { TextProps } from "react-native";
import { Text } from "react-native";

type AppTextProps = PropsWithChildren<
  TextProps & {
    variant?: "title" | "subtitle" | "body" | "caption" | "label";
    className?: string;
  }
>;

const variantClassName: Record<NonNullable<AppTextProps["variant"]>, string> = {
  title: "text-3xl font-bold text-ink dark:text-zinc-50",
  subtitle: "text-xl font-bold text-ink dark:text-zinc-50",
  body: "text-base text-ink dark:text-zinc-100",
  caption: "text-sm text-zinc-600 dark:text-zinc-400",
  label: "text-sm font-semibold text-zinc-700 dark:text-zinc-300"
};

export function AppText({ children, variant = "body", className = "", ...props }: AppTextProps) {
  return (
    <Text {...props} className={`${variantClassName[variant]} ${className}`}>
      {children}
    </Text>
  );
}
