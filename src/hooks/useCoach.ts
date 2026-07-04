import { useMutation } from "@tanstack/react-query";

import type { CoachContext } from "../models/gemini";
import { askCoach } from "../services/gemini/geminiClient";

export function useCoach() {
  return useMutation({
    mutationFn: ({ question, context }: { question: string; context: CoachContext }) =>
      askCoach(question, context)
  });
}
