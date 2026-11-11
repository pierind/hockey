# HockeyCoach roadmap

Two directions, decided 2026-11-01: build **A** now; keep **B** possible without starting it. Direction C (a shared drill platform) is parked: the imported drills are for private use only, and only mobilesport.ch is openly licensed (CC BY-NC-SA).

## Plan A: personal coach tool (local-first, no server)

Everything stays in the browser (IndexedDB); devices exchange data through the backup file. Each step ships on its own, with tests.

Status 2026-11-01: A1, A2, A3, A4, A6 and A7 are done; A5 waits for the NDS import format.

| # | Step | What it delivers | Done when |
|---|---|---|---|
| A1 | **Rink mode** («Training starten») | Run a training on the iPad: the current drill fills the screen (diagram or original image, coaching points), a countdown for its minutes, the next drill shown, tap/swipe to go on, Posten-Blocks shown side by side, Taktiktafel one tap away. Screen stays on while running. | A planned training can be run start to end on an iPad without leaving the view. |
| A2 | **Upright rink in portrait** | The Taktiktafel (also inside rink mode) turns the rink upright on a portrait screen, so it is about twice as big. Drawings keep their coordinates; only the view rotates. Drill pictures stay as they are (source images contain text). | Board strokes drawn upright show correctly when the iPad is turned. |
| A3 | **Attendance stats** | Per player: trainings present/absent and percentage over a period, from the AWK already recorded; sortable on the Team page. | Team page shows rates for a chosen period. |
| A4 | **Player dossier** | Per player: notes and development goals linked to Schlüsselelemente, with a date; read in the training/attendance context. | A coach can open a player and see goals and notes. |
| A5 | **J+S NDS attendance export** | CSV in the format the J+S NDS import expects, from the AWK. Needs the J+S person number per player (never the AHV number). | **Blocked until the exact NDS import format is confirmed** (template or column spec from the NDS). |
| A6 | **Device transfer** | Import several backup files at once (e.g. all drill sources), and a reminder to export after bigger changes. | One import step sets up a new device. |
| A7 | **Clean drill view** | Hide import metadata lines («Quelle:», «Gruppen:», «Kategorie:», «Alter:», URLs) from drill text in trainings and print; the source stays as one link. | Training sheet shows only setup, flow and coaching points. |

Open questions for A: none that block A1–A4 and A6–A7.

## Plan B: team and club tool (MyIceHockey path)

Only start when several coaches or devices must share live data. B builds on A; nothing in A has to be thrown away.

### B1 Decisions first

- **Backend**: a hosted Postgres with auth and row-level security, in an EU or Swiss region (e.g. Supabase EU). Frontend stays a static site.
- **Data protection (Swiss nDSG)**: the app would hold data about minors. Needed: privacy notice, data minimisation (no AHV number, no health data), access only for the team's coaches, deletion on request, a processing agreement with the host.
- **Roles**: owner (head coach), coach, assistant (read and attendance only). Players and parents only later (B5), if at all.
- **Licences**: imported drills stay in the owner's private library and are never shared with other users; shared libraries only contain own or openly licensed drills.

### B2 Accounts and cloud copy of one coach's data

Login, then the same `Db` that A keeps in IndexedDB is stored per user in the cloud. Local stays the working copy (offline at the rink), synced on open and after saves. Conflict rule: last write wins per record, by `updatedAt`; trainings, drills, players and games are separate records.

### B3 Teams and shared data

A team owns players, games, season plans and trainings; coaches are invited by e-mail. Drills stay per user, shareable into a team library (own drills only).

### B4 Migration

«Backup importieren» into the cloud account turns an A installation into a B account in one step; the backup file keeps working as an export.

### B5 Optional: players and parents

Read-only schedule and line-ups, attendance self-report. Each is a separate decision, because it widens who sees data about minors.

### Cost and effort (rough)

B2 alone is about the size of everything built so far in A; B3 again as much. Hosting is small (free tier to low monthly cost) until many teams use it.
