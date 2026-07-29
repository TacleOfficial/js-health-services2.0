"use client";

import { DayPicker, type DayPickerProps } from "react-day-picker";
import { cn } from "@/lib/utils";

export function Calendar({ className, ...props }: DayPickerProps) {
  return <DayPicker className={cn("pf-calendar", className)} captionLayout="dropdown" navLayout="after" {...props} />;
}
