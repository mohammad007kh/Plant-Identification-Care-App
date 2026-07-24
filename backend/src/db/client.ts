/**
 * Drizzle database client over a shared pg connection pool.
 * Import `db` for typed queries and `pool` for lifecycle/health.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://plant:plant@localhost:5432/plant',
});

export const db = drizzle(pool, { schema });

export type Db = typeof db;
export { schema };
