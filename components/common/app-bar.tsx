"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// App bar matching the prototype: back arrow, title, optional subtitle, and
// a right-side action slot. 48px touch targets (PRD 24), safe-area padding.

interface AppBarProps {
  title: string;
  subtitle?: ReactNode;
  back?: string | (() => void);
  right?: ReactNode;
}

export function AppBar({ title, subtitle, back, right }: AppBarProps) {
  const router = useRouter();

  function goBack() {
    if (typeof back === "string") router.push(back);
    else back?.();
  }

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="flex h-14 items-center gap-1 px-2">
        {back && (
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={goBack}
            aria-label="Back"
            className="shrink-0"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-base leading-tight font-semibold">{title}</h1>
          {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
      </div>
    </header>
  );
}
