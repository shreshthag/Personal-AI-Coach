import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

import type { FoodItem } from "../models/nutrition";

export function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function readNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function readRecord(snapshot: QueryDocumentSnapshot<DocumentData>): Record<string, unknown> {
  return snapshot.data() as Record<string, unknown>;
}

export function parseFoodItems(value: unknown): FoodItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
    return {
      name: readString(record.name, "Unknown food"),
      quantity: readString(record.quantity, "1 serving"),
      calories: readNumber(record.calories),
      protein: readNumber(record.protein),
      carbs: readNumber(record.carbs),
      fat: readNumber(record.fat),
      confidence: readNumber(record.confidence, 0.5)
    };
  });
}
