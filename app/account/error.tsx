"use client";
import { Button } from "@/components/ui";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return <div className="account-error"><h2>We couldn’t load your account</h2><p>{error.message}</p><Button onClick={reset}>Try again</Button></div>;
}
