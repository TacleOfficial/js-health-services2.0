"use client";

import { createSupabaseBrowserClient } from "../supabase/client";
import type { SurveyPhase, SurveyStepId } from "./types";

export type ProductFinderEventName =
  | "product_finder_started" | "product_finder_question_viewed" | "product_finder_answered"
  | "product_finder_back" | "product_finder_abandoned" | "product_finder_testimonial_viewed"
  | "product_finder_eligibility_failed" | "product_finder_completed"
  | "product_recommendation_viewed" | "recommended_bundle_added" | "recommendation_changed";

type SafeMetadata = { stepPosition?: number; resultType?: "product" | "bundle" | "no-match"; completionStatus?: "completed" | "abandoned"; bundleAdded?: boolean };

export async function trackProductFinderEvent(event: {
  name: ProductFinderEventName; sessionId: string; stepId?: SurveyStepId; phase?: SurveyPhase; metadata?: SafeMetadata;
}) {
  try {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.from("product_finder_events").insert({
      anonymous_session_id: event.sessionId, event_name: event.name, survey_version: "1",
      step_id: event.stepId, phase: event.phase, result_type: event.metadata?.resultType,
    });
  } catch {
    // Analytics is intentionally best-effort and must never block the survey.
  }
}
