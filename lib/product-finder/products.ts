import type { RecommendationMetadata } from "./types";

export const recommendationMetadata: RecommendationMetadata[] = [
  { productId: "p1", primaryGoals: ["weight-management"], secondaryGoals: ["general-wellness"], format: "injectable", goalDetailTags: ["16-30", "31-50", "51-plus"], weightLossRanges: ["16-30", "31-50", "51-plus"], recommendationRank: 10, bundleEligible: true },
  { productId: "p6", primaryGoals: ["weight-management"], secondaryGoals: ["general-wellness"], format: "injectable", goalDetailTags: ["1-15", "not-sure"], weightLossRanges: ["1-15", "not-sure"], recommendationRank: 20, bundleEligible: true },
  { productId: "p2", primaryGoals: ["collagen-skin"], secondaryGoals: ["general-wellness"], format: "injectable", goalDetailTags: ["skin-appearance", "multiple-areas"], recommendationRank: 10, bundleEligible: true },
  { productId: "p9", primaryGoals: ["collagen-skin"], secondaryGoals: ["general-wellness"], format: "injectable", goalDetailTags: ["hair-nails", "general-collagen", "not-sure"], recommendationRank: 20, bundleEligible: true },
  { productId: "p3", primaryGoals: ["tendon-ligament-recovery"], secondaryGoals: ["general-wellness"], format: "injectable", goalDetailTags: ["tendon-support", "ligament-support", "both"], recommendationRank: 10, bundleEligible: true },
  { productId: "p7", primaryGoals: ["tendon-ligament-recovery"], secondaryGoals: ["general-wellness"], format: "injectable", goalDetailTags: ["mobility-recovery", "not-sure"], recommendationRank: 20, bundleEligible: true },
  { productId: "p4", primaryGoals: ["general-wellness"], secondaryGoals: ["collagen-skin", "tendon-ligament-recovery"], format: "injectable", goalDetailTags: ["everyday-energy", "recovery-resilience"], recommendationRank: 10, bundleEligible: true },
  { productId: "p10", primaryGoals: ["general-wellness"], secondaryGoals: ["weight-management"], format: "injectable", goalDetailTags: ["overall-wellness", "healthy-aging", "not-sure"], recommendationRank: 20, bundleEligible: true },
  { productId: "p8", primaryGoals: ["weight-management"], secondaryGoals: ["tendon-ligament-recovery"], format: "injectable", goalDetailTags: ["not-sure"], recommendationRank: 40, bundleEligible: false },
  { productId: "p12", primaryGoals: ["tendon-ligament-recovery"], secondaryGoals: ["collagen-skin"], format: "injectable", goalDetailTags: ["not-sure"], recommendationRank: 40, bundleEligible: false },
  { productId: "p11", primaryGoals: ["general-wellness"], secondaryGoals: ["collagen-skin"], format: "injectable", goalDetailTags: ["not-sure"], recommendationRank: 40, bundleEligible: false },
];

export const surveyProductCopy: Record<string, { descriptor: string; supports: string[] }> = {
  p1: { descriptor: "A focused fictional option for weight-management routines.", supports: ["Weight-management goals", "Consistent wellness routines"] },
  p6: { descriptor: "A broad fictional weight-management alternative.", supports: ["Everyday routines", "Weight-management support"] },
  p2: { descriptor: "A fictional option positioned for collagen and appearance support.", supports: ["Skin appearance", "Collagen support"] },
  p9: { descriptor: "A broad fictional collagen-support alternative.", supports: ["Hair and nail appearance", "General collagen support"] },
  p3: { descriptor: "A fictional option positioned around recovery and mobility support.", supports: ["Tendon and ligament recovery support", "Mobility routines"] },
  p7: { descriptor: "A broad fictional recovery-support alternative.", supports: ["Everyday mobility", "Recovery routines"] },
  p4: { descriptor: "A fictional option for a balanced everyday wellness routine.", supports: ["Everyday energy", "Recovery and resilience"] },
  p10: { descriptor: "A broad fictional general-wellness alternative.", supports: ["Overall wellness", "Healthy-aging support"] },
};
