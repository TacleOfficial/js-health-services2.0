"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { Button, Input } from "@/components/ui";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function parseDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function isAtLeast18(date: Date, today = new Date()) {
  const cutoffYear = today.getFullYear() - 18;
  const cutoff = new Date(cutoffYear, today.getMonth(), today.getDate(), 12);
  return date <= cutoff;
}

export function DateOfBirthPicker({ onVerified }: { onVerified: (eligible: boolean) => void }) {
  const [value, setValue] = useState("");
  const [selected, setSelected] = useState<Date>();
  const [error, setError] = useState("");
  const today = new Date();
  const earliest = new Date(today.getFullYear() - 120, 0, 1);

  const verify = () => {
    const date = parseDate(value);
    if (!date) { setError("Enter a valid date in MM/DD/YYYY format."); return; }
    if (date > today) { setError("Date of birth cannot be in the future."); return; }
    if (date < earliest) { setError("Enter a date within the supported range."); return; }
    setError("");
    onVerified(isAtLeast18(date, today));
    setSelected(undefined);
    setValue("");
  };

  return (
    <div className="pf-dob">
      <label htmlFor="date-of-birth">Date of birth</label>
      <div className="pf-dob-row">
        <Input
          id="date-of-birth"
          inputMode="numeric"
          autoComplete="bday"
          placeholder="MM/DD/YYYY"
          value={value}
          aria-describedby="dob-privacy dob-error"
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
            const masked = digits.length > 4 ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
              : digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
            setValue(masked);
            setError("");
          }}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); verify(); } }}
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="icon" aria-label="Choose date from calendar"><CalendarDays /></Button>
          </PopoverTrigger>
          <PopoverContent align="end">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected ?? new Date(today.getFullYear() - 25, 0, 1)}
              startMonth={earliest}
              endMonth={today}
              disabled={{ after: today, before: earliest }}
              onSelect={(date) => {
                if (!date) return;
                setSelected(date);
                setValue(format(date, "MM/dd/yyyy"));
                setError("");
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      <p id="dob-privacy" className="pf-helper">Used only to confirm you are 18 or older. Your date is not stored.</p>
      <p id="dob-error" className="pf-error" role="alert">{error}</p>
      <Button type="button" size="lg" onClick={verify}>Verify and continue</Button>
    </div>
  );
}
