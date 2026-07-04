export const queryKeys = {
  goals: (uid: string) => ["goals", uid] as const,
  dailyMeals: (uid: string, date: string) => ["dailyMeals", uid, date] as const,
  weights: (uid: string, startDate: string, endDate: string) =>
    ["weights", uid, startDate, endDate] as const,
  weeklySummary: (uid: string, endDate: string) => ["weeklySummary", uid, endDate] as const
};
