"use client";

import { DemoProvider } from "@/components/demo-store";
import { ToastProvider } from "@/components/ui/toast";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <ToastProvider><DemoProvider>{children}</DemoProvider></ToastProvider>;
}
