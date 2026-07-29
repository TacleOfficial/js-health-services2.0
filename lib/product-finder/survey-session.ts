import { productGoals, surveySteps } from "./questions";
import type { PersistedSurveyState, PrimaryGoal, ProductGoal } from "./types";

export const surveySessionKey = "velle-product-finder-v1";
const primaryGoals = [...productGoals, "not-sure"] as PrimaryGoal[];

export function parseSurveySession(value: string | null): PersistedSurveyState | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const state = parsed as Partial<PersistedSurveyState> & Record<string, unknown>;
    if (state.version !== 1 || !state.currentStepId || !surveySteps.includes(state.currentStepId)) return null;
    if (!Array.isArray(state.secondaryGoals) || !Array.isArray(state.motivations) || typeof state.updatedAt !== "string") return null;
    if (state.primaryGoal && !primaryGoals.includes(state.primaryGoal)) return null;
    const secondaryGoals = state.secondaryGoals.filter((goal): goal is ProductGoal => typeof goal === "string" && productGoals.includes(goal as ProductGoal)).slice(0, 2);
    return {
      version: 1, currentStepId: state.currentStepId, primaryGoal: state.primaryGoal,
      secondaryGoals: secondaryGoals.filter((goal) => goal !== state.primaryGoal),
      goalDetail: typeof state.goalDetail === "string" ? state.goalDetail : undefined,
      motivations: state.motivations.filter((value): value is string => typeof value === "string").slice(0, 7),
      ageEligible: typeof state.ageEligible === "boolean" ? state.ageEligible : undefined,
      updatedAt: state.updatedAt,
    };
  } catch { return null; }
}

export function serializeSurveySession(state: PersistedSurveyState) {
  return JSON.stringify(state);
}

export function resetForPrimaryGoal(state: PersistedSurveyState, primaryGoal: PrimaryGoal): PersistedSurveyState {
  return { ...state, primaryGoal, secondaryGoals: state.secondaryGoals.filter((goal) => goal !== primaryGoal), goalDetail: undefined, ageEligible: undefined, updatedAt: new Date().toISOString() };
}
