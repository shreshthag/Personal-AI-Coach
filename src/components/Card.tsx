import type { PropsWithChildren } from "react";
import { View, type ViewProps } from "react-native";

type CardProps = PropsWithChildren<ViewProps & {
  className?: string;
}>;

export function Card({ children, className = "", ...props }: CardProps) {
  return (
    <View
      className={`rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
      {...props}
    >
      {children}
    </View>
  );
}

