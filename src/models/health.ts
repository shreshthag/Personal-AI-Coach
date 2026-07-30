import type { DateKey } from "./nutrition";

export type HealthDayTotals = {
  date: DateKey;
  steps: number | null;
  activeEnergyKcal: number | null;
  totalEnergyKcal: number | null;
  sleepMinutes: number | null;
  exerciseMinutes: number | null;
};

export type HealthWorkout = {
  date: DateKey;
  type: string;
  minutes: number;
};

// "unavailable" means Health Connect is missing or needs updating (any emulator without it,
// for instance); "denied" means the user has not granted the read permissions yet.
export type HealthStatus = "ok" | "unavailable" | "denied";

export type HealthSnapshot = {
  status: HealthStatus;
  today: HealthDayTotals | null;
  previousDays: HealthDayTotals[];
  recentWorkouts: HealthWorkout[];
  latestWeightKg: number | null;
  latestBodyFatPercent: number | null;
  // Mean measured total energy burned across days that reported it — a real TDEE, as opposed
  // to the activity-multiplier estimate in computeTargets.
  averageTotalEnergyKcal: number | null;
};
