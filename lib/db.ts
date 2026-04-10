import { Pool } from 'pg';

let pool: Pool | null = null;

function getConnectionString(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  return databaseUrl.includes('sslmode=')
    ? databaseUrl.replace(/sslmode=[^&]+/, 'sslmode=verify-full')
    : `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}sslmode=verify-full`;
}

function getPool(): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: getConnectionString(),
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
    keepAlive: true,
    application_name: 'gippidy',
  });
  return pool;
}

export const query = async (sql: string, params?: unknown[]) => getPool().query(sql, params);
