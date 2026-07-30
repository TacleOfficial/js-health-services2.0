"use client";

import { useState } from "react";
import { addManualTaxRate } from "@/app/admin/actions";
import { Button, Input } from "@/components/ui";

export function AdminTaxRateForm() {
  const [error, setError] = useState("");

  return <form
    action={addManualTaxRate}
    className="tax-rate-form"
    noValidate
    onSubmit={event => {
      const form = event.currentTarget;
      const acknowledgment = String(new FormData(form).get("legal_acknowledgment") ?? "").trim();
      if (acknowledgment.length < 12) {
        event.preventDefault();
        setError("Legal review acknowledgment must be at least 12 characters.");
        form.querySelector<HTMLInputElement>("[name=legal_acknowledgment]")?.focus();
        return;
      }
      if (!form.checkValidity()) {
        event.preventDefault();
        setError("Complete all required tax-rate fields with valid values.");
        form.querySelector<HTMLInputElement>(":invalid")?.focus();
        return;
      }
      setError("");
    }}
  >
    <Input name="region" placeholder="State (IN)" maxLength={2} minLength={2} required/>
    <Input name="postal_pattern" placeholder="Postal prefix (optional)"/>
    <Input name="rate_percent" type="number" min="0" max="100" step="0.001" placeholder="Rate %" required/>
    <Input name="effective_from" type="datetime-local" required/>
    <Input name="effective_to" type="datetime-local"/>
    <Input
      name="legal_acknowledgment"
      placeholder="Legal review acknowledgment"
      minLength={12}
      required
      aria-invalid={Boolean(error)}
      aria-describedby="tax-rate-form-error tax-rate-ack-hint"
      onChange={() => error && setError("")}
    />
    <small id="tax-rate-ack-hint">Enter at least 12 characters confirming legal review.</small>
    <Button>Add approved version</Button>
    <p id="tax-rate-form-error" className="form-error" role="alert" aria-live="assertive">
      {error}
    </p>
  </form>;
}
