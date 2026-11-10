-- Schema migrations ledger + security/performance hardening

CREATE TABLE IF NOT EXISTS schema_migrations (
  id          TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit integrity column (HMAC hex) for tamper-evidence narrative
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS integrity TEXT;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_outcome_chk;
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_outcome_chk
  CHECK (outcome IN ('success', 'failure', 'denied'));

-- OTP challenge integrity
ALTER TABLE sms_otps
  DROP CONSTRAINT IF EXISTS sms_otps_attempts_chk;
ALTER TABLE sms_otps
  ADD CONSTRAINT sms_otps_attempts_chk
  CHECK (attempts >= 0 AND attempts <= max_attempts + 50);

ALTER TABLE sms_otps
  DROP CONSTRAINT IF EXISTS sms_otps_max_attempts_chk;
ALTER TABLE sms_otps
  ADD CONSTRAINT sms_otps_max_attempts_chk
  CHECK (max_attempts > 0 AND max_attempts <= 20);

CREATE INDEX IF NOT EXISTS sms_otps_active_idx
  ON sms_otps (phone_e164, created_at DESC)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS qr_verifications_expires_idx
  ON qr_verifications ((payload->>'expiresAt'));

CREATE INDEX IF NOT EXISTS refresh_tokens_active_user_idx
  ON refresh_tokens ((payload->>'userId'))
  WHERE (payload->>'revoked') IS DISTINCT FROM 'true';

CREATE INDEX IF NOT EXISTS documents_user_type_idx
  ON documents ((payload->>'userId'), (payload->>'type'));

CREATE INDEX IF NOT EXISTS agency_applications_user_service_idx
  ON agency_applications ((payload->>'userId'), (payload->>'serviceId'));
