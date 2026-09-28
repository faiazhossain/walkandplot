import { FileDown, Footprints, PenLine, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// PRD 9, Step 1: the first-run screen shown when no projects exist yet.
// Extracted from the old static landing page; the Create button is live now.

const HIGHLIGHTS = ["No account needed", "Works offline", "Autosaves as you go"] as const;

const STEPS = [
  {
    icon: Footprints,
    title: "Walk the space",
    body: "Move through the building like any visitor would.",
  },
  {
    icon: PenLine,
    title: "Plot what you see",
    body: "Tap corridors, rooms and stairs onto a canvas as you go.",
  },
  {
    icon: FileDown,
    title: "Export your survey",
    body: "Download each floor as a map file, whenever you are ready.",
  },
] as const;

export function FirstRunHero() {
  return (
    <main className="relative flex flex-1 flex-col items-center overflow-hidden dot-grid px-5 py-10 text-center sm:py-14">
      {/* Soft accent glow behind the hero, matching the prototype's indigo mark */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <section
        aria-labelledby="app-intro"
        className="relative flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-5"
      >
        <div className="grid size-20 place-items-center rounded-[1.5rem] bg-primary text-primary-foreground shadow-xl shadow-primary/30">
          {/* Walk-route mark, shared with app/icon.svg */}
          <svg viewBox="0 0 512 512" className="size-10" aria-hidden>
            <g fill="none" stroke="currentColor" strokeWidth="34" strokeLinecap="round">
              <circle cx="128" cy="384" r="44" />
              <circle cx="384" cy="128" r="44" />
              <path d="M172 372C290 336 330 288 322 176" strokeDasharray="52 56" />
            </g>
          </svg>
        </div>

        <div className="space-y-1.5">
          <h1 id="app-intro" className="font-heading text-3xl font-bold tracking-tight">
            Walk &amp; Plot
          </h1>
          <p className="text-sm font-semibold text-primary">Walk. Map. Export.</p>
        </div>

        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Map any building with just your phone. Walk the space, plot what you see as you go, and
          take the finished survey with you as a map file.
        </p>

        <ul aria-label="Highlights" className="flex flex-wrap items-center justify-center gap-2">
          {HIGHLIGHTS.map((label) => (
            <li
              key={label}
              className="rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground"
            >
              {label}
            </li>
          ))}
        </ul>

        <div className="w-full space-y-2.5 pt-3 text-left">
          <h2 className="text-center text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">
            How it works
          </h2>
          <ol className="space-y-2.5">
            {STEPS.map(({ icon: Icon, title, body }) => (
              <li
                key={title}
                className="flex items-center gap-3.5 rounded-xl border bg-card px-4 py-3"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-[13px] leading-snug text-muted-foreground">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-label="Get started" className="relative w-full max-w-sm space-y-2 pt-8">
        <Button render={<Link href="/projects/new" />} className="h-12 w-full rounded-lg text-base">
          <Plus className="size-5" aria-hidden />
          Create Your First Project
        </Button>
        <p className="pt-1 text-xs text-muted-foreground">
          Everything stays on this device. Back it up as a file anytime.
        </p>
      </section>
    </main>
  );
}
