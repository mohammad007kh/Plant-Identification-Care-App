import { defineConfig } from 'drizzle-kit';

// Drizzle Kit config: generates SQL migrations from ./src/db/schema into ./drizzle.
// `drizzle-kit generate` is offline (schema → SQL). `migrate`/`push` need a live DB.
export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://plant:plant@localhost:5433/plant',
  },
  strict: true,
  verbose: true,
});
