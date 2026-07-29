import type { SurveyPhase } from "@/lib/product-finder/types";

const phases: Array<{ id: SurveyPhase; label: string }> = [
  { id: "goals", label: "Your goals" }, { id: "preferences", label: "Preferences" },
  { id: "eligibility", label: "Eligibility" }, { id: "recommendation", label: "Your recommendation" },
];

export function ProductFinderProgress({ phase }: { phase: SurveyPhase }) {
  const current = phases.findIndex((item) => item.id === phase);
  return (
    <div className="pf-progress" aria-label={`Survey phase: ${phases[current].label}`}>
      <div className="pf-progress-track">{phases.map((item, index) => <span key={item.id} data-active={index <= current} />)}</div>
      <div className="pf-phase-labels">{phases.map((item, index) => <span key={item.id} aria-current={index === current ? "step" : undefined} data-active={index === current}>{item.label}</span>)}</div>
    </div>
  );
}
