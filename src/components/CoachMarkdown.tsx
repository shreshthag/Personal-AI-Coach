import { Fragment } from "react";
import { Text, View } from "react-native";

import { AppText } from "./AppText";

type CoachMarkdownProps = {
  text: string;
};

type InlineRun = {
  text: string;
  bold: boolean;
};

function parseInlineRuns(text: string): InlineRun[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((run) => {
    const bold = run.startsWith("**") && run.endsWith("**");
    return { text: bold ? run.slice(2, -2) : run, bold };
  });
}

function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInlineRuns(text).map((run, index) => (
        <Fragment key={`${run.text}-${index}`}>
          {run.bold ? <Text className="font-bold">{run.text}</Text> : run.text}
        </Fragment>
      ))}
    </>
  );
}

export function CoachMarkdown({ text }: CoachMarkdownProps) {
  const lines = text.split("\n");

  return (
    <View className="gap-2">
      {lines.map((line, index) => {
        if (!line.trim()) {
          return <View key={`space-${index}`} className="h-1" />;
        }
        const bullet = line.match(/^\s*(?:-|•)\s+(.*)$/);
        if (bullet) {
          return (
            <View key={`bullet-${index}`} className="flex-row gap-2">
              <AppText variant="body">•</AppText>
              <AppText variant="body" className="flex-1">
                <InlineText text={bullet[1] ?? ""} />
              </AppText>
            </View>
          );
        }
        return (
          <AppText key={`paragraph-${index}`} variant="body">
            <InlineText text={line} />
          </AppText>
        );
      })}
    </View>
  );
}
