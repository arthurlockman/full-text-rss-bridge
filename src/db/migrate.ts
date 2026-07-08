import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, sqliteConnection } from './index.js';
import { logger } from '../logger.js';

/**
 * Applies pending Drizzle migrations from ./drizzle. Safe to run on every
 * boot; migrations are tracked in an internal table.
 */
export function runMigrations(): void {
  migrate(db, { migrationsFolder: './drizzle' });
  logger.info('Database migrations applied');
}

// Allow running directly: `tsx src/db/migrate.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
  sqliteConnection.close();
}
