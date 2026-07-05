import { Ionicons } from "@expo/vector-icons";
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useColorScheme } from "react-native";

import { LoadingState } from "../components/LoadingState";
import { palette } from "../constants/theme";
import { AuthScreen } from "../screens/AuthScreen";
import { CoachScreen } from "../screens/CoachScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { GoalsScreen } from "../screens/GoalsScreen";
import { LogMealScreen } from "../screens/LogMealScreen";
import { MealHistoryScreen } from "../screens/MealHistoryScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { WeeklySummaryScreen } from "../screens/WeeklySummaryScreen";
import { WeightScreen } from "../screens/WeightScreen";
import type { AppTabParamList, RootStackParamList } from "../types/navigation";
import { useAuth } from "../hooks/useAuth";
import { useBodyProfile, useCoachSetup } from "../hooks/useUserProfile";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<AppTabParamList>();

const iconNames: Record<keyof AppTabParamList, keyof typeof Ionicons.glyphMap> = {
  Dashboard: "home-outline",
  LogMeal: "add-circle-outline",
  History: "list-outline",
  Weight: "scale-outline",
  Coach: "sparkles-outline"
};

function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.light.primary,
        tabBarInactiveTintColor: "#7A857E",
        tabBarStyle: {
          borderTopWidth: 0,
          elevation: 0
        },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={iconNames[route.name]} size={size} color={color} />
        )
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="LogMeal" component={LogMealScreen} options={{ title: "Log" }} />
      <Tab.Screen name="History" component={MealHistoryScreen} />
      <Tab.Screen name="Weight" component={WeightScreen} />
      <Tab.Screen name="Coach" component={CoachScreen} />
    </Tab.Navigator>
  );
}

function navigationTheme(isDark: boolean): Theme {
  const base = isDark ? DarkTheme : DefaultTheme;
  const colors = isDark ? palette.dark : palette.light;

  return {
    ...base,
    colors: {
      ...base.colors,
      background: colors.background,
      card: colors.card,
      text: colors.text,
      primary: colors.primary,
      border: colors.border
    }
  };
}

export function RootNavigator() {
  const { user, initializing } = useAuth();
  const colorScheme = useColorScheme();
  const setup = useCoachSetup();
  const profile = useBodyProfile();

  if (initializing) {
    return <LoadingState label="Preparing your tracker" />;
  }

  if (user && (setup.isLoading || profile.isLoading)) {
    return <LoadingState label="Preparing your tracker" />;
  }

  const needsOnboarding =
    Boolean(user) && (!setup.data?.coachName || !setup.data?.persona || !profile.data);

  return (
    <NavigationContainer theme={navigationTheme(colorScheme === "dark")}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : needsOnboarding ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          <>
            <Stack.Screen name="AppTabs" component={AppTabs} />
            <Stack.Screen name="Goals" component={GoalsScreen} options={{ presentation: "modal" }} />
            <Stack.Screen
              name="WeeklySummary"
              component={WeeklySummaryScreen}
              options={{ presentation: "modal" }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
