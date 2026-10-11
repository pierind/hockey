# Ice hockey planning tool — basic version

Status: planning only. No application code, dependencies or framework configuration have been created.

## Confirmed scope

- Design editable ice hockey drills with drag/drop and drawing.
- Store title, description and coaching key points.
- Categorize drills using the supplied SIHF U12 Erscheinungsformen.
- Save drills in a library.
- Combine drills into both reusable collections and ordered training sessions.
- Work in one browser/device, without accounts or a backend.
- Export/import backups so browser storage is not the only copy.

Reference: [SIHF U12 development plan](reference/sihf-u12-development-plan.md). This contains nine distinct Erscheinungsformen, the source objectives and all 102 scheduled training entries. It does not imply that every SIHF category for every age group is included.

## 1. Three concepts, not three copies of every drill

| Concept | Purpose | Basic actions |
| --- | --- | --- |
| Drill library | All saved drills | Create, find, open, edit, duplicate, delete |
| Collection | Named reusable grouping, e.g. passing or U12 skating | Create, rename, add/remove drills |
| Training session | Ordered plan for one practice | Name, optional date, add/reorder/remove drills, set duration, see total time |

Proposed behavior, to confirm before implementation:

- Collections reference library drills; editing a drill updates its collections.
- Adding a drill to a session takes a snapshot, including its drawing and metadata. Later library edits do not silently change an already planned practice.
- A session can use the same drill more than once, with different durations or notes.
- Removing a drill from a collection or session does not delete the library drill.
- Deleting a library drill requires confirmation and explains which collections will lose the reference. Saved session snapshots remain intact.
- Adding a collection to a session copies its drills into session entries; changing the collection later does not rewrite the session.

These semantics avoid accidental historical changes without introducing a full revision-history system.

## 2. Drill designer

### Workspace

```text
Library / Collections / Sessions

Title                         Save | Duplicate | Undo | Redo
----------------------------------------------------------------
Tool palette | Rink and editable diagram | Drill details
             |                          | Description
             |                          | Coaching key points
             |                          | Erscheinungsformen
             |                          | SIHF elements / objectives
----------------------------------------------------------------
Legend                       Save state / validation feedback
```

Target desktop/laptop first. Pointer-based drawing should support touch where practical; a dedicated phone editing interface is outside the basic release.

### Rink and objects

- Full rink, half rink and end-zone templates, using an international-style rink diagram.
- Players from two distinguishable groups, goalkeeper, coach, puck, cone and movable goal.
- Optional player numbers and text labels.
- Drag from the palette to the rink, or select a tool and click/tap to place.
- Select, move, rotate applicable objects, duplicate and delete.
- Rink background stays locked.

The rink is an illustration, not a certified scale drawing. Do not introduce NHL/IIHF template variants unless needed.

### Drawing

- Straight and curved routes with arrowheads.
- Routes for skating forward, skating backward and skating with the puck.
- Separate pass and shot lines.
- Freehand annotation and text.
- Edit route endpoints and curve handles after drawing.
- Undo/redo for every diagram mutation, including a completed drag or freehand stroke.
- Zoom and fit-to-rink; store coordinates independently of screen size.
- Select mode and drawing mode must be distinct so dragging a player does not create a route.
- Cancel an unfinished draw with Escape; do not save half-created objects.

### Terminology and visual language

Proposed coach-facing terminology is German (Swiss spelling), with familiar English aliases where useful:

| Label | Alias / meaning |
| --- | --- |
| Spieler/in | Skater; distinguish teams by shape/label as well as color |
| Torhüter/in | Goalie |
| Trainer/in | Coach |
| Schlittschuhlaufen vorwärts | Forward skating |
| Schlittschuhlaufen rückwärts | Backward skating |
| Puckführen | Skating with puck / puck carrying |
| Pass | Pass |
| Schuss | Shot |
| Finte | Deception / deke |
| Winkelspiel | Angling |
| Nachschuss | Rebound |
| Freilaufen / Anspieloption | Support |
| Give and Go | Pass and immediately offer again |

