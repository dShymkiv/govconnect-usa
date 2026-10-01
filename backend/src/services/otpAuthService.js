'use strict';

const crypto = require('crypto');
const { config } = require('../config');
const { uuidv4 } = require('../utils/ids');
const { findWhere, upsert } = require('../repositories/store');
const otpStore = require('../repositories/otpStore');
const { sendOtp, checkTwilioVerify } = require('./smsGateway');
const { encryptFields, decryptFields } = require('../security/encryption');
const { USER_PII_FIELDS } = require('../security/piiFields');
const { signAccessToken, signRefreshToken } = require('../security/tokens');
const { audit } = require('../security/audit');
const { verifyPassword } = require('../security/password');

const TWILIO_VERIFY_MARKER = 'twilio-verify';
const TWO_FA_PREFIX = '2fa:';

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    state: user.state,
    isStudent: user.isStudent === true,
    phoneMasked: user.phoneE164
      ? `${String(user.phoneE164).slice(0, 2)}******${String(user.phoneE164).slice(-4)}`
      : null,
    ial: user.ial,
    aal: user.aal,
    createdAt: user.createdAt,
  };
}

function normalizePhone(input) {
  const digits = String(input || '').replace(/[^\d+]/g, '');
  let e164 = digits;
  if (/^\d{10}$/.test(digits)) e164 = `+1${digits}`;
  if (/^1\d{10}$/.test(digits)) e164 = `+${digits}`;
  if (!/^\+[1-9]\d{9,14}$/.test(e164)) {
    const err = new Error('Phone must be a valid E.164 number (e.g. +13125550142)');
    err.status = 400;
    err.code = 'INVALID_PHONE';
    throw err;
  }
  return e164;
}

function generateCode(length) {
  const max = 10 ** length;
  const n = crypto.randomInt(0, max);
  return String(n).padStart(length, '0');
}

function hashCode(phoneE164, code) {
  return crypto
    .createHmac('sha256', config.jwtAccessSecret)
    .update(`${phoneE164}:${code}`)
    .digest('hex');
}

function loadUserDecrypted(user) {
  if (!user) return null;
  return decryptFields(user, USER_PII_FIELDS);
}

async function findUserByPhone(phoneE164) {
  const matches = await findWhere('users', (u) => {
    const phone = u.phoneE164 || decryptFields(u, USER_PII_FIELDS).phone;
    return phone === phoneE164;
  });
  return matches[0] || null;
}

function authFailed(ctx, phoneE164, reason) {
  audit({
    action: 'AUTH_2FA_DENIED',
    outcome: 'failure',
    ip: ctx.ip,
    requestId: ctx.requestId,
    meta: { phoneLast4: phoneE164 ? phoneE164.slice(-4) : null, reason },
  });
  const err = new Error('Invalid phone or password');
  err.status = 401;
  err.code = 'AUTH_INVALID';
  throw err;
}

async function assertPhonePassword({ phone, password }, ctx = {}) {
  const phoneE164 = normalizePhone(phone);
  if (!password || typeof password !== 'string') {
    authFailed(ctx, phoneE164, 'missing_password');
  }

  const user = await findUserByPhone(phoneE164);
  if (!user || !user.passwordHash) {
      await verifyPassword(
      password,
      '$2b$12$H8HxSqzqrdUFP9k642bK8eIpozSkS8G3uyg6QOvSrBfz87twfdXdq'
    );
    authFailed(ctx, phoneE164, 'user_or_password_missing');
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    authFailed(ctx, phoneE164, 'bad_password');
  }

  return { phoneE164, user };
}

