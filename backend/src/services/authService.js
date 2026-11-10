'use strict';

const { uuidv4 } = require('../utils/ids');
const { findById, findWhere, upsert } = require('../repositories/store');
const { encryptFields, decryptFields } = require('../security/encryption');
const { hashPassword, verifyPassword, assertPasswordPolicy } = require('../security/password');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require('../security/tokens');
const { audit } = require('../security/audit');
const { USER_PII_FIELDS } = require('../security/piiFields');

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
      : user.phone
        ? `******${String(user.phone).slice(-4)}`
        : null,
    ial: user.ial,
    aal: user.aal,
    createdAt: user.createdAt,
  };
}

function loadUserDecrypted(user) {
  if (!user) return null;
  return decryptFields(user, USER_PII_FIELDS);
}

async function register({ email, password, firstName, lastName, state, phone }, ctx = {}) {
  assertPasswordPolicy(password);

  const existing = await findWhere('users', (u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing.length) {
    audit({
      action: 'AUTH_REGISTER_DUPLICATE',
      outcome: 'failure',
      ip: ctx.ip,
      requestId: ctx.requestId,
      meta: { emailDomain: email.split('@')[1] },
    });
    const err = new Error('Email already registered');
    err.status = 409;
    err.code = 'EMAIL_EXISTS';
    throw err;
  }

  const passwordHash = await hashPassword(password);
  let phoneE164 = null;
  if (phone) {
    const { normalizePhone } = require('./otpAuthService');
    phoneE164 = normalizePhone(phone);
  }

  const user = encryptFields(
    {
      id: uuidv4(),
      email: email.toLowerCase(),
      passwordHash,
      firstName,
      lastName,
      state: state || 'IL',
      ial: 'IAL1',
      aal: 'AAL1',
      isStudent: false,
      phoneE164,
      ssnLast4: null,
      phone: phoneE164,
      dateOfBirth: null,
      streetAddress: null,
      createdAt: new Date().toISOString(),
    },
    USER_PII_FIELDS
  );

  await upsert('users', user);
  audit({
    action: 'AUTH_REGISTER_SUCCESS',
    userId: user.id,
    outcome: 'success',
    ip: ctx.ip,
    requestId: ctx.requestId,
  });

  return toPublicUser(loadUserDecrypted(user));
}

async function login({ email, password }, ctx = {}) {
  const matches = await findWhere('users', (u) => u.email.toLowerCase() === email.toLowerCase());
  const user = matches[0];

  const fail = () => {
    audit({
      action: 'AUTH_LOGIN_FAILURE',
      outcome: 'failure',
      ip: ctx.ip,
      requestId: ctx.requestId,
      meta: { emailDomain: email.split('@')[1] },
    });
    const err = new Error('Invalid email or password');
    err.status = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  };

  if (!user || !user.passwordHash) return fail();

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return fail();

  // Session AAL reflects *this* authentication event (password-only = AAL1),
  // not the highest AAL the account has ever achieved.
  const sessionAal = 'AAL1';
  const sessionIal = user.ial || 'IAL1';
  const jti = uuidv4();
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    aal: sessionAal,
    ial: sessionIal,
  });
  const refreshToken = signRefreshToken({ sub: user.id, jti });

  await upsert('refresh_tokens', {
    id: jti,
    userId: user.id,
    createdAt: new Date().toISOString(),
    revoked: false,
    aal: sessionAal,
    ial: sessionIal,
  });

  audit({
    action: 'AUTH_LOGIN_SUCCESS',
    userId: user.id,
    outcome: 'success',
    ip: ctx.ip,
    requestId: ctx.requestId,
    meta: { aal: sessionAal, ial: sessionIal, factors: ['password'] },
  });

  const publicUser = toPublicUser(loadUserDecrypted(user));
  publicUser.aal = sessionAal;

  return {
    user: publicUser,
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: '15m',
    assurance: { ial: sessionIal, aal: sessionAal, factors: ['password'] },
  };
}

async function refresh(refreshToken, ctx = {}) {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    audit({
      action: 'AUTH_REFRESH_FAILURE',
      outcome: 'failure',
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    const err = new Error('Invalid refresh token');
    err.status = 401;
    err.code = 'INVALID_REFRESH';
    throw err;
  }

  const stored = await findById('refresh_tokens', decoded.jti);
  if (!stored || stored.userId !== decoded.sub) {
    audit({
      action: 'AUTH_REFRESH_UNKNOWN',
      userId: decoded.sub,
      outcome: 'denied',
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    const err = new Error('Refresh token revoked');
    err.status = 401;
    err.code = 'REFRESH_REVOKED';
    throw err;
  }

  // Reuse of an already-rotated refresh token → possible theft; revoke all sessions.
  if (stored.revoked) {
    const tokens = await findWhere('refresh_tokens', (t) => t.userId === decoded.sub && !t.revoked);
    for (const t of tokens) {
      t.revoked = true;
      await upsert('refresh_tokens', t);
    }
    audit({
      action: 'AUTH_REFRESH_REUSE',
      userId: decoded.sub,
      outcome: 'denied',
      ip: ctx.ip,
      requestId: ctx.requestId,
      meta: { revokedSessions: tokens.length },
    });
    const err = new Error('Refresh token reuse detected — all sessions revoked');
    err.status = 401;
    err.code = 'REFRESH_REUSE';
    throw err;
  }

  const user = await findById('users', decoded.sub);
  if (!user) {
    const err = new Error('User not found');
    err.status = 401;
    throw err;
  }

  stored.revoked = true;
  await upsert('refresh_tokens', stored);

  const sessionAal = stored.aal || 'AAL1';
  const sessionIal = stored.ial || user.ial || 'IAL1';
  const jti = uuidv4();
  await upsert('refresh_tokens', {
    id: jti,
    userId: user.id,
    createdAt: new Date().toISOString(),
    revoked: false,
    aal: sessionAal,
    ial: sessionIal,
  });

  audit({
    action: 'AUTH_REFRESH_SUCCESS',
    userId: user.id,
    outcome: 'success',
    ip: ctx.ip,
    requestId: ctx.requestId,
    meta: { aal: sessionAal, ial: sessionIal },
  });

  return {
    accessToken: signAccessToken({
      sub: user.id,
      email: user.email,
      aal: sessionAal,
      ial: sessionIal,
    }),
    refreshToken: signRefreshToken({ sub: user.id, jti }),
    tokenType: 'Bearer',
    expiresIn: '15m',
  };
}

async function logout(refreshToken, ctx = {}) {
  try {
    const decoded = verifyRefreshToken(refreshToken);
    const stored = await findById('refresh_tokens', decoded.jti);
    if (stored) {
      stored.revoked = true;
      await upsert('refresh_tokens', stored);
    }
    audit({
      action: 'AUTH_LOGOUT',
      userId: decoded.sub,
      outcome: 'success',
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
  } catch {
    // Idempotent logout
  }
  return { ok: true };
}

async function getProfile(userId) {
  const user = loadUserDecrypted(await findById('users', userId));
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  return toPublicUser(user);
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getProfile,
  toPublicUser,
};
