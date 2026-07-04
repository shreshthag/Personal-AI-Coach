import { View } from "react-native";

import { AppText } from "./AppText";
import { Card } from "./Card";

type MetricCardProps = {
  label: string;
  value: string;
  detail?: string;
};

export function MetricCard({ label, value, detail }: MetricCardProps) {
  return (
    <Card className="flex-1">
      <View className="gap-1">
        <AppText variant="caption">{label}</AppText>
        <AppText variant="subtitle">{value}</AppText>
        {detail ? <AppText variant="caption">{detail}</AppText> : null}
      </View>
    </Card>
  );
}
