import type { DateKey } from "./nutrition";

export type CoachMemory = {
  id: string;
  text: string;
  createdAt: string;
  // Day the fact was learned, so the coach can say how long it has known something.
  learnedOn: DateKey;
};
