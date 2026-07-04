export function formatCalories(value: number): string {
  return `${Math.round(value).toLocaleString()} kcal`;
}

export function formatMacro(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} g`;
}

export function formatWeight(value: number | null): string {
  return value === null ? "Not logged" : `${value.toFixed(1)} kg`;
}

export function clampPercent(value: number, target: number): number {
  if (target <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}
