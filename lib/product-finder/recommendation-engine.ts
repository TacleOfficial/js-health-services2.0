import type { Product } from "../types";
import type { ProductBundle, ProductFinderAnswers, ProductFinderRecommendation, RecommendationMetadata } from "./types";

export function getProductFinderRecommendation({
  answers, products, recommendationMetadata, bundles,
}: {
  answers: ProductFinderAnswers;
  products: Product[];
  recommendationMetadata: RecommendationMetadata[];
  bundles: ProductBundle[];
}): ProductFinderRecommendation {
  const empty = (noMatchReason: ProductFinderRecommendation["noMatchReason"]): ProductFinderRecommendation => ({
    primaryProductId: null, supportingBundleId: null, alternativeProductIds: [], reasons: [], noMatchReason,
  });
  if (answers.ageEligible !== true) return empty("ineligible");
  if (!answers.primaryGoal) return empty("no-primary-goal");

  const available = new Map(products.filter((product) => product.status !== "Temporarily unavailable").map((product) => [product.id, product]));
  const broad = answers.primaryGoal === "not-sure";
  const candidates = recommendationMetadata
    .filter((metadata) => available.has(metadata.productId) && metadata.format === "injectable")
    .filter((metadata) => broad ? metadata.primaryGoals.includes("general-wellness") : metadata.primaryGoals.includes(answers.primaryGoal as Exclude<typeof answers.primaryGoal, "not-sure">))
    .map((metadata) => {
      const product = available.get(metadata.productId)!;
      const detailScore = answers.goalDetail && metadata.goalDetailTags.includes(answers.goalDetail) ? -20 : 0;
      const secondaryScore = -10 * answers.secondaryGoals.filter((goal) => metadata.secondaryGoals.includes(goal)).length;
      const stockScore = product.status === "Low stock" ? 5 : 0;
      const budgetScore = answers.budget !== undefined && product.variants[0].price > answers.budget ? 100 : 0;
      return { metadata, score: metadata.recommendationRank + detailScore + secondaryScore + stockScore + budgetScore };
    })
    .sort((a, b) => a.score - b.score || a.metadata.productId.localeCompare(b.metadata.productId));

  if (!candidates.length) return empty("no-confident-match");
  const primary = candidates[0].metadata;
  const validBundles = bundles
    .filter((bundle) => bundle.active && bundle.productIds.length <= 3)
    .filter((bundle) => bundle.productIds.every((id) => available.has(id) && recommendationMetadata.find((meta) => meta.productId === id)?.format === "injectable"))
    .filter((bundle) => !broad && bundle.primaryGoals.includes(answers.primaryGoal as Exclude<typeof answers.primaryGoal, "not-sure">))
    .filter((bundle) => bundle.supportedSecondaryGoals.some((goal) => answers.secondaryGoals.includes(goal)))
    .sort((a, b) => a.recommendationRank - b.recommendationRank || a.id.localeCompare(b.id));

  return {
    primaryProductId: primary.productId,
    supportingBundleId: validBundles[0]?.id ?? null,
    alternativeProductIds: candidates.slice(1, 3).map((candidate) => candidate.metadata.productId),
    reasons: [
      { code: "primary-goal", goal: primary.primaryGoals[0] },
      ...(answers.secondaryGoals.length ? [{ code: "secondary-goal" as const, goal: answers.secondaryGoals[0] }] : []),
      { code: "available" }, { code: "injectable-format" },
      ...(validBundles.length ? [{ code: "multiple-goals" as const }] : []),
    ],
  };
}
