import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

const pool = global._pgPool ?? new Pool({ connectionString: process.env.POSTGRES_URL });
if (process.env.NODE_ENV !== 'production') global._pgPool = pool;

export const query = (sql: string, params?: unknown[]) => pool.query(sql, params);
