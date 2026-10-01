'use strict';

require('dotenv').config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.startsWith('REPLACE_WITH')) {
    throw new Error(`Missing or placeholder env var: ${name}. Copy .env.example → .env and set real values.`);
  }
  return value;
}

const storageDriver = (process.env.STORAGE_DRIVER || 'json').toLowerCase();

const config = {
  port: Number(process.env.PORT) || 3001,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',

  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  dataEncryptionKey: requireEnv('DATA_ENCRYPTION_KEY'),
  jwtAccessSecret: requireEnv('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: requireEnv('JWT_REFRESH_SECRET'),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || '15m',
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL || '7d',

  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
    authMax: Number(process.env.AUTH_RATE_LIMIT_MAX) || 20,
  },

  storageDriver,
  databaseUrl: process.env.DATABASE_URL || '',
  databaseSsl: process.env.DATABASE_SSL === 'true',

  // SMS: auto uses Twilio when credentials are set, otherwise mock console gateway
  sms: {
    provider: (process.env.SMS_PROVIDER || 'auto').toLowerCase(),
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioFromNumber: process.env.TWILIO_FROM_NUMBER || '',
    twilioVerifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID || '',
    // Trial Messages API cannot send custom OTP text — only template names like sms_2fa
    twilioTrialTemplates: process.env.TWILIO_TRIAL_TEMPLATES !== 'false',
  },

  // SMS OTP
  otp: {
    ttlSeconds: Number(process.env.OTP_TTL_SECONDS) || 300,
    length: Number(process.env.OTP_LENGTH) || 6,
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS) || 5,
    resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS) || 60,
    /**
     * Return OTP in API JSON for demos.
     * Default: true for mock, false when Twilio is configured (override with OTP_DEV_RETURN_CODE).
     */
    returnCodeInDev: (() => {
      if (process.env.OTP_DEV_RETURN_CODE === 'true') return true;
      if (process.env.OTP_DEV_RETURN_CODE === 'false') return false;
      const twilioReady = Boolean(
        process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
      );
      const hasChannel = Boolean(
        process.env.TWILIO_VERIFY_SERVICE_SID || process.env.TWILIO_FROM_NUMBER
      );
      const provider = (process.env.SMS_PROVIDER || 'auto').toLowerCase();
      const usingTwilio =
        provider.startsWith('twilio') || (provider === 'auto' && twilioReady && hasChannel);
      return !usingTwilio && !configIsProd();
    })(),
  },
};

function configIsProd() {
  return process.env.NODE_ENV === 'production';
}

if (storageDriver === 'postgres' && !config.databaseUrl) {
  throw new Error('DATABASE_URL is required when STORAGE_DRIVER=postgres');
}

module.exports = { config };
