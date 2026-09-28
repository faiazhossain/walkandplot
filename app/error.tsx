"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// PRD 32 / AC-13: route-level crash boundary. Plain language, one next
// action, and a way home - never a dead end.

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="size-7" aria-hidden />
        </div>
        <h1 className="font-heading text-lg font-semibold">Something went wrong</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          Your work is saved on this device. Try again, or head back to your
          projects.
        </p>
        <div className="flex gap-2 pt-2">
          <Button className="h-12 rounded-lg px-6" onClick={retry}>
            Try again
          </Button>
          <Button render={<Link href="/" />} variant="outline" className="h-12 rounded-lg px-6">
            Back to projects
          </Button>
        </div>
      </div>
    </main>
  );
}
