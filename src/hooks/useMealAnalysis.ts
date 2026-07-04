import { useMutation } from "@tanstack/react-query";

import { analyzeMeal } from "../services/gemini/geminiClient";

export function useMealAnalysis() {
  return useMutation({
    mutationFn: analyzeMeal
  });
}
