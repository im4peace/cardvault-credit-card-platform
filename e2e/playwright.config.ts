import { defineConfig } from '@playwright/test';

// E2E runs against its OWN database (backend/prisma/e2e.db) and its own ports, so it never touches the dev DB
// (backend/prisma/dev.db) or a dev server you already have running. The e2e DB is re-created and re-seeded on every run.
const API_PORT = 4100;
const UI_PORT = 5174;
const UI_URL = `http://localhost:${UI_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 60_000,
  use: { baseURL: UI_URL, trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'node reset-e2e-db.mjs && npx prisma migrate deploy && npm run seed && npm run start',
      cwd: '../backend',
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: 'file:./e2e.db',
        PORT: String(API_PORT),
        CORS_ORIGIN: UI_URL,
        JWT_SECRET: 'e2e-only-secret',
      },
    },
    {
      command: `npm run dev -- --port ${UI_PORT} --strictPort`,
      cwd: '../frontend',
      url: UI_URL,
      reuseExistingServer: false,
      env: { VITE_API_URL: API_URL },
    },
  ],
});
