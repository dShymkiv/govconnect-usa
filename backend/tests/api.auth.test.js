'use strict';

require('./helpers/setupEnv');

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { startServer, request } = require('./helpers/http');
const { seedCitizen } = require('./helpers/fixtures');

describe('TC-AUTH: authentication API', () => {
  let baseUrl;
  let close;
  let fixture;

  before(async () => {
    ({ baseUrl, close } = await startServer(createApp()));
  });

  after(async () => {
    await close();
  });

  beforeEach(async () => {
    fixture = await seedCitizen();
  });

  it('TC-AUTH-01 health endpoint is public', async () => {
    const res = await request(baseUrl, 'GET', '/health');
    assert.equal(res.status, 200);
    assert.equal(res.data.status, 'ok');
    assert.equal(res.data.storage, 'json');
  });

  it('TC-AUTH-02 email/password login returns AAL1 session', async () => {
    const res = await request(baseUrl, 'POST', '/api/v1/auth/login', {
      body: { email: fixture.user.email, password: fixture.password },
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.accessToken);
    assert.equal(res.data.assurance.aal, 'AAL1');
    assert.deepEqual(res.data.assurance.factors, ['password']);
    assert.equal(res.data.user.aal, 'AAL1');
  });

  it('TC-AUTH-03 rejects invalid password', async () => {
    const res = await request(baseUrl, 'POST', '/api/v1/auth/login', {
      body: { email: fixture.user.email, password: 'WrongPass!!!!' },
    });
    assert.equal(res.status, 401);
    assert.equal(res.data.code, 'INVALID_CREDENTIALS');
  });

  it('TC-AUTH-04 OTP request requires password (2FA gate)', async () => {
    const missing = await request(baseUrl, 'POST', '/api/v1/auth/otp/request', {
      body: { phone: fixture.phone },
    });
    assert.equal(missing.status, 400);

    const bad = await request(baseUrl, 'POST', '/api/v1/auth/otp/request', {
      body: { phone: fixture.phone, password: 'WrongPass!!!!' },
    });
    assert.equal(bad.status, 401);
    assert.equal(bad.data.code, 'AUTH_INVALID');
  });

  it('TC-AUTH-05 password + SMS OTP login returns AAL2', async () => {
    const reqOtp = await request(baseUrl, 'POST', '/api/v1/auth/otp/request', {
      body: { phone: fixture.phone, password: fixture.password },
    });
    assert.equal(reqOtp.status, 200);
    assert.equal(reqOtp.data.provider, 'mock');
    assert.ok(reqOtp.data.devCode);
    assert.deepEqual(reqOtp.data.factors, ['password', 'sms_otp']);

    const verify = await request(baseUrl, 'POST', '/api/v1/auth/otp/verify', {
      body: {
        phone: fixture.phone,
        password: fixture.password,
        code: reqOtp.data.devCode,
      },
    });
    assert.equal(verify.status, 200);
    assert.equal(verify.data.assurance.aal, 'AAL2');
    assert.deepEqual(verify.data.assurance.factors, ['password', 'sms_otp']);
    assert.ok(verify.data.accessToken);
  });

  it('TC-AUTH-06 OTP verify fails with wrong code', async () => {
    await request(baseUrl, 'POST', '/api/v1/auth/otp/request', {
      body: { phone: fixture.phone, password: fixture.password },
    });
    const res = await request(baseUrl, 'POST', '/api/v1/auth/otp/verify', {
      body: { phone: fixture.phone, password: fixture.password, code: '000000' },
    });
    assert.equal(res.status, 401);
    assert.equal(res.data.code, 'OTP_INVALID');
  });

  it('TC-AUTH-07 /me requires bearer token', async () => {
    const denied = await request(baseUrl, 'GET', '/api/v1/auth/me');
    assert.equal(denied.status, 401);

    const login = await request(baseUrl, 'POST', '/api/v1/auth/login', {
      body: { email: fixture.user.email, password: fixture.password },
    });
    const me = await request(baseUrl, 'GET', '/api/v1/auth/me', {
      token: login.data.accessToken,
    });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email, fixture.user.email);
    assert.equal(me.data.assurance.aal, 'AAL1');
  });

  it('TC-AUTH-08 refresh rotates token; reuse is denied', async () => {
    const login = await request(baseUrl, 'POST', '/api/v1/auth/login', {
      body: { email: fixture.user.email, password: fixture.password },
    });
    const oldRefresh = login.data.refreshToken;

    const rotated = await request(baseUrl, 'POST', '/api/v1/auth/refresh', {
      body: { refreshToken: oldRefresh },
    });
    assert.equal(rotated.status, 200);
    assert.ok(rotated.data.refreshToken);
    assert.notEqual(rotated.data.refreshToken, oldRefresh);

    const reuse = await request(baseUrl, 'POST', '/api/v1/auth/refresh', {
      body: { refreshToken: oldRefresh },
    });
    assert.equal(reuse.status, 401);
    assert.equal(reuse.data.code, 'REFRESH_REUSE');
  });
});
