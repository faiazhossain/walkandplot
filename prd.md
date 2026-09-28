# Walk & Plot

## Product Requirements Document — V2

**Version:** 2.0
**Status:** Supersedes V1.0
**Date:** 2026-09-28
**Platform:** Mobile-first Progressive Web App (PWA)
**Framework:** Next.js (App Router) + TypeScript
**Primary Output:** GeoJSON file
**Backend:** None. Fully static client-side application.
**Database:** None. Local IndexedDB only, with file-based project backup.
**Primary Device:** Mobile phone
**Desktop:** View, edit and download only; mapping canvas remains mobile-first

---

# Changelog from V1

This version exists to make the product easier to use, harder to lose data with,
and more pleasant to build. Every change from V1 maps to one of those three goals.

| #   | Change                                                                                                                                                                             | Why                                                                                                                                                                                                    | Goal                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| 1   | **Manual plot-first mapping.** Sensor dead-reckoning demoted from core feature to a future optional assist.                                                                        | Browser dead-reckoning is the single largest source of error, complexity and support burden. Tap-to-place on canvas is predictable, works on every device, and produces geometry the mapper can trust. | Less error-prone                       |
| 2   | **No login required.** Guest-first. Authentication deferred to the version that introduces cloud sync.                                                                             | OAuth is impossible offline, and V1 required offline-first. Requiring sign-in before any backend exists added friction with zero benefit.                                                              | Usability                              |
| 3   | **Floor scale calibration and measurement aids.** Trace a known wall, type its real length; the floor rescales. Length labels, snap-to-grid, right-angle lock.                     | Manual tracing without scale produced arbitrary proportions. Calibration is one interaction and makes every subsequent drawing more accurate.                                                          | Usability, Less error-prone            |
| 4   | **Live editing instead of a node-completion ceremony.** Every change autosaves immediately. Multi-step captures (polygons) still end with an explicit Done.                        | Fewer screens, fewer taps, fewer states to get stuck in. V1's draft-versus-complete bookkeeping moved into schema validation instead of UI flow.                                                       | Usability                              |
| 5   | **Junctions emerge from connections.** No dedicated junction tool in the walk flow. Paths connect by snapping; a shared point with 3+ connections is a junction in the data model. | One less concept for the mapper to learn. The graph structure required for future routing is unchanged.                                                                                                | Usability                              |
| 6   | **Project backup files.** One-tap export/import of a full-fidelity project file, plus a non-blocking backup reminder.                                                              | A lost or wiped phone no longer destroys every survey. No server needed.                                                                                                                               | Less error-prone                       |
| 7   | **Storage hardening specified.** Dexie with versioned schema and migrations, transactional writes, autosave, storage-quota checks, crash recovery.                                 | V1 said "use IndexedDB" without reliability requirements. This version defines them.                                                                                                                   | Less error-prone                       |
| 8   | **Opinionated, conventional stack pinned.** Tailwind + shadcn/ui, Zustand, Dexie, Zod, Konva, Serwist, Vitest, Playwright, ESLint + Prettier, GitHub Actions CI.                   | Removes stack debates from every task. All choices are mainstream, well-documented and boring in the best way.                                                                                         | Developer experience                   |
| 9   | **Testing and Definition of Done are requirements, not suggestions.** Unit, integration and E2E coverage targets, CI gate on every PR.                                             | "Less error-prone" is enforced by the build, not by hope.                                                                                                                                              | Less error-prone, Developer experience |
| 10  | **Static export.** The app ships as a fully static bundle with no server runtime.                                                                                                  | Nothing to deploy, nothing to fall over, hosting is free anywhere, and the offline story becomes trivially true.                                                                                       | Less error-prone, Developer experience |

---

# Product Identity

## Product Name

**Walk & Plot**

## Product Tagline

**Walk. Map. Export.**

## Product Description

Walk & Plot is a lightweight, mobile-first indoor mapping and field data collection PWA.

The name reflects the core workflow:

> **Walk → Identify → Plot → Connect → Export**

Users physically walk through an indoor space, identify what they encounter, plot
spatial features on a canvas, connect them, and export the result as GeoJSON.

## Naming Rules

The product must consistently be referred to as:

**Walk & Plot**

Do not rename the product to alternatives such as Indoor Mapper, Walk Mapper,
Floor Mapper, Indoor Walk or Space Mapper. These may be used descriptively when
explaining functionality, but they are not product names.

## Brand Usage

```text
App Name:              Walk & Plot
PWA Name:              Walk & Plot
Short PWA Name:        Walk & Plot
Repository Name:       walk-and-plot
Package Name:          walk-and-plot
URL Slug:              walk-and-plot
```

## Product Positioning

Walk & Plot is **not primarily a floor-plan viewer**.

It is a **field mapping tool** that lets users create indoor spatial data where
no floor plan exists.

The product principle is:

> **No floor plan? Walk it and plot it.**

In V2, "plot" is the literal primary action: the mapper walks the space and plots
what they see directly onto a canvas with their thumb.

---

# 1. Product Overview

Walk & Plot is a lightweight mobile-first web application for collecting indoor
spatial data inside buildings when no existing floor plan is available.

A field mapper creates a project, selects or creates a floor, and plots corridors,
rooms, shops, stairs and lifts on a calibrated canvas while walking through the
building. The finished floor or project exports as GeoJSON.

The application does not require an existing floor plan, an internet connection,
or an account.

The core workflow is:

> **Start → Walk → Plot → Connect → Finish → Export GeoJSON**

The application must be simple enough for a non-technical field worker to
understand without training.

---

# 2. Problem

Indoor mapping usually assumes a floor plan already exists.

In real-world data collection:

- A shopping mall may not provide a digital floor plan.
- A building may have an outdated floor plan.
- A field worker may need to map a previously unmapped building.
- Indoor GPS is unreliable or absent.
- Indoor spaces contain corridors, shops, rooms, stairs, lifts, entrances,
  junctions and restricted areas.
