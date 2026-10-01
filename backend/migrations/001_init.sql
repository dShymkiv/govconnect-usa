-- GovConnect USA — initial schema (JSONB payloads for smooth JSON→Postgres migration)

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx
  ON users ((lower(payload->>'email')));
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_idx
  ON users ((payload->>'phoneE164'))
  WHERE payload->>'phoneE164' IS NOT NULL;

CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS documents_user_id_idx
  ON documents ((payload->>'userId'));

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx
  ON refresh_tokens ((payload->>'userId'));

-- One-time QR verification sessions for document share/verify
CREATE TABLE IF NOT EXISTS qr_verifications (
  id          TEXT PRIMARY KEY,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mock DMV / IRS / unemployment agency applications
CREATE TABLE IF NOT EXISTS agency_applications (
  id          UUID PRIMARY KEY,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS agency_applications_user_id_idx
  ON agency_applications ((payload->>'userId'));

CREATE TABLE IF NOT EXISTS document_requests (
  id          UUID PRIMARY KEY,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS document_requests_user_id_idx
  ON document_requests ((payload->>'userId'));

CREATE TABLE IF NOT EXISTS vehicle_fines (
  id          UUID PRIMARY KEY,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vehicle_fines_user_id_idx
  ON vehicle_fines ((payload->>'userId'));

-- SMS one-time login codes (hashed at rest)
CREATE TABLE IF NOT EXISTS sms_otps (
  id           UUID PRIMARY KEY,
  phone_e164   TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  attempts     INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sms_otps_phone_idx
  ON sms_otps (phone_e164, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id          UUID PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL,
  action      TEXT NOT NULL,
  user_id     UUID NULL,
  resource    TEXT NULL,
  outcome     TEXT NOT NULL,
  ip          TEXT NULL,
  request_id  TEXT NULL,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS audit_events_ts_idx ON audit_events (ts DESC);
CREATE INDEX IF NOT EXISTS audit_events_user_id_idx ON audit_events (user_id);
