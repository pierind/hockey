import { defineConfig } from '@playwright/test'

// Browser workflow test (npm run e2e). Own port so it never reuses a dev server you have open.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts', // not *.test.ts, so Vitest leaves it alone
  use: { baseURL: 'http://localhost:5199', viewport: { width: 1400, height: 1000 } },
  webServer: [
    { command: 'npm run dev -- --port 5199 --strictPort', url: 'http://localhost:5199', reuseExistingServer: false },
    // Production build, for the offline test (the service worker only runs there).
    { command: 'npm run build && npx vite preview --port 5198 --strictPort', url: 'http://localhost:5198', reuseExistingServer: false },
  ],
})
