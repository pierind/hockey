# HockeyCoach
Hockey training planner tool: design drills on an ice rink using the SIHF symbol legend, keep them in a library, group them in collections and plan printable training sessions. Data stays in the browser (IndexedDB); use backup export/import to keep a copy.

Scope and decisions: [docs/planning-tool-mvp.md](docs/planning-tool-mvp.md). Categories are read from [docs/reference/sihf-u12-development-plan.md](docs/reference/sihf-u12-development-plan.md).

## Run

Requires Node 24 LTS.

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # unit tests
npm run build   # static site in dist/
npm run e2e     # browser workflow + offline test (first time: npx playwright install chromium)
```

## Import drills (private use)

```sh
node scripts/import-mobilesport.mjs   # → private/mobilesport.json (121 drills from mobilesport.ch)
```

Load the file with «Backup importieren → Hinzufügen». Imported drills arrive as drafts with the original
diagram (loaded from the source site, so online only) and a source link; draw your own diagram to replace it.
`private/` is gitignored: the fetched content is for private use and must not be committed to this public repo.

## Publish

`.github/workflows/pages.yml` builds and deploys to GitHub Pages on every push to `main`
(one-time: repository Settings → Pages → Source: GitHub Actions). The app then runs at
https://pierind.github.io/hockey/, can be installed to the home screen and works offline.
Data stays in each browser; move it between devices with backup export / import («Hinzufügen»).
