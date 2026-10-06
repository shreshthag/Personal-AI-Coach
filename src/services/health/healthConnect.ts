// Samsung Health is the writer here — the watch syncs its steps, sleep, workouts and
// scale readings into Samsung Health, and Health Connect is the read surface this app
// uses to pull that data back out. Samsung's own SDK isn't an option: it requires
// partner approval this app doesn't have, so Health Connect is the only route in.
import {
  ExerciseType,
  SdkAvailabilityStatus,
  aggregateGroupByPeriod,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission
} from "react-native-health-connect";
import type { AggregateResult, AggregateResultRecordType, Permission } from "react-native-health-connect";

import type { HealthDayTotals, HealthSnapshot, HealthStatus, HealthWorkout } from "../../models/health";
import type { DateKey } from "../../models/nutrition";
import { fromDateKey, lastDateKeys, toDateKey } from "../../utils/date";

export const HEALTH_READ_PERMISSIONS: Permission[] = [
  { accessType: "read", recordType: "Steps" },
  { accessType: "read", recordType: "ActiveCaloriesBurned" },
  { accessType: "read", recordType: "TotalCaloriesBurned" },
  { accessType: "read", recordType: "SleepSession" },
  { accessType: "read", recordType: "ExerciseSession" },
  { accessType: "read", recordType: "Weight" },
  { accessType: "read", recordType: "BodyFat" }
];

const exerciseTypeNames: Record<number, string> = Object.fromEntries(
  Object.entries(ExerciseType).map(([name, value]) => [value, name.toLowerCase()])
);

export async function getHealthStatus(): Promise<HealthStatus> {
  const sdkStatus = await getSdkStatus();
  if (sdkStatus !== SdkAvailabilityStatus.SDK_AVAILABLE) {
    return "unavailable";
  }

  await initialize();
  const granted = await getGrantedPermissions();
  const hasAllPermissions = HEALTH_READ_PERMISSIONS.every((permission) =>
    granted.some((entry) => entry.accessType === permission.accessType && entry.recordType === permission.recordType)
  );
  return hasAllPermissions ? "ok" : "denied";
}

export async function requestHealthPermissions(): Promise<HealthStatus> {
  await requestPermission(HEALTH_READ_PERMISSIONS);
  return getHealthStatus();
}

// Runs one recordType's daily aggregate and indexes it by date. Isolated in its own
// try/catch so a record type that's unsupported/unavailable on this device just leaves
// that metric's days as missing (null downstream) instead of failing the whole snapshot.
async function aggregateDailyField<T extends AggregateResultRecordType>(
  recordType: T,
  timeRangeFilter: Parameters<typeof aggregateGroupByPeriod>[0]["timeRangeFilter"],
  extract: (result: AggregateResult<T>) => number
): Promise<Map<DateKey, number>> {
  const byDate = new Map<DateKey, number>();
  try {
    const groups = await aggregateGroupByPeriod({
      recordType,
      timeRangeFilter,
      timeRangeSlicer: { period: "DAYS", length: 1 }
    });
    for (const group of groups) {
      byDate.set(toDateKey(new Date(group.startTime)), extract(group.result));
    }
  } catch {
    // metric unsupported/unavailable on this device — leave its days missing
  }
  return byDate;
}

function emptySnapshot(status: HealthStatus): HealthSnapshot {
  return {
    status,
    today: null,
    previousDays: [],
    recentWorkouts: [],
    latestWeightKg: null,
    latestBodyFatPercent: null,
    averageTotalEnergyKcal: null
  };
}

export async function readHealthSnapshot(today: DateKey, days: number): Promise<HealthSnapshot> {
  try {
    const status = await getHealthStatus();
    if (status !== "ok") {
      return emptySnapshot(status);
    }

    const dateKeys = lastDateKeys(days, today);
    const rangeStart = fromDateKey(dateKeys[0] ?? today);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = fromDateKey(today);
    rangeEnd.setHours(23, 59, 59, 999);

    const timeRangeFilter = {
      operator: "between" as const,
      startTime: rangeStart.toISOString(),
      endTime: rangeEnd.toISOString()
    };

    const [stepsByDate, activeEnergyByDate, totalEnergyByDate, sleepByDate, exerciseByDate] = await Promise.all([
      aggregateDailyField("Steps", timeRangeFilter, (result) => result.COUNT_TOTAL),
      aggregateDailyField("ActiveCaloriesBurned", timeRangeFilter, (result) =>
        Math.round(result.ACTIVE_CALORIES_TOTAL.inKilocalories)
      ),
      aggregateDailyField("TotalCaloriesBurned", timeRangeFilter, (result) => Math.round(result.ENERGY_TOTAL.inKilocalories)),
      aggregateDailyField("SleepSession", timeRangeFilter, (result) => Math.round(result.SLEEP_DURATION_TOTAL / 60)),
      aggregateDailyField("ExerciseSession", timeRangeFilter, (result) =>
        Math.round(result.EXERCISE_DURATION_TOTAL.inSeconds / 60)
      )
    ]);

    const allDays: HealthDayTotals[] = dateKeys.map((date) => ({
      date,
      steps: stepsByDate.get(date) ?? null,
      activeEnergyKcal: activeEnergyByDate.get(date) ?? null,
      totalEnergyKcal: totalEnergyByDate.get(date) ?? null,
      sleepMinutes: sleepByDate.get(date) ?? null,
      exerciseMinutes: exerciseByDate.get(date) ?? null
    }));

    const todayTotals = allDays.find((day) => day.date === today) ?? {
      date: today,
      steps: null,
      activeEnergyKcal: null,
      totalEnergyKcal: null,
      sleepMinutes: null,
      exerciseMinutes: null
    };
    const previousDays = allDays.filter((day) => day.date !== today);

    const totalEnergyValues = allDays
      .map((day) => day.totalEnergyKcal)
      .filter((value): value is number => value !== null);
    const averageTotalEnergyKcal =
      totalEnergyValues.length > 0
        ? Math.round(totalEnergyValues.reduce((sum, value) => sum + value, 0) / totalEnergyValues.length)
        : null;

    let recentWorkouts: HealthWorkout[] = [];
    try {
      const { records } = await readRecords("ExerciseSession", { timeRangeFilter, ascendingOrder: false, pageSize: 10 });
      recentWorkouts = [...records]
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
        .slice(0, 10)
        .map((record) => ({
          date: toDateKey(new Date(record.startTime)),
          type: exerciseTypeNames[record.exerciseType] ?? "workout",
          minutes: Math.round((new Date(record.endTime).getTime() - new Date(record.startTime).getTime()) / 60000)
        }));
    } catch {
      recentWorkouts = [];
    }

    let latestWeightKg: number | null = null;
    try {
      const { records } = await readRecords("Weight", { timeRangeFilter, ascendingOrder: false, pageSize: 1 });
      const record = records[0];
      latestWeightKg = record ? Math.round(record.weight.inKilograms * 10) / 10 : null;
    } catch {
      latestWeightKg = null;
    }

    let latestBodyFatPercent: number | null = null;
    try {
      const { records } = await readRecords("BodyFat", { timeRangeFilter, ascendingOrder: false, pageSize: 1 });
      const record = records[0];
      latestBodyFatPercent = record ? Math.round(record.percentage * 10) / 10 : null;
    } catch {
      latestBodyFatPercent = null;
    }

    return {
      status: "ok",
      today: todayTotals,
      previousDays,
      recentWorkouts,
      latestWeightKg,
      latestBodyFatPercent,
      averageTotalEnergyKcal
    };
  } catch {
    return emptySnapshot("unavailable");
  }
}
