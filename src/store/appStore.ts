import { create } from "zustand";

import { toDateKey } from "../utils/date";

type AppState = {
  selectedDate: string;
  lastCoachQuestion: string;
  setSelectedDate: (date: string) => void;
  setLastCoachQuestion: (question: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  selectedDate: toDateKey(),
  lastCoachQuestion: "",
  setSelectedDate: (date) => set({ selectedDate: date }),
  setLastCoachQuestion: (question) => set({ lastCoachQuestion: question })
}));