- The resulting data must preserve spatial relationships to be useful later.

Walk & Plot solves this by letting a mapper build an indoor spatial
representation while physically walking through the building, with tools that
make the result as accurate as the mapper's observation, and no worse.

---

# 3. V2 Goals

The V2 goal is NOT to build a complete indoor navigation platform.

The goal is:

> **Let a user manually survey an unknown indoor building using only a phone,
> with predictable results, zero data loss, and export a structured GeoJSON
> representation of the surveyed floor or building.**

V2 prioritizes, in order:

1. Data safety — nothing the user completes is ever lost
2. Predictable accuracy — what the mapper drew is what the mapper meant
3. Mobile usability — one-handed, thumb-driven, 320px-first
4. Simplicity — the shortest possible path through any task
5. Correct spatial structure — points, lines, polygons and connections
6. Easy GeoJSON export
7. Developer experience — a codebase a new developer is productive in within a day
8. Future compatibility — the local data model maps cleanly to a future database

---

# 4. Non-Goals for V2

Do NOT implement the following in V2:

- Backend server, API routes or database
- Cloud sync or cloud backup
- PostGIS
- Real-time collaboration
- Indoor navigation or routing
- Sensor-based dead reckoning as a core feature (see section 20 for the
  optional-assist boundary)
- Automatic AR boundary detection
- AI-based room or shop detection
- Computer vision
- Automatic floor-plan generation
- GPS-based positioning
- User accounts and OAuth (deferred with cloud sync)
- Admin dashboard
- Complex analytics
- Native mobile application
- Payment or subscription
- Map provider dependency of any kind

These are consciously deferred. The architecture must not preclude them.

---

# 5. Target Users

## Primary User — Field Mapper

A person physically visiting a building and collecting indoor data.

Example:

> A mapper visits a shopping mall with no available floor plan and maps Floor 3
> using their phone.

The mapper does not need GIS knowledge.

They should understand simple concepts:

- Corridor
- Shop
- Room
- Stairs
- Lift
- Entrance
- Toilet

They should NOT need to understand:

- GeoJSON
- LineString
- Polygon
- Coordinate reference systems
- Graph theory

## Secondary User — Reviewer

A person who inspects a finished survey on a larger screen, fixes labels,
and downloads the GeoJSON. Desktop supports full editing except the
walk-oriented capture flow (section 25).

---

# 6. Core Product Concept

The application models an indoor environment using four concepts.

### Paths

Spaces people walk through. Drawn as connected lines on the canvas:

- Corridor
- Hallway
- Open area
- Ramp

### Places

Areas or objects of interest:

- Shop
- Room
- Restaurant
- Office
- Toilet
- Storage
- Other

### Connectors

Points that link spaces or floors:

- Door
- Entrance / Exit
- Stair
- Lift
- Escalator

### Junctions

A junction is any shared point where three or more paths meet. Junctions are
not drawn directly; they emerge when a path is snapped onto another path.

Example:

```text
              Shop
                |
                |
Path A ─────── Junction ─────── Path B
                |
                |
                Path C
```

The resulting map is a combination of:

> **Points + Lines + Polygons + Connections**

---

# 7. Product Principles

These principles resolve every design dispute. When two options conflict,
the one that better satisfies the higher-listed principle wins.

### P1 — Never lose completed work

Autosave after every change, transactional local writes, backup files,
crash recovery. Data safety outranks every other consideration, including
convenience and performance.

### P2 — Plot first, enrich later

Capture the physical structure fast. Never interrupt plotting with long forms.
Names, notes and metadata can be added at any time afterward.

### P3 — What you draw is what you get

The mapper's tap lands exactly where the rendered geometry lands. No hidden
smoothing, no automatic inference, no surprise transformations. Snapping is
visible and can be disabled.

### P4 — One obvious next action

The field worker should never need to ask "what do I do now?" Every screen
has one primary action.

### P5 — Plain language

No GIS terminology in the user interface. Technical terms live in developer
documentation and exported data only.

### P6 — Offline is the normal case

Every feature must work with the network fully unavailable, from first load
of the installed app onward.

### P7 — Boring technology

Prefer mainstream, well-documented, widely-used libraries. Novelty is a cost,
not a feature.

---

# 8. UI Language

The interface translates technical concepts into simple actions.

| Instead of             | Use               |
| ---------------------- | ----------------- |
| Create LineString      | Trace Path        |
| Create Polygon         | Trace Area        |
| Add Feature / Add Node | Add Place         |
| Vertex                 | Corner            |
| Geometry               | Shape             |
| Export GeoJSON         | Download Map File |
| Calibration            | Set Real Length   |

---

# 9. Primary User Journey

## Step 1 — Open the App

The user opens the PWA. No sign-in is required.

First-run shows a single screen:

```text
Walk & Plot

Map any building with just your phone.
No account needed. Works offline.

[ Create Your First Project ]
```

Returning users land directly on the project list.

## Step 2 — Projects

```text
My Projects

[ + New Project ]

ABC Shopping Mall
3 floors - 2 mapped
Edited 2 hours ago

Office Building B
1 floor - mapped
Edited last week
```

Projects are stored locally on this device. The project list states this
plainly so users understand what a lost phone means, and the backup affordance
is visible from this screen (section 30).

---

# 10. Create Project

User selects **New Project**.

Fields:

### Building Name

Required. Example: `ABC Shopping Mall`

### Address / Description

Optional, free text.

### Starting Floor Name

Optional, defaults to `Ground`.

The user then lands in the project, prompted to create their first floor.

---

# 11. Floor Model

Each project can contain multiple floors.

```text
ABC Shopping Mall

B2
B1
Ground
1
2
3
Mezzanine
```

Floor naming must not assume numeric floors. Supported kinds:

```text
Basement (B2, B1, ...)
Ground
Numbered (1, 2, 3, ...)
Named (Mezzanine, Roof, Lobby, Custom ...)
```

Internally each floor has:

