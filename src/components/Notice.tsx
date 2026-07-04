import { AppText } from "./AppText";
import { Card } from "./Card";

type NoticeProps = {
  title: string;
  message: string;
  tone?: "info" | "error" | "success";
};

const toneClassName: Record<NonNullable<NoticeProps["tone"]>, string> = {
  info: "border-leaf/20 bg-mint dark:bg-zinc-900",
  error: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950",
  success: "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
};

export function Notice({ title, message, tone = "info" }: NoticeProps) {
  return (
    <Card className={toneClassName[tone]}>
      <AppText variant="label">{title}</AppText>
      <AppText variant="caption" className="mt-1">
        {message}
      </AppText>
    </Card>
  );
}
