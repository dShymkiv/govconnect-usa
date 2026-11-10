'use strict';

require('./helpers/setupEnv');

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { encrypt, decrypt, encryptFields, decryptFields } = require('../src/security/encryption');
const { hashPassword, verifyPassword, assertPasswordPolicy } = require('../src/security/password');
const {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require('../src/security/tokens');
const { integrityHash } = require('../src/security/audit');

describe('TC-SEC: AES-GCM field encryption', () => {
  it('TC-SEC-01 round-trips plaintext and rejects tampering', () => {
    const cipher = encrypt('1992-04-18');
    assert.match(cipher, /^enc:v1:/);
    assert.equal(decrypt(cipher), '1992-04-18');

    const parts = cipher.split(':');
    parts[4] = Buffer.from('tampered').toString('base64url');
    assert.throws(() => decrypt(parts.join(':')));
  });

  it('TC-SEC-02 encrypts selected object fields only', () => {
    const enc = encryptFields({ phone: '+13125550142', email: 'a@b.c' }, ['phone']);
    assert.match(enc.phone, /^enc:v1:/);
    assert.equal(enc.email, 'a@b.c');
    assert.equal(decryptFields(enc, ['phone']).phone, '+13125550142');
  });
});

describe('TC-SEC: password policy + bcrypt', () => {
  it('TC-SEC-03 rejects short passwords', () => {
    assert.throws(() => assertPasswordPolicy('short'), /12/);
  });

  it('TC-SEC-04 hashes and verifies passwords', async () => {
    const hash = await hashPassword('DemoPass123!');
    assert.equal(await verifyPassword('DemoPass123!', hash), true);
    assert.equal(await verifyPassword('wrong-password', hash), false);
  });
});

describe('TC-SEC: JWT access/refresh separation', () => {
  it('TC-SEC-05 signs typed tokens and rejects wrong type', () => {
    const access = signAccessToken({
      sub: 'u1',
      email: 'a@b.c',
      aal: 'AAL2',
      ial: 'IAL1',
    });
    const refresh = signRefreshToken({ sub: 'u1', jti: 'j1' });
    const a = verifyAccessToken(access);
    assert.equal(a.typ, 'access');
    assert.equal(a.aal, 'AAL2');
    assert.throws(() => verifyAccessToken(refresh));
    assert.equal(verifyRefreshToken(refresh).jti, 'j1');
  });
});

describe('TC-SEC: audit integrity HMAC', () => {
  it('TC-SEC-06 is stable for same record and changes when action changes', () => {
    const base = {
      id: '1',
      ts: '2026-01-01T00:00:00.000Z',
      action: 'AUTH_LOGIN_SUCCESS',
      userId: 'u1',
      resource: null,
      outcome: 'success',
      ip: '127.0.0.1',
      requestId: 'r1',
      meta: {},
    };
    const h1 = integrityHash(base);
    assert.equal(h1, integrityHash(base));
    assert.notEqual(h1, integrityHash({ ...base, action: 'AUTH_LOGIN_FAILURE' }));
  });
});