```text
floorId:     string (uuid)
displayName: string
order:       number (vertical ordering, ascending)
status:      "mapping" | "completed"
scale:       { calibrated: boolean, metersPerUnit: number } | null
```

The floor list supports reordering by drag. The `order` field, not list
position, is the source of truth.

---

# 12. Mapping Workspace

The mapping workspace is the primary product surface. It must be extremely
simple.

```text
+--------------------------------------+
| <- Floor 3        [ undo ] [ redo ]  |
|                    calibrated? dot  |
|                                      |
|                                      |
|            CANVAS                    |
|      (pinch zoom / pan)              |
|                                      |
|                                      |
|  +--------------------------------+  |
|  | [Trace Path] [Add Place]      |  |  <- tool row
|  +--------------------------------+  |
|                                      |
| [ Finish ]                           |
+--------------------------------------+
```

Layout rules:

- Canvas occupies the full screen behind everything else.
- Tools live at the bottom, within thumb reach.
- Undo and redo are always visible while a tool is active.
- Normal navigation is hidden during mapping.
- Everything visible is tappable with a 48px minimum touch target.
- Safe-area insets are respected on notched devices.

---

# 13. Canvas Interaction Model

This section is normative. The canvas is where usability is won or lost.

## Gestures

| Gesture               | Tool inactive                                | Tool active                   |
| --------------------- | -------------------------------------------- | ----------------------------- |
| One finger drag       | Pan canvas                                   | Draw / place (tool dependent) |
| Two finger pinch      | Zoom                                         | Zoom                          |
| Two finger drag       | Pan                                          | Pan                           |
| Two finger double-tap | Reset zoom                                   | Reset zoom                    |
| Long press on object  | Context menu (edit, rename, delete, connect) | Same                          |

While a tool is active, one finger always draws. The user never fights
between drawing and panning: if they want to reposition while drawing, they
use two fingers, or tap undo.

## Snapping

Snapping is on by default and visibly indicated:

- Snap to grid (grid spacing adapts to zoom level)
- Snap to existing corners and path endpoints (strongest priority, larger
  magnet radius)
- Snap to existing path segments (creates a junction connection, section 18)

A snapping indicator (highlight ring) shows what will snap before release.
Snapping can be toggled per session from the tool row overflow menu.

## Drawing aids

- **Right-angle lock:** while tracing, the next segment can be constrained to
  0/45/90 degrees relative to the previous segment. One toggle, remembered
  per session.
- **Length label:** every segment under the finger shows its live length in
  meters, based on the floor scale (section 14).
- **Grid:** subtle grid rendered behind geometry, density adapts to zoom.

## Accuracy rule

The rendered position of a touch point and the stored coordinate must be
pixel-identical, modulo active snapping, which must be visually indicated
before the touch is released. This implements P3.

---

# 14. Scale and Measurement

Manual plotting needs a sense of real-world size. V2 solves this with a
calibration interaction, not sensors.

## Floor calibration

On any floor the user can run **Set Real Length**:

```text
Set Real Length

1. Trace along a wall or corridor you know.  [or pick an existing line]
2. Type or step-count its real length.

Trace:  [ tap start ] ... [ tap end ]
Real length: [ 12.5 ] m      [ + 1 step ] counting

[ Apply to Floor ]
```

The floor's `metersPerUnit` is derived from the traced distance in floor
units versus the entered real length. The whole floor rescales. Length
labels everywhere update. `scale.calibrated` becomes true.

Step-count helper: the user taps a "+1 step" control per step they walk, or
enters a step count; the app multiplies by their step length from Settings
(default 0.75 m, editable per user). This is deliberately manual: it is
accurate enough and never requires permissions.

## Uncalibrated floors

An uncalibrated floor works fully but shows units as "units" instead of
"meters" and displays a small, dismissible hint:

```text
Tip: use Set Real Length to get real measurements.
```

Calibration must never block mapping.

---

# 15. Tracing a Path (Corridor)

Primary tool: **Trace Path**.

```text
Tap to add points. Tap the first point again to finish.

  *---*---*
 /       |
*        *---*

[ undo ] [ done ]
```

- Tap adds a vertex; a live segment follows the finger.
- Tapping the start point, or tapping Done, completes the path.
- Minimum: 2 distinct points. The Done button is disabled until valid.
- On completion, the path saves immediately (P2) and the tool stays active
  so the user can trace the next corridor without re-selecting.
- Path subtype is asked after, not before: a small post-capture chip lets the
  mapper tag the last path as Corridor, Hallway, Open Area or Ramp, defaulting
  to Corridor. Tagging is optional and deferred-friendly (P2).

---

# 16. Adding a Place

Primary tool: **Add Place**.

Step 1 — type picker (short, scannable):

```text
What is it?

[ Shop ]     [ Room ]      [ Restaurant ]
[ Toilet ]   [ Stairs ]    [ Lift ]
[ Entrance ] [ Escalator ] [ Other ]
```

The nine most common types are first-class. "Other" opens a free-text label
plus an optional subtype. The type list is data-driven so new types can be
added without UI changes.

Step 2 — capture:

- **Point places** (toilet, entrance, stair head, lift): a single tap places
  it. Saves immediately.
- **Area places** (shop, room, restaurant, office, storage): the user traces
  a polygon the same way as paths, then taps Done:

```text
Trace the area boundary. Tap each corner.

[ undo ] [ done ]
```

Minimum 3 unique points. Done is disabled until valid. On Done, the shape
saves immediately.

Step 3 — a dismissible detail sheet slides up (never blocking):

```text
Shop - new

Name     [__________]
Number   [__________]

[ Skip ]         [ Save Details ]
```

Name and number are optional. Skip closes the sheet; the place is already
saved either way. This is the "enrich later" principle in action.

## Conditional details

When the detail sheet is opened later (or immediately after capture), only
type-relevant fields are asked. Full conditional field matrix in section 21.

---

# 17. Live Editing and Autosave

