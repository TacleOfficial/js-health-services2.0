import { goalLabels } from "./questions";
import type { RecommendationReason } from "./types";

export function recommendationReasonCopy(reason: RecommendationReason) {
  switch (reason.code) {
    case "primary-goal": return `Matches your primary focus: ${reason.goal ? goalLabels[reason.goal] : "Your goals"}`;
    case "secondary-goal": return `Supports your secondary focus: ${reason.goal ? goalLabels[reason.goal] : "Your selected goal"}`;
    case "available": return "Available in the current fictional catalog";
    case "injectable-format": return "Matches the current injectable format";
    case "multiple-goals": return "Includes support for multiple selected goals";
  }
}
