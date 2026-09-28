"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// PRD 33: the install prompt shows once per project list visit until
// accepted or dismissed twice. Never a modal; the banner is dismissible.

const DISMISSALS_KEY = "wap-install-dismissals";
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallBanner() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissals = 0;
    try {
      dismissals = Number(localStorage.getItem(DISMISSALS_KEY) ?? "0");
    } catch {
      dismissals = 0;
    }
    if (dismissals >= 2) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visible || !event) return null;

  async function accept() {
    await event!.prompt();
    setVisible(false);
    // Accepted: no further nagging is possible anyway once installed.
    try {
      localStorage.setItem(DISMISSALS_KEY, "2");
    } catch {
      // Private mode: banner simply reappears next visit.
    }
  }

  function dismiss() {
    setVisible(false);
    try {
      const next = Number(localStorage.getItem(DISMISSALS_KEY) ?? "0") + 1;
      localStorage.setItem(DISMISSALS_KEY, String(next));
    } catch {
      // Ignore: acceptance state simply resets.
    }
  }

  return (
    <div
      role="status"
      className="mt-4 flex items-center gap-3 rounded-xl border bg-card p-3"
    >
      <Download className="size-5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-semibold">Install Walk &amp; Plot</span>
        <span className="block text-xs text-muted-foreground">
          Add to Home Screen for offline mapping
        </span>
      </span>
      <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => void accept()}>
        Install
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss install suggestion"
        className="shrink-0"
        onClick={dismiss}
      >
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
