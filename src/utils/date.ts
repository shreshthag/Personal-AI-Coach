import type { DateKey } from "../models/nutrition";

export function toDateKey(date: Date = new Date()): DateKey {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateKey(dateKey: DateKey): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12, 0, 0);
}

export function addDays(dateKey: DateKey, offset: number): DateKey {
  const date = fromDateKey(dateKey);
  date.setDate(date.getDate() + offset);
  return toDateKey(date);
}

export function lastDateKeys(days: number, endDate: DateKey = toDateKey()): DateKey[] {
  return Array.from({ length: days }, (_, index) => addDays(endDate, index - days + 1));
}

export function formatFriendlyDate(dateKey: DateKey): string {
  return fromDateKey(dateKey).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

export function formatShortDate(dateKey: DateKey): string {
  return fromDateKey(dateKey).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}