Proposed legend: solid arrow = forward skating, dashed arrow = backward skating, wavy arrow = skating with puck, dotted arrow = pass, double-line arrow = shot. Freehand marks are annotations, not automatically classified hockey actions.

These are proposed application conventions, not rules claimed to come from the supplied PDF. Confirm the legend with the user before implementation; keep it visible and carry it into printouts. Avoid color-only distinctions.

For U12, use fair-duel/body-positioning terminology from the reference. Do not interpret "Körpereinsatz" as permission for body checking.

### Drill details

Required for a completed library drill:

- Title.
- Description: setup and execution.
- One or more coaching key points, as an editable ordered list.
- At least one of the nine source Erscheinungsformen.

Optional:

- Primary Erscheinungsform when several are selected.
- SIHF Schlüsselelement and Trainingsziel selections filtered by category.
- Suggested duration, used as the initial session duration.
- On-ice/off-ice designation, defaulting to on-ice.

Keep source learning objectives distinct from the coach's own description and key points. Source choices use stable identifiers, not display text as a unique key.

Source objectives are suggestions, not an automatic drill assessment. In particular, the PDF assigns some defensive elements to "Überzahlsituationen kreieren und erfolgreich nutzen"; retain that mapping rather than silently correcting it.

An on-ice diagram can remain empty for a text-only/off-ice drill. Incomplete editing work may be retained as a local draft, but must be visibly distinguished from a completed library drill.

## 3. Library and collections

- Grid/list of title, diagram thumbnail and category labels.
- Search title, description and key points.
- Filter by Erscheinungsform and on-ice/off-ice designation.
- Open an existing drill without flattening its diagram into an image.
- Duplicate a drill to create a variant without changing the original.
- Add a drill to multiple named collections.
- Collections have a name and optional description; no nested folders, permissions or taxonomy editor.
- Provide a clear empty state and a create-drill action.

## 4. Training session builder

- Session title and optional date.
- Add from the library or from a collection.
- Reorder with drag/drop and accessible Move up / Move down controls.
- Per-entry duration and optional session-specific coaching notes.
- Show total duration; reject invalid/negative durations rather than silently changing them.
- Show diagram, description, key points and category for every entry.
- Save, reopen, duplicate and delete sessions.
- Browser-printable session sheet with diagrams and legend; the browser's Print to PDF is sufficient initially.

No automatic annual scheduling, recommendations or category quotas. The supplied annual plan remains a reference, not a mandatory session generator.

## 5. Local persistence and data protection

Proposed implementation:

- IndexedDB for diagrams, drills, drafts, collections and sessions.
- Explicit Save for completed records; retain editor drafts locally after changes and before navigation.
- Visible states: unsaved, saving, saved and failed. Never show "saved" before the storage transaction completes.
- Full JSON backup export/import, including editable drawings and session snapshots.
- A schema version for the backup format.
- Validate imported records, object types, coordinates, identifiers and references before writing.
- First version import is a confirmed atomic replacement, not a partially working merge. Offer an export of current data before replacement.
- Treat imported text as text; do not execute HTML or arbitrary imported SVG.
- Surface storage quota, unavailable storage and import errors without pretending the operation succeeded.

Browser-local means this browser profile on this origin, not every browser on the same computer. Clearing site data, private browsing or browser eviction can lose data. The interface must say this and make backup export easy. There is no cloud backup or cross-device sync.

## 6. Technical direction, not a committed stack

The repository currently contains only a short README and no application stack.

Smallest practical starting point:

- TypeScript web app; React with Vite is a candidate, not an existing dependency.
- SVG rink and structured diagram objects for scalable drawings and print.
- A small scene representation: rink template, symbols, routes, annotations and coordinates.
- Store scene data; generate thumbnails/print output from it, rather than saving only screenshots.
- Pointer events with consistent screen-to-rink coordinate conversion.
- Reuse an established drawing library only if a focused comparison shows it saves work on handles, transforms and touch. Do not build a generic whiteboard framework.
- One app, one local data layer, no server, authentication or deployment infrastructure beyond static hosting.

