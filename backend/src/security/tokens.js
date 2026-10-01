'use strict';

/**
 * JWT access + refresh tokens.
 * Short-lived access tokens reduce the window if a bearer token is stolen (NIST SP 800-63B).
 */

const jwt = require('jsonwebtoken');
const { config } = require('../config');

function signAccessToken(payload) {
  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      aal: payload.aal || 'AAL1',
      ial: payload.ial || 'IAL1',
      typ: 'access',
    },
    config.jwtAccessSecret,
    { expiresIn: config.jwtAccessTtl, algorithm: 'HS256' }
  );
}

function signRefreshToken(payload) {
  return jwt.sign(
    {
      sub: payload.sub,
      typ: 'refresh',
      jti: payload.jti,
    },
    config.jwtRefreshSecret,
    { expiresIn: config.jwtRefreshTtl, algorithm: 'HS256' }
  );
}

function verifyAccessToken(token) {
  const decoded = jwt.verify(token, config.jwtAccessSecret, { algorithms: ['HS256'] });
  if (decoded.typ !== 'access') {
    const err = new Error('Invalid token type');
    err.status = 401;
    throw err;
  }
  return decoded;
}

function verifyRefreshToken(token) {
  const decoded = jwt.verify(token, config.jwtRefreshSecret, { algorithms: ['HS256'] });
  if (decoded.typ !== 'refresh') {
    const err = new Error('Invalid token type');
    err.status = 401;
    throw err;
  }
  return decoded;
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
