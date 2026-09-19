// Deletes the e2e SQLite file so each E2E run starts from a clean, freshly migrated + seeded database.
import { rmSync } from 'node:fs';

if (process.env.DATABASE_URL !== 'file:./e2e.db') {
  throw new Error('reset-e2e-db.mjs only runs against file:./e2e.db');
}
for (const f of ['prisma/e2e.db', 'prisma/e2e.db-journal']) rmSync(f, { force: true });
