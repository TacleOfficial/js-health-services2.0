"use client";

import { Check } from "lucide-react";

export function AnswerCard({ label, description, selected, disabled, multiple = false, onSelect }: {
  label: string; description?: string; selected: boolean; disabled?: boolean; multiple?: boolean; onSelect: () => void;
}) {
  return (
    <label className="pf-answer" data-selected={selected} data-disabled={disabled}>
      <input type={multiple ? "checkbox" : "radio"} checked={selected} disabled={disabled} onChange={onSelect} />
      <span className="pf-answer-copy"><strong>{label}</strong>{description ? <small>{description}</small> : null}</span>
      <span className="pf-check" aria-hidden="true">{selected ? <Check /> : null}</span>
    </label>
  );
}
