-- Rename legacy table names (safe to re-run)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'presentations')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'qr_verifications') THEN
    ALTER TABLE presentations RENAME TO qr_verifications;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'service_requests')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agency_applications') THEN
    ALTER TABLE service_requests RENAME TO agency_applications;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'otp_challenges')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sms_otps') THEN
    ALTER TABLE otp_challenges RENAME TO sms_otps;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'service_requests_user_id_idx')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'agency_applications_user_id_idx') THEN
    ALTER INDEX service_requests_user_id_idx RENAME TO agency_applications_user_id_idx;
  ELSIF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'service_requests_user_id_idx') THEN
    DROP INDEX service_requests_user_id_idx;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'otp_challenges_phone_idx')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'sms_otps_phone_idx') THEN
    ALTER INDEX otp_challenges_phone_idx RENAME TO sms_otps_phone_idx;
  ELSIF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'otp_challenges_phone_idx') THEN
    DROP INDEX otp_challenges_phone_idx;
  END IF;
END $$;
