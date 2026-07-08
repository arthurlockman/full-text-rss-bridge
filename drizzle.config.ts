import { defineConfig } from 'drizzle-kit';
import { join } from 'node:path';

const dataDir = process.env.DATA_DIR ?? './data';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: join(dataDir, 'app.db'),
  },
});
