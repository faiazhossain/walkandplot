# Walk & Plot

**Walk. Map. Export.**

A fully offline, installable, mobile-first PWA for indoor mapping: walk an
unknown building with no floor plan and no account, plot corridors, places and
floor connections on a calibrated canvas, and download the survey as valid,
honest GeoJSON.

- **PRD:** [prd.md](./prd.md) (v2 - the source of truth for scope and rules)
- **Interactive UI prototype:** [prototype/walk-and-plot-prototype.html](./prototype/walk-and-plot-prototype.html)
  (open in a browser - the approved visual spec for the build)
- **Work tracking:** [beads](https://github.com/steveyegge/beads) CLI (`bd list`)

## Status

Phase 1 - Foundation (PRD 38) is complete: scaffold, tooling, CI, Dexie
schema v1, app shell, PWA precache. Phase 2 (Projects and Floors CRUD,
backup export/import, Settings) is next.

## Stack (PRD 27 - pinned)

Next.js (App Router, static export) - TypeScript strict - Tailwind v4 +
shadcn/ui - Dexie (IndexedDB) - Zod - Vitest + Playwright - Serwist - GitHub
Actions CI.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000 (Turbopack)
```

Quality gate (same order CI runs it):

```bash
npm run lint
npm run typecheck
npm test           # unit + integration (fake-indexeddb)
npm run build      # static export -> out/ (webpack, see notes)
npm run e2e        # Playwright against the served export
```

## Architecture

```
app/          Routes (PRD 26) + PWA manifest + service worker
lib/domain/   Pure TypeScript: geometry, units, Zod schemas.
              No React, no browser APIs - runs in Node tests.
lib/db/       The only module that knows IndexedDB exists.
              Dexie schema v1, repositories, storage health.
components/   UI (shadcn primitives) + feature components per phase
tests/        unit / integration (Vitest) and e2e (Playwright)
```

Domain rules that keep the codebase honest:

- Zod schemas in `lib/domain/schema.ts` are the single source of truth;
  IndexedDB writes, backups and the GeoJSON exporter all validate against them.
- Coordinates are local floor meters (or honest `units` when uncalibrated) -
  never labelled as GPS (PRD 22).
- Every completed gesture autosaves within 1 second; nothing completed is ever
  lost (PRD P1, AC-05).

## Build notes (deliberate deviations)

- `npm run build` uses `next build --webpack`: `@serwist/next` compiles the
  service worker via webpack, and Next 16 defaults to Turbopack. Dev stays on
  Turbopack. Revisit when Serwist gains Turbopack support.
- PRD 26's dynamic-path routes cannot ship under a fully static export with
  local-only IDs; client-side navigation lands with Phase 2 (tracked in beads).
