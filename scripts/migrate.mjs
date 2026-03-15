import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL });

await pool.query(`
  CREATE TABLE IF NOT EXISTS shared_chats (
    id            TEXT PRIMARY KEY,
    created_by    TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    model         TEXT NOT NULL,
    system_prompt TEXT,
    messages      JSONB NOT NULL
  )
`);

console.log('✓ shared_chats table ready');
await pool.end();
