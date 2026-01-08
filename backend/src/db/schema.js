const { pool } = require('./pool');

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nome TEXT NOT NULL,
      cognome TEXT NOT NULL,
      data_nascita DATE NOT NULL,
      professione TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS email_otps (
      email TEXT PRIMARY KEY,
      otp_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      last_sent_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS calculations (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      professione TEXT NOT NULL,
      riquadro TEXT NOT NULL,
      criterio TEXT NOT NULL,
      input_json JSONB NOT NULL,
      result_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      calculation_id UUID NOT NULL REFERENCES calculations(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE calculations
      ADD COLUMN IF NOT EXISTS name TEXT;

    ALTER TABLE calculations
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS avatar_url TEXT;

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS studio_nome TEXT;

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS sede_indirizzo TEXT;

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS sede_citta TEXT;

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS sede_cap TEXT;

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS sede_provincia TEXT;
  `);
}

module.exports = { ensureSchema };
