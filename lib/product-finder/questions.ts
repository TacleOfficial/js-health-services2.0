import type { PrimaryGoal, ProductGoal, SurveyPhase, SurveyStepId } from "./types";

export const goalLabels: Record<PrimaryGoal, string> = {
  "weight-management": "Weight management",
  "collagen-skin": "Collagen and skin support",
  "tendon-ligament-recovery": "Tendon or ligament recovery",
  "general-wellness": "General wellness",
  "not-sure": "I’m not sure yet",
};

export const goalDescriptions: Record<PrimaryGoal, string> = {
  "weight-management": "Explore options positioned around sustainable routines.",
  "collagen-skin": "Focus on appearance and everyday collagen support.",
  "tendon-ligament-recovery": "Explore products positioned for mobility and recovery support.",
  "general-wellness": "Build a broad, everyday wellness routine.",
  "not-sure": "Start with a broader option and explore from there.",
};

export const productGoals = Object.keys(goalLabels).filter((goal) => goal !== "not-sure") as ProductGoal[];

export const detailQuestions: Record<ProductGoal, { question: string; options: Array<{ id: string; label: string }> }> = {
  "weight-management": {
    question: "How much weight would you ideally like to lose?",
    options: [
      { id: "1-15", label: "1–15 pounds" }, { id: "16-30", label: "16–30 pounds" },
      { id: "31-50", label: "31–50 pounds" }, { id: "51-plus", label: "51+ pounds" },
      { id: "not-sure", label: "I’m not sure" },
    ],
  },
  "collagen-skin": {
    question: "What would you most like to support?",
    options: [
      { id: "skin-appearance", label: "Skin appearance" }, { id: "hair-nails", label: "Hair and nail appearance" },
      { id: "general-collagen", label: "General collagen support" }, { id: "multiple-areas", label: "Multiple areas" },
      { id: "not-sure", label: "I’m not sure" },
    ],
  },
  "tendon-ligament-recovery": {
    question: "Which area would you most like to support?",
    options: [
      { id: "tendon-support", label: "Tendon recovery support" }, { id: "ligament-support", label: "Ligament recovery support" },
      { id: "both", label: "Both" }, { id: "mobility-recovery", label: "General mobility and recovery" },
      { id: "not-sure", label: "I’m not sure" },
    ],
  },
  "general-wellness": {
    question: "What would you most like to improve?",
    options: [
      { id: "everyday-energy", label: "Everyday energy" }, { id: "recovery-resilience", label: "Recovery and resilience" },
      { id: "overall-wellness", label: "Overall wellness" }, { id: "healthy-aging", label: "Healthy-aging support" },
      { id: "not-sure", label: "I’m not sure" },
    ],
  },
};

export const motivationOptions = [
  ["energy", "Having more energy"], ["confidence", "Feeling more confident"],
  ["overall-wellness", "Supporting overall wellness"], ["body", "Feeling better in my body"],
  ["clothes", "Feeling better in my clothes"], ["recovery", "Supporting recovery"],
  ["something-else", "Something else"],
] as const;

export const stepPhase: Record<SurveyStepId, SurveyPhase> = {
  welcome: "goals", "primary-goal": "goals", "secondary-goals": "goals", "goal-detail": "goals",
  "testimonial-one": "preferences", motivation: "preferences", eligibility: "eligibility",
  "testimonial-two": "eligibility", "recommendation-loading": "recommendation", recommendation: "recommendation",
};

export const surveySteps = Object.keys(stepPhase) as SurveyStepId[];