async function requestOtp({ phone, password }, ctx = {}) {
  const { phoneE164, user } = await assertPhonePassword({ phone, password }, ctx);

  const existing = await otpStore.findLatestActive(phoneE164);
  if (existing) {
    const created = new Date(existing.createdAt).getTime();
    const cooldownMs = config.otp.resendCooldownSeconds * 1000;
    if (Date.now() - created < cooldownMs) {
      const err = new Error(`Wait ${config.otp.resendCooldownSeconds}s before requesting another code`);
      err.status = 429;
      err.code = 'OTP_COOLDOWN';
      throw err;
    }
  }

  const code = generateCode(config.otp.length);
  const expiresAt = new Date(Date.now() + config.otp.ttlSeconds * 1000).toISOString();

  const smsResult = await sendOtp({
    to: phoneE164,
    code,
    body: `GovConnect USA code: ${code}. Valid ${Math.floor(config.otp.ttlSeconds / 60)} min. Do not share.`,
    meta: { purpose: 'login_2fa', userId: user.id },
  });

  const codeHash = smsResult.managedByTwilio
    ? `${TWO_FA_PREFIX}${TWILIO_VERIFY_MARKER}`
    : `${TWO_FA_PREFIX}${hashCode(phoneE164, code)}`;

  await otpStore.createChallenge({
    phoneE164,
    codeHash,
    expiresAt,
    maxAttempts: config.otp.maxAttempts,
  });

  audit({
    action: 'AUTH_OTP_REQUESTED',
    userId: user.id,
    outcome: 'success',
    ip: ctx.ip,
    requestId: ctx.requestId,
    meta: {
      phoneLast4: phoneE164.slice(-4),
      provider: smsResult.provider,
      factors: ['password', 'sms_otp'],
    },
  });

  const response = {
    ok: true,
    phoneMasked: `${phoneE164.slice(0, 2)}******${phoneE164.slice(-4)}`,
    expiresInSeconds: config.otp.ttlSeconds,
    provider: smsResult.provider,
    factors: ['password', 'sms_otp'],
    message:
      smsResult.provider === 'mock'
        ? 'Verification code sent via mock SMS.'
        : 'Verification code sent via SMS.',
  };

  if (
    !config.isProd &&
    config.otp.returnCodeInDev &&
    smsResult.provider === 'mock'
  ) {
    response.devCode = code;
  } else if (
    !config.isProd &&
    process.env.OTP_DEV_RETURN_CODE === 'true' &&
    !smsResult.managedByTwilio
  ) {
    response.devCode = code;
  }

  return response;
}

async function verifyOtp({ phone, code, password }, ctx = {}) {
  const { phoneE164, user } = await assertPhonePassword({ phone, password }, ctx);
  const challenge = await otpStore.findLatestActive(phoneE164);

  if (!challenge) {
    audit({
      action: 'AUTH_OTP_MISSING',
      outcome: 'failure',
      userId: user.id,
      ip: ctx.ip,
      requestId: ctx.requestId,
      meta: { phoneLast4: phoneE164.slice(-4) },
    });
    const err = new Error('No active verification code. Request a new one.');
    err.status = 400;
    err.code = 'OTP_NOT_FOUND';
    throw err;
  }

  if (!String(challenge.codeHash || '').startsWith(TWO_FA_PREFIX)) {
    const err = new Error('This code was issued without password verification. Request a new one.');
    err.status = 400;
    err.code = 'OTP_NOT_2FA';
    throw err;
  }

  if (new Date(challenge.expiresAt).getTime() < Date.now()) {
    audit({
      action: 'AUTH_OTP_EXPIRED',
      outcome: 'denied',
      userId: user.id,
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    const err = new Error('Verification code expired');
    err.status = 410;
    err.code = 'OTP_EXPIRED';
    throw err;
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    const err = new Error('Too many invalid attempts. Request a new code.');
    err.status = 429;
    err.code = 'OTP_LOCKED';
    throw err;
  }

  const stored = String(challenge.codeHash).slice(TWO_FA_PREFIX.length);
  const expected = hashCode(phoneE164, String(code).trim());
  let ok = false;

  if (stored === TWILIO_VERIFY_MARKER) {
    try {
      ok = await checkTwilioVerify({ to: phoneE164, code });
    } catch {
      ok = false;
    }
  } else {
    try {
      ok =
        stored.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(stored, 'hex'));
    } catch {
      ok = false;
    }
  }

  if (!ok) {
    await otpStore.incrementAttempts(challenge.id);
    audit({
      action: 'AUTH_OTP_INVALID',
      outcome: 'failure',
      userId: user.id,
      ip: ctx.ip,
      requestId: ctx.requestId,
      meta: { phoneLast4: phoneE164.slice(-4) },
    });
    const err = new Error('Invalid verification code');
    err.status = 401;
    err.code = 'OTP_INVALID';
    throw err;
  }

  await otpStore.consume(challenge.id);

  const aal = 'AAL2';
  const ial = user.ial || 'IAL1';
  if (user.aal !== aal) {
    user.aal = aal;
    await upsert('users', user);
  }

  const jti = uuidv4();
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    aal,
    ial,
  });
  const refreshToken = signRefreshToken({ sub: user.id, jti });
  await upsert('refresh_tokens', {
    id: jti,
    userId: user.id,
    createdAt: new Date().toISOString(),
    revoked: false,
  });

  audit({
    action: 'AUTH_2FA_LOGIN_SUCCESS',
    userId: user.id,
    outcome: 'success',
    ip: ctx.ip,
    requestId: ctx.requestId,
    meta: { aal, ial, factors: ['password', 'sms_otp'] },
  });

  const publicUser = toPublicUser(loadUserDecrypted(user));
  publicUser.aal = aal;

  return {
    user: publicUser,
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: '15m',
    assurance: {
      ial,
      aal,
      factors: ['password', 'sms_otp'],
    },
  };
}

module.exports = {
  normalizePhone,
  requestOtp,
  verifyOtp,
  findUserByPhone,
};
