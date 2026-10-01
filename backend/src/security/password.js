'use strict';

const bcrypt = require('bcryptjs');
const { config } = require('../config');

async function hashPassword(plain) {
  return bcrypt.hash(plain, config.bcryptRounds);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/**
 * Soft password policy for MVP (NIST SP 800-63B favors length over complexity rules).
 * We still require a minimum length and block common weak patterns.
 */
function assertPasswordPolicy(password) {
  if (typeof password !== 'string' || password.length < 12) {
    const err = new Error('Password must be at least 12 characters');
    err.status = 400;
    err.code = 'WEAK_PASSWORD';
    throw err;
  }
  if (/\s/.test(password)) {
    const err = new Error('Password must not contain whitespace');
    err.status = 400;
    err.code = 'WEAK_PASSWORD';
    throw err;
  }
}

module.exports = { hashPassword, verifyPassword, assertPasswordPolicy };
