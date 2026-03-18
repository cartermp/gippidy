import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export const query = async (sql: string, params?: unknown[]) => {
  const debug1 = await pool.query(`
  SELECT
    current_database() AS db,
    current_user AS usr,
    current_schema() AS schema,
    current_setting('search_path') AS search_path
`);

// console log the result
  console.log('DB DEBUG 1', debug1.rows);

const debug2 = await pool.query(`
  SELECT
    schemaname,
    tablename
  FROM pg_tables
  WHERE tablename = 'rate_limits'
`);

console.log('DB DEBUG 2', debug2.rows);
  return pool.query(sql, params);
};