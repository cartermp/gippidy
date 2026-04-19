import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

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

await pool.query(`
  CREATE TABLE IF NOT EXISTS user_settings (
    email         TEXT PRIMARY KEY,
    system_prompt TEXT NOT NULL DEFAULT '',
    save_history  BOOLEAN NOT NULL DEFAULT FALSE,
    key_jwk       TEXT,
    girl_mode     BOOLEAN NOT NULL DEFAULT FALSE
  )
`);
await pool.query(`
  ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS save_history BOOLEAN NOT NULL DEFAULT FALSE
`);
await pool.query(`
  ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS key_jwk TEXT
`);
await pool.query(`
  ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS girl_mode BOOLEAN NOT NULL DEFAULT FALSE
`);
console.log('✓ user_settings table ready');

await pool.query(`
  CREATE TABLE IF NOT EXISTS chat_histories (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_email  TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    iv          TEXT NOT NULL,
    ciphertext  TEXT NOT NULL,
    title_iv    TEXT,
    title_ciphertext TEXT
  )
`);
await pool.query(`
  ALTER TABLE chat_histories ADD COLUMN IF NOT EXISTS title_iv TEXT
`);
await pool.query(`
  ALTER TABLE chat_histories ADD COLUMN IF NOT EXISTS title_ciphertext TEXT
`);
await pool.query(`
  CREATE INDEX IF NOT EXISTS chat_histories_user_updated
    ON chat_histories(user_email, updated_at DESC)
`);
console.log('✓ chat_histories table ready');

await pool.query(`
  CREATE TABLE IF NOT EXISTS rate_limits (
    email  TEXT NOT NULL,
    bucket TIMESTAMPTZ NOT NULL,
    count  INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (email, bucket)
  )
`);
await pool.query(`
  CREATE INDEX IF NOT EXISTS rate_limits_bucket
    ON rate_limits(bucket)
`);
console.log('✓ rate_limits table ready');

await pool.end();