V2 replaces V1's draft/complete ceremony with live objects and autosave.

## Rules

1. Every completed gesture (finished path, closed polygon, placed point,
   moved corner, typed name) writes to IndexedDB within 1 second.
2. A small status indicator shows save state: saved (default), saving,
   offline-local (same thing here, but explicit), error.
3. There is no global Save button anywhere in the product.
4. There is no draft state that can be silently lost. A polygon mid-trace is
   the only ephemeral thing, and it survives refresh too (section 31).

## Editing

Every saved object is editable at any time:

- Move a corner (drag with the Select tool)
- Add a corner (tap a segment midpoint handle)
- Remove a corner
- Rename, retype, annotate
- Delete (with one-step undo toast, no modal: "Deleted Shop 304 - [ Undo ]")

## Undo / Redo

- Always visible during mapping.
- Full history for the current session, minimum 100 steps.
- Undo spans all actions: geometry, moves, deletes, renames, connections.
- History is per app session (not persisted across restart); autosave already
  protects persistence, so undo across restarts is explicitly out of scope.

## Destructive actions

- Deleting a single object: undo toast, no confirmation dialog.
- Deleting a floor or project: confirmation dialog (typed confirmation for
  projects with mapped floors), because undo may not be practical at that
  scale. Both also create an automatic pre-delete backup file offer.

---

# 18. Connections and Junctions

## Path connections

When a path endpoint is snapped onto another path or endpoint, the objects
are connected in the data model.

- Endpoint to endpoint: shared node.
- Endpoint onto the middle of another path: a junction is recorded at that
  point. The existing path is split into two linked segments in the data
  model so the graph stays clean for future routing.

The mapper sees none of this bookkeeping; they see two lines that join.

## Vertical connectors (Stairs, Lift, Escalator)

Stairs, lifts and escalators are navigation connections, not decoration.

When such a place is added, the mapper is asked which floors it connects:

```text
Stairs

Connects:  Floor 3  ->  [ choose floor ]

Direction: [ Up ] [ Down ] [ Both ]
```

The flow supports forward-declaration: if Floor 4 does not exist yet, the
mapper can pick "Floor 4 (create)" and the floor stub is created. When they
later map Floor 4, the linked connector point already exists there and the
app offers to snap their first path to it.

Exported connector metadata:

```text
fromFloor
toFloor
type (stair | lift | escalator)
direction (up | down | both)
```

## Doors

