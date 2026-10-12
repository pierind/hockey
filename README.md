# hockey
Hockey training planner tool: design drills on an ice rink using the SIHF symbol legend, keep them in a library, group them in collections and plan printable training sessions. Data stays in the browser (IndexedDB); use backup export/import to keep a copy.

Scope and decisions: [docs/planning-tool-mvp.md](docs/planning-tool-mvp.md). Categories are read from [docs/reference/sihf-u12-development-plan.md](docs/reference/sihf-u12-development-plan.md).

## Run

Requires Node 24 LTS.

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # unit tests
npm run build   # static site in dist/
```
