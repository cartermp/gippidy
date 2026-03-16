import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

export const query = (sql: string, params?: unknown[]) => pool.query(sql, params);
