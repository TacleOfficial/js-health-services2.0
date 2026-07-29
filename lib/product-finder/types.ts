export type ProductGoal =
  | "weight-management"
  | "collagen-skin"
  | "tendon-ligament-recovery"
  | "general-wellness";

export type PrimaryGoal = ProductGoal | "not-sure";
export type ProductFormat = "injectable";
export type WeightLossRange = "1-15" | "16-30" | "31-50" | "51-plus" | "not-sure";
export type SurveyPhase = "goals" | "preferences" | "eligibility" | "recommendation";

export type ProductFinderAnswers = {
  primaryGoal?: PrimaryGoal;
  secondaryGoals: ProductGoal[];
  goalDetail?: string;
  motivations: string[];
  ageEligible?: boolean;
  preferredFormat: ProductFormat;
  budget?: number;
};

export type RecommendationMetadata = {
  productId: string;
  primaryGoals: ProductGoal[];
  secondaryGoals: ProductGoal[];
  format: ProductFormat;
  goalDetailTags: string[];
  weightLossRanges?: WeightLossRange[];
  recommendationRank: number;
  bundleEligible: boolean;
};

export type ProductBundle = {
  id: string;
  slug: string;
  name: string;
  description: string;
  productIds: string[];
  primaryGoals: ProductGoal[];
  supportedSecondaryGoals: ProductGoal[];
  discountType: "percentage" | "fixed";
  discountValue: number;
  active: boolean;
  recommendationRank: number;
};

export type RecommendationReasonCode =
  | "primary-goal"
  | "secondary-goal"
  | "available"
  | "injectable-format"
  | "multiple-goals";

export type RecommendationReason = {
  code: RecommendationReasonCode;
  goal?: ProductGoal;
};

export type ProductFinderRecommendation = {
  primaryProductId: string | null;
  supportingBundleId: string | null;
  alternativeProductIds: string[];
  reasons: RecommendationReason[];
  noMatchReason?: "ineligible" | "no-primary-goal" | "no-confident-match";
};

export type SurveyStepId =
  | "welcome"
  | "primary-goal"
  | "secondary-goals"
  | "goal-detail"
  | "testimonial-one"
  | "motivation"
  | "eligibility"
  | "testimonial-two"
  | "recommendation-loading"
  | "recommendation";

export type PersistedSurveyState = {
  version: 1;
  currentStepId: SurveyStepId;
  primaryGoal?: PrimaryGoal;
  secondaryGoals: ProductGoal[];
  goalDetail?: string;
  motivations: string[];
  ageEligible?: boolean;
  updatedAt: string;
};
