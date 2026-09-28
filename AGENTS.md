<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Walk & Plot product rules

- **Mobile-first, always.** Design and review every screen at 320px width first (PRD 24, AC-11). Desktop is view/edit only and comes after mobile works.
- Minimum 48px touch targets; primary actions bottom-anchored in thumb reach; no horizontal page scroll at 320px.
- The approved visual spec is `prototype/walk-and-plot-prototype.html` - match its look before inventing new UI.
- Plain language in user-facing copy (PRD 8) - no GIS terms (GeoJSON, LineString, vertex) in the UI.
