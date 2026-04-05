import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL?.replace(/sslmode=\w+/, 'sslmode=verify-full');

const pool = new Pool({
  connectionString,
  max: 3,
  idleTimeoutMillis: 10_000,
});

export const query = async (sql: string, params?: unknown[]) => pool.query(sql, params);