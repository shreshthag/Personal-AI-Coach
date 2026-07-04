import type { NavigatorScreenParams } from "@react-navigation/native";

export type MealLogMode = "text" | "library";

export type AppTabParamList = {
  Dashboard: undefined;
  LogMeal: { mode?: MealLogMode } | undefined;
  History: undefined;
  Weight: undefined;
  Coach: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  AppTabs: NavigatorScreenParams<AppTabParamList>;
  Goals: undefined;
  WeeklySummary: undefined;
};