A Place inside or adjacent to a path records a connection to that path
(nearest path within a threshold, shown as a dotted link on canvas, and
confirmable in the place's detail sheet). V2 does not have a separate door
object; the connection edge is preserved in export.

---

# 19. Feature Metadata

Every feature supports:

```text
id
type (path | place)
subtype (corridor | shop | stair | ... )
name
floorId
access      (public | staff_only | restricted | emergency_only)  default: public
status      (active | closed | temporary)                       default: active
confidence  (high | medium | low)                               default: high
notes
createdAt
updatedAt
```

Optional per subtype:

```text
shopNumber
fromFloor / toFloor / direction   (vertical connectors)
connectionIds
```

Notes:

- `confidence` defaults to `high` in V2 because geometry is explicitly
  hand-plotted; the mapper lowers it deliberately when estimating.
- `access` and `status` are editable from the detail sheet and exported.
- No field other than geometry validity is ever required.

---

# 20. Tracking (Optional Assist Boundary)

V1 made motion-sensor tracking the core loop. V2 does not.

Sensor-based dead reckoning in a browser (accelerometer + gyroscope
integration) drifts severely within seconds indoors, requires permission
flows, and behaves differently on every device. It is the highest-risk
component a V1-style spec could contain, so it is out of V2 scope.

V2 instead defines the boundary for adding it later without rework:

```text
TrackingProvider
  start()
  pause()
  resume()
  stop()
  onPosition(cb)   // local floor coordinates
```

- The mapping domain model must not import from or depend on any sensor API.
- A future provider may contribute a "ghost trail" overlay the mapper can
  trace over; it must never write geometry directly.
- The step-count measurement helper in section 14 is the V2-sanctioned
  substitute: manual, permissionless, and honest about accuracy.

This satisfies the TrackingProvider abstraction V1 required, at zero
implementation risk.

---

# 21. Type Catalog and Conditional Fields

The catalog is data-driven (a single TypeScript config + Zod schema), so
adding a type is a config change, not a feature branch.

| Type            | Capture          | Asked details (all optional)                                        |
| --------------- | ---------------- | ------------------------------------------------------------------- |
| Corridor        | Trace line       | width, notes                                                        |
| Open area       | Trace polygon    | notes                                                               |
| Shop            | Trace polygon    | name, shopNumber, access                                            |
| Room            | Trace polygon    | name, access                                                        |
| Restaurant      | Trace polygon    | name, access                                                        |
| Office          | Trace polygon    | name, access                                                        |
| Storage         | Trace polygon    | name, access                                                        |
| Toilet          | Point            | gender (male / female / accessible / unisex), access                |
| Stairs          | Point + floors   | direction (up/down/both), accessible                                |
| Lift            | Point + floors   | kind (passenger / service / emergency / other)                      |
| Escalator       | Point + floors   | direction (up / down / both)                                        |
| Entrance / Exit | Point            | kind (main / entrance / exit / emergency / staff / service / other) |
| Other           | Point or polygon | free-text label                                                     |

Rules:

- Nothing here blocks capture. Details are always answerable later.
- The list is deliberately short. Do not add types without a strong reason.
- New types later: add config + Zod schema + export mapping. No UI rewrite.

---

# 22. GeoJSON Export

The primary V2 output. Two scopes:

- **Export Floor:** `Download Floor-3.geojson`
- **Export Project:** `Download ABC-Shopping-Mall.geojson`

## Format

```json
{
  "type": "FeatureCollection",
  "properties": {
    "app": "walk-and-plot",
    "schemaVersion": 2,
    "project": "ABC Shopping Mall",
    "projectId": "uuid",
    "exportedAt": "2026-09-28T10:00:00.000Z",
    "floors": [{ "floorId": "uuid", "displayName": "Floor 3", "order": 3 }],
    "coordinateSystem": {
      "type": "local",
      "unit": "meters",
      "origin": "first-plotted-point-per-floor",
      "calibrated": true
    }
  },
  "features": []
}
```

Each feature:

```json
{
  "type": "Feature",
  "id": "feature-uuid",
  "properties": {
    "floorId": "uuid",
    "floorName": "Floor 3",
    "type": "place",
    "subtype": "shop",
    "name": "ABC Fashion",
    "shopNumber": "304",
    "access": "public",
    "status": "active",
    "confidence": "high",
    "notes": null,
    "connections": ["feature-uuid-2"],
    "createdAt": "2026-09-28T09:00:00.000Z",
    "updatedAt": "2026-09-28T09:30:00.000Z"
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [
      [
        [0, 0],
        [4.2, 0],
        [4.2, 3.1],
        [0, 3.1],
        [0, 0]
      ]
    ]
  }
}
```

## Geometry rules

| Feature                                     | Geometry              |
| ------------------------------------------- | --------------------- |
| Path (corridor, hallway, ramp)              | LineString            |
| Open area                                   | Polygon (closed ring) |
| Area place (shop, room, ...)                | Polygon (closed ring) |
| Point place (toilet, entrance, stair, lift) | Point                 |

Vertical connectors carry `fromFloor` / `toFloor` / `direction` in properties.
They appear once per floor they touch (same `connectorGroupId`), so the
per-floor file remains self-describing.

## Coordinate honesty

Coordinates are local floor coordinates in meters (or uncalibrated units),
not WGS84. The FeatureCollection `coordinateSystem` block must always say so.
Never silently label local coordinates as latitude/longitude. Future
geographic calibration may map local coordinates to real-world coordinates
via anchors; the export format reserves room for it.

## Validation

The exporter validates every feature against the Zod schema before writing
and refuses to produce invalid GeoJSON. The export pipeline is covered by
golden-file unit tests.

---

# 23. Local Coordinate System

Each floor has its own local coordinate system:

```text
Origin  = first plotted point on that floor
X       = right on screen at base zoom
Y       = down on screen at base zoom
Unit    = meters (when calibrated) or abstract units
```

- Floor data must never depend on device pixels; the canvas transform handles
  zoom/pan, the data stays in floor coordinates.
- This keeps export, backup and future geographic calibration independent of
  viewport and device.

---

# 24. Mobile-First Requirements

### Primary width

320px to 430px. The complete mapping workflow must work comfortably at
320px. Do not design desktop first and shrink it.

### One-handed use

Primary controls are bottom-anchored and thumb-reachable. Minimum touch
target: 48px. Critical pairs of actions (undo/redo, done/cancel) are
spatially separated to prevent mis-taps.

### States

Every screen defines loading, empty, error and content states. No spinner
without text. No dead end without a next action (P4).

### Visual

- Light theme default; dark theme supported (canvas and chrome both).
- Contrast meets WCAG AA for all text and controls.
- Respect `prefers-reduced-motion`.

---

# 25. Desktop Behavior

Desktop is a legitimate place to review and clean up a survey, but it does
not offer the walk-oriented capture flow.

On desktop (width > 1024px):

- Project list, project detail, floor list: full CRUD.
- Map preview: pan/zoom, select, and full geometry editing with mouse.
- **Trace Path / Add Place capture tools are hidden** and replaced by a
  notice: "Capture is designed for mobile. You can edit everything here."
- Download GeoJSON, backup export/import: available and prominent.

Rationale: mouse-driven "capture" would fork the interaction model and double
QA surface. Editing shares code with mobile (same domain actions), so it is
cheap and safe to offer.

---

# 26. Screens and Routes

Next.js App Router structure:

```text
app/
  page.tsx                                  -> Projects (home)
  projects/new/page.tsx                     -> Create project
  projects/[projectId]/page.tsx             -> Project overview (floors, export, backup)
  projects/[projectId]/floors/[floorId]/
    page.tsx                                -> Mapping workspace
  settings/page.tsx                         -> Step length, theme, storage usage, about

components/
  canvas/      Canvas host, grid, snapping, handles, transform
  capture/     Trace path, add place, type picker, detail sheets
  project/     Project list, cards, forms
  floor/       Floor list, order, status
  ui/          shadcn/ui primitives only
  common/      SaveIndicator, EmptyState, ConfirmDialog, UndoToast

lib/
  domain/      Pure logic: geometry, snapping, validation, graph  (no React imports)
  db/          Dexie schema, migrations, repositories
  geojson/     Export serializer + validators
  backup/      Project file export/import
  store/       Zustand stores (session, tools, history)
  config/      Feature type catalog
  utils/

tests/
  unit/
  integration/
  e2e/
```

Rules:

- Domain logic (`lib/domain`) is pure TypeScript with zero React, zero
  browser API imports. Fully unit-testable in Node.
- Components never touch Dexie directly; they call repository functions or
  dispatch to stores.
- `lib/db` is the only module that knows IndexedDB exists.

---

# 27. Technical Stack

Pinned. Do not swap without a written reason. Every choice is mainstream,
typed, and has a large community.

### Core

| Concern       | Choice                                                        | Why this one                                                                                |
| ------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Framework     | Next.js (App Router), static export                           | Conventional, typed routing, trivial hosting                                                |
| Language      | TypeScript, `strict: true`                                    | Non-negotiable                                                                              |
| Styling       | Tailwind CSS + shadcn/ui                                      | Copy-in accessible components (Radix), no lock-in, no heavy dependency                      |
| Canvas        | Konva + react-konva                                           | Mature 2D canvas with hit-testing, drag, transforms; avoids hand-rolling picking/transforms |
| Client state  | Zustand                                                       | Tiny, no boilerplate, testable outside React                                                |
| Local DB      | Dexie (+ dexie-react-hooks)                                   | The standard IndexedDB wrapper; typed, transactional, versioned migrations                  |
| Validation    | Zod                                                           | Single source of truth: schema in, static types out (`z.infer`)                             |
| Forms         | react-hook-form + @hookform/resolvers                         | For the handful of real forms (project, details sheets)                                     |
| IDs           | `crypto.randomUUID()`                                         | Native, no dependency                                                                       |
| PWA           | Serwist                                                       | Current standard for Next.js service workers; precache shell                                |
| GeoJSON types | `@types/geojson`                                              | Standard typings; serializer is hand-rolled and tiny                                        |
| Lint/format   | ESLint + Prettier                                             | What create-next-app and every CI expect                                                    |
| Tests         | Vitest + Testing Library + fake-indexeddb; Playwright for E2E | Fast unit loop; real-browser E2E incl. offline and 320px viewports                          |
| CI            | GitHub Actions                                                | Lint, typecheck, unit, build, E2E on every PR                                               |

### Deliberately avoided

- Heavy GIS frameworks (Turf, OpenLayers, Leaflet) — no geographic math in V2
- Large state libraries (Redux, MobX) — Zustand covers it with less ceremony
- Multiple map/canvas SDKs
- Animation libraries
- Any dependency requiring a runtime server

New dependencies require justification against the avoided list and P7.

---

# 28. Data Model

Zod schemas in `lib/domain/schema.ts` are the single source of truth.
TypeScript types are derived via `z.infer`. IndexedDB (Dexie), backup files
and the GeoJSON exporter all validate against these schemas.

```text
Project
  id:            uuid
  name:          string
  description?:  string
  status:        "active" | "completed"
  createdAt
  updatedAt

Floor
  id:            uuid
  projectId:     uuid
  displayName:   string
  order:         number
  status:        "mapping" | "completed"
  scale:         { calibrated: boolean, metersPerUnit: number } | null
  createdAt
  updatedAt

Feature
  id:            uuid
  projectId:     uuid
  floorId:       uuid
  type:          "path" | "place"
  subtype:       enum (from type catalog)
  name?:         string
  geometry:      Point | LineString | Polygon   (local floor coordinates)
  access:        enum, default "public"
  status:        enum, default "active"
  confidence:    enum, default "high"
  notes?:        string
  props:         subtype-specific (shopNumber, gender, direction, ...)
  connectorGroupId?: uuid   (links vertical connectors across floors)
  createdAt
  updatedAt

Connection
  id:            uuid
  projectId:     uuid
  fromFeatureId: uuid
  toFeatureId:   uuid
  kind:          "door" | "path" | "stair" | "lift" | "escalator" | "ramp"
  createdAt

Meta
  schemaVersion: number
  stepLengthM:   number (settings)
  theme:         "light" | "dark" | "system"
```

Rules:

- Avoid overengineering; no more entities than these.
- Connection records are the graph. Future routing consumes them directly.
- Every persisted record validates against Zod on write; a validation
  failure is a bug, surfaced loudly in development, never silently dropped.

---

# 29. Persistence Architecture

## Storage

IndexedDB via Dexie. Nothing mapping-related lives only in React state,
ever.

## Schema versioning and migrations

```text
db.version(1).stores({ ... })
db.version(2).stores({ ... }).upgrade(tx => { ... })
```

- Every schema change ships as a new Dexie version with an upgrade path.
- Backup files embed `schemaVersion`; import migrates old backups forward.
- A failed migration must leave the DB untouched and show a recovery screen
  offering the last backup import. Never half-apply.

## Writes

- All multi-record writes run in a `db.transaction('rw', ...)`.
- Autosave: debounced at most 1 second after a change; the SaveIndicator
  reflects actual DB commit, not intent.
- Every repository function returns typed results and converts storage
  failures (quota, corruption) into user-actionable errors (section 32).

## Storage health

- On app start and workspace entry, check `navigator.storage.estimate()`.
  Warn non-blockingly above 80% usage.
- Request persistent storage (`navigator.storage.persist()`) on first mapping
  session start, with a one-line explanation. If denied, continue normally
  and show the backup reminder more often.

---

# 30. Backup and Restore

The antidote to local-only storage, without a server.

## Export backup

One tap from project overview and from project list long-press:

```text
[ Download Backup ]
-> ABC-Shopping-Mall-backup-2026-09-28.walkandplot.json
```

- Full fidelity: projects, floors, features, connections, schemaVersion,
  photos as data URIs (section 34). Not GeoJSON — backup restores the app,
  GeoJSON is for consumers.
- Validates against the Zod backup schema before download.

## Import backup

From the projects screen ("Import Backup"):

- Validates, migrates if old, and imports as a new project copy
  (never merge-overwrite silently).
- A corrupt or invalid file is rejected with a plain-language error and
  nothing is written.

## Reminder

If a project has unsaved-to-file changes older than 7 days, a dismissible
banner appears on the project:

```text
Last backup 12 days ago. [ Download Backup ]  [ dismiss ]
```

Non-blocking, never a modal.

---

# 31. Session, Resume and Crash Recovery

The project must survive browser refresh, app close, device sleep, process
kill and OS-driven eviction pressure.

- All committed work lives in IndexedDB; reopening the workspace restores
  the exact floor state.
- A mid-gesture polygon draft is persisted as part of session state on every
  point add; reopening offers "Continue tracing Shop - 4 corners placed?" or
  discard.
- Camera (zoom/pan) per floor is session state and restores on reopen.
- Undo history is not persisted (autosave is the safety net; see section 17).

---

# 32. Error Handling

## Global rules

- React error boundaries around the canvas, workspace and each route.
  A crash in one place never blanks the app; the boundary offers
  "Reload workspace" and reports what happened in plain language.
- Every user-facing error message states what happened and one next action.
  No raw error codes, no stack traces, no dead ends.
- Storage errors are first-class citizens: quota exceeded, private-mode
  eviction and corruption each have a specific message and a backup-import
  recovery path.

## Mapping errors

- Invalid geometry cannot be created: Done stays disabled, the reason is
  inline ("Need at least 3 corners").
- A failed autosave retries with backoff and surfaces the SaveIndicator
  error state with a "Retry now" tap target.

## Never block the core loop

No permission, no network state, no storage warning and no non-fatal error
may prevent plotting. Worst case, the mapper plots and the app tells them
what could not be saved afterward.

---

# 33. PWA and Offline

Requirements:

- Web app manifest, app icon, maskable icon, standalone mode.
- Service worker via Serwist: precache the full app shell and all static
  assets. The app is fully static, so the entire app works offline after
  first load.
- Install prompt surfaced once per project list visit until accepted or
  dismissed twice.
- "Add to Home Screen -> open app -> map without internet" is an E2E-tested
  scenario, not an aspiration (section 37).

Offline is the normal case:

```text
Offline -> Create project -> Map floor -> Add places
        -> Finish -> Export GeoJSON -> Download backup
```

No step above requires a network request. Zero server requests exist in the
core loop at all.

---

# 34. Photos

Optional photos attached to places (shop fronts, entrances, stairs, lifts).

- Captured via file input with `capture="environment"` (camera) — no custom
  camera UI, no media stream permissions.
- Stored in IndexedDB as compressed data URIs (target: longest edge 1280px,
  JPEG quality 0.8, client-side downscale before storage).
- Shown in the place detail sheet; included in backup files; referenced as
  `photo` (data URI) or `photoRef` in GeoJSON export only if size permits —
  GeoJSON includes a `photoCount` property always, inline photos only when
  the total export stays under 20 MB.
- Storage-quota errors on photo save degrade gracefully: photo is skipped,
  mapping continues, user is told exactly that.

---

# 35. Accessibility

- All interactive elements: 48px minimum target, visible focus states,
  keyboard operable on desktop.
- The canvas has a keyboard-relevant alternative on desktop: arrow-key panning
  and a feature list panel for selection and editing.
- Screen reader labels on every control; canvas state changes (tool selected,
  object added) announced via polite live region.
- Color is never the only carrier of meaning (snapping shows a ring + label).
- `prefers-reduced-motion` respected; no essential animation.
- axe checks on all primary screens in CI.

---

# 36. Performance Budgets

Measured on a mid-range Android device, cold cache:

| Metric                               | Budget                                       |
| ------------------------------------ | -------------------------------------------- |
| First load (installed, cached shell) | Interactive < 2 s                            |
| Canvas pan/zoom with 500 objects     | 60 fps, no long tasks > 50 ms during gesture |
| Autosave commit latency              | < 100 ms p95                                 |
| Export 2,000 features                | < 1 s, no jank (async with progress)         |
| Mapping route initial JS             | < 400 KB gz                                  |
| IndexedDB write on complete gesture  | 1 transaction, < 50 ms                       |

Budgets are enforced with a CI size check on the mapping route bundle; the
budget may be raised only with a written reason in the PR.

---

# 37. Testing Requirements

Testing is a requirement of done, not a phase.

### Unit (Vitest, Node)

- `lib/domain`: geometry math, snapping, validation, polygon rules,
  connection graph, junction splitting.
- `lib/geojson`: exporter golden files; coordinate honesty (no WGS84 lies);
  schema-version stamping.
- `lib/backup`: export -> import round-trip identity; old-version migration;
  corrupt file rejection.

### Integration (Vitest + fake-indexeddb)

- Repositories against real Dexie semantics: transactions, migrations
  v1 -> vN, autosave commit behavior, quota-error paths.

### E2E (Playwright)

- Profile: mobile viewport 320x690 and 390x844, touch enabled.
- Happy path: create project -> create floor -> trace path -> snap second
  path into a junction -> add shop polygon -> rename from detail sheet ->
  add stairs connecting to a new floor -> map stub floor -> finish ->
  export GeoJSON -> validate downloaded file parses and matches.
- Persistence: mid-session reload; app reopen; mid-polygon reload.
- Offline: context.setOffline(true) before load; full flow must pass.
- Backup: export -> wipe DB (fresh context) -> import -> identical export.
- Desktop pass: capture tools hidden, editing available.

### Accessibility

- @axe-core/playwright on projects, workspace, detail sheets: zero critical
  violations.

### CI (GitHub Actions, every PR)

```text
lint -> typecheck -> unit -> build -> e2e (Playwright) -> bundle-size check
```

A red CI blocks merge. No exceptions.

---

# 38. Development Phases

Ordered for risk: the canvas and storage engine (the two hard parts) come
first; breadth of types comes later. Each phase ends with its acceptance
criteria green in CI.

## Phase 1 — Foundation

- Next.js + TypeScript strict + Tailwind + shadcn/ui scaffold
- ESLint + Prettier, Vitest, Playwright, GitHub Actions pipeline (all green on hello-world)
- Dexie schema v1, repositories, migration harness, storage-health utilities
- App shell, theme, routing, PWA manifest + Serwist precache

## Phase 2 — Projects and Floors

- Project CRUD, dashboard list, empty states
- Floor CRUD, custom naming, ordering, statuses
- Backup export/import with validation and migration
- Settings (step length, theme)

## Phase 3 — Canvas Core

- Konva host: pan/zoom, grid, DPR-aware rendering
- Touch model: one-finger draw vs two-finger navigate
- Snapping engine (grid, endpoints, segments) with visual indicators
- Trace Path tool with undo/redo and autosave
- Select tool: move corners, edit vertices, delete with undo toast

## Phase 4 — Places

- Add Place type picker (data-driven catalog)
- Point capture; polygon capture with validity gating
- Detail sheets with conditional fields; rename/retype anytime
- Photos with client-side downscale and graceful quota handling

## Phase 5 — Connections

- Endpoint/segment snapping to connect paths; junction splitting
- Vertical connectors: floor linking, forward-declared floors, cross-floor stubs
- Door connections to adjacent paths

## Phase 6 — Scale and Measurement

- Set Real Length calibration flow
- Length labels, step-count helper, unit display for uncalibrated floors

## Phase 7 — Export

- GeoJSON serializer with Zod validation and golden tests
- Floor and project export, download UX, large-export progress

## Phase 8 — Hardening

- Offline E2E green end-to-end; install prompt; persistence permission
- Storage quota warnings; error boundaries; recovery screens
- Crash/resume matrix (refresh, kill, mid-polygon)

## Phase 9 — Polish and QA

- 320/360/375/390/412/430px sweep; tablet; desktop editing pass
- Dark theme; reduced motion; axe clean; performance budgets met
- Full acceptance criteria (section 39) signed off

---

# 39. Acceptance Criteria

### AC-01 — No floor plan, no account, no network

A first-time user can go from opening the app to plotting on a floor without
any sign-up, upload, or network request. (Change from V1: login removed.)

### AC-02 — Predictable plotting

Every tap lands exactly where the geometry renders, modulo visible snapping.

### AC-03 — Calibrated measurements

After Set Real Length, all length labels and exported coordinates are in real
meters consistent with the calibration; uncalibrated floors are labeled as
units and never claim meters.

### AC-04 — Valid shapes only

A polygon with fewer than 3 unique corners cannot be saved; the UI explains
why inline. A path with fewer than 2 points cannot be saved.

### AC-05 — Live autosave

Every completed gesture is committed to IndexedDB within 1 second; killing
the browser process immediately afterward loses nothing.

### AC-06 — Crash recovery

Refreshing mid-polygon, mid-session, or after force-closing the PWA resumes
with all committed data and the in-progress draft offered back.

### AC-07 — Backup round-trip

Export backup -> fresh browser -> import -> the re-exported backup is
byte-equivalent (modulo timestamps) to the original.

### AC-08 — Connections preserved

Snapped paths share nodes; junctions exist wherever 3+ paths meet; stairs,
lifts and escalators carry fromFloor/toFloor/direction in export.

### AC-09 — Valid GeoJSON

Exported files parse with standard GeoJSON tooling, declare their local
coordinate system honestly, and match golden fixtures.

### AC-10 — Offline end-to-end

With the network fully disabled after install: create, map, connect, finish,
export and back up all succeed.

### AC-11 — Mobile-first

The complete workflow is comfortable at 320px with 48px targets and no
horizontal page scroll.

### AC-12 — Desktop boundaries

Desktop can view and edit everything but is not offered the mobile capture
tools.

### AC-13 — Error dignity

Every error state names what happened and one next action; no dead ends; the
canvas loop is never blocked by a non-fatal error.

### AC-14 — CI green

Lint, typecheck, unit, build, E2E, a11y and bundle-size checks pass on every
merged PR.

---

# 40. Example Real-World Session

Mapper enters ABC Shopping Mall with no floor plan.

1. Opens Walk & Plot (installed, offline-capable). Lands on My Projects.
2. New Project -> "ABC Shopping Mall". Creates floor "Ground".
3. Start mapping. Traces the entrance-to-atrium corridor.
4. Snaps a second corridor into it at the atrium: a junction appears.
5. Add Place -> Shop. Traces the shop boundary, taps Done. Names it
   "ABC Fashion", number 304, in the detail sheet.
6. Selects the corridor, runs Set Real Length on the known 12.5 m wall.
   The floor rescales; labels now show meters.
7. Add Place -> Stairs. Points Up, connects to "Floor 1 (create)".
8. Opens Floor 1: the stair stub exists. Traces Floor 1's corridor from it.
9. Phone dies mid-floor. Reopens: everything plotted so far is there; the
   mid-trace draft is offered back.
10. Finishes both floors, downloads `ABC-Shopping-Mall.geojson` and a
    backup file for safety.

Total interactions with forms: one project name, one shop name, one length.
Everything else was taps on a canvas.

---

# 41. Future (V3 and Beyond)

Pulled from V1's future section, unchanged in intent, now unblocked by the
graph-and-schema-first V2 data model:

- Cloud sync and accounts (auth returns here, together, with a purpose)
- PostgreSQL / PostGIS server storage
- Multi-mapper collaboration
- Review workflow: draft -> review -> approved -> published
- Geographic calibration from anchors to WGS84
- Sensor-assisted tracing (TrackingProvider ghost trails, AR where available)
- Indoor routing on the connection graph
- Search ("Aarong -> Floor 3, Shop 312")
- Accessibility-aware and emergency routing

---

# 42. Final V2 Definition

Walk & Plot V2 is a:

> **Fully offline, installable, mobile-first PWA that lets a field worker walk
> through an unknown building with no account and no floor plan, plot
> corridors, places and floor connections on a calibrated canvas with plain
> gestures, never lose a completed action to a crash or a lost device thanks
> to autosave and backup files, and download the survey as honest, valid,
> structured GeoJSON.**

The essential loop:

```text
                  OPEN APP (no login)
                        |
                    NEW PROJECT
                        |
                     NEW FLOOR
                        |
                 PLOT ON CANVAS
                        |
          +-------------+-------------+
          |             |             |
      TRACE PATH     ADD PLACE    CONNECT FLOORS
      (corridors)   (shops, ...)  (stairs/lifts)
          |             |             |
          +------+------+------+------+
                 |
       AUTOSAVE (every gesture)
                 |
            FINISH FLOOR
                 |
     EXPORT GEOJSON + BACKUP FILE
```

**V2 success means:** a person enters a building with no floor plan and no
internet, maps a meaningful portion of its indoor structure using only
taps, closes the app at any point without losing anything, recovers or moves
their data with a file, and downloads valid GeoJSON — and a developer who has
never seen the codebase can become productive in it within a day because the
stack is conventional, the domain logic is pure and tested, and the PRD said
what to build.