No dependency should be installed until implementation is approved.

## 7. Build sequence and acceptance checks

### Milestone A — Usable designer

Metadata, source categories, rink templates, symbols, routes, labels, editing and undo/redo.

Acceptance:

- A coach can draw a two-player pass-and-shoot drill without workarounds.
- Pass and shot lines remain visually distinct.
- Curves and object positions remain editable.
- Zoom/resizing does not shift the underlying diagram.
- Undo/redo restores the whole completed gesture, not thousands of pointer samples.
- Keyboard alternatives exist for placement, movement and deletion; fields and tool buttons have accessible labels.

### Milestone B — Durable library

Local save/reopen, drafts, search/filter, duplication and complete backup export/import.

Acceptance:

- Reloading preserves diagram objects, title, description, key points and categories.
- Duplicating then editing does not mutate the original.
- All nine source categories are selectable with their exact German labels.
- Export/import round-trip preserves editable scenes and record relationships.
- Invalid import and failed storage leave existing saved data intact.
- Unsaved edits are not discarded silently.

### Milestone C — Collections and sessions

Named collections, session snapshots, ordering, durations and browser printing.

Acceptance:

- One drill belongs to two collections without creating two library copies.
- A session contains several drills, including repeated use of one drill.
- Reordering updates both the displayed and saved order.
- Library edits/deletions do not corrupt saved session snapshots.
- Totals reflect all entry durations.
- Printed diagrams and text are readable, with no clipped routes or missing legends.

Use focused unit tests for scene/state operations, reference integrity and backup validation, plus a small browser workflow covering design → save → reload → collect → build session → print/export. Choose the test runner with the approved stack; none exists yet.

## 8. Estimated implementation token use

These are planning ranges, not measured usage or a billing quote. They estimate cumulative model input/context plus generated output over a guided implementation, including tool results, tests and a normal amount of iteration. Cached/reused input may be billed differently by the chosen provider. Tokens are not app runtime usage; the proposed app needs no AI service.

| Work package | Estimated total tokens |
| --- | ---: |
| App setup, metadata UI, SIHF category wiring | 8,000–15,000 |
| Rink editor, symbols, editable routes, gestures, undo/redo | 25,000–45,000 |
| Library, drafts, IndexedDB and validated backups | 12,000–22,000 |
| Collections, session snapshots, ordering, durations and print | 10,000–18,000 |
| Focused tests, accessibility and end-to-end fixes | 15,000–25,000 |
| **Subtotal** | **70,000–125,000** |
| Iteration allowance, roughly 20% | 14,000–25,000 |
| **Basic-version budget** | **84,000–150,000** |

Approximately 10,000–20,000 generated output tokens are included in that total, not added to it. The editor is the largest uncertainty: polished touch gestures and robust route editing can increase the budget. Approve milestones separately and re-estimate after the first working designer.

The current planning/reference-writing turn is separate from that future implementation estimate. Its exact token usage is not available here.

## 9. Deliberately deferred

- Accounts, cloud sync, shared libraries and multi-coach permissions.
- AI drill generation or automatic categorization.
- Animation, video and multi-step diagram playback.
- Full season/calendar planning and progress tracking.
- Dedicated mobile editor.
- Standalone PDF-generation service or bespoke export engine.
- Custom rink variants, custom category management and nested collections.
- Full revision history and import merging.

## Decisions still needed before coding

1. Confirm German-first UI and the proposed diagram symbols/line legend.
2. Approve collection references versus session snapshots and deletion behavior.
3. Approve the SVG/TypeScript approach and static-hosting destination.

The first two affect coaching expectations and saved-data behavior, so implementation should not assume approval merely because they are proposed here.
