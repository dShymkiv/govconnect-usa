'use strict';

require('./helpers/setupEnv');

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { startServer, request } = require('./helpers/http');
const { seedCitizen } = require('./helpers/fixtures');
const { tableFor } = require('../src/repositories/pgStore');

async function login(baseUrl, fixture) {
  const res = await request(baseUrl, 'POST', '/api/v1/auth/login', {
    body: { email: fixture.user.email, password: fixture.password },
  });
  assert.equal(res.status, 200);
  return res.data.accessToken;
}

describe('TC-INJ: SQL injection resistance + input validation', () => {
  let baseUrl;
  let close;
  let fixture;
  let token;

  before(async () => {
    ({ baseUrl, close } = await startServer(createApp()));
  });

  after(async () => {
    await close();
  });

  beforeEach(async () => {
    fixture = await seedCitizen();
    token = await login(baseUrl, fixture);
  });

  it('TC-INJ-01 table allowlist rejects unknown collection names', () => {
    assert.throws(() => tableFor("users; DROP TABLE users--"), /Unknown collection/);
    assert.throws(() => tableFor('users"'), /Unknown collection/);
    assert.equal(tableFor('users'), 'users');
  });

  it('TC-INJ-02 login email injection payload is rejected by Zod (not executed as SQL)', async () => {
    const payloads = [
      "admin'--",
      "' OR '1'='1",
      '"; DROP TABLE users;--',
      'admin@example.com\' OR 1=1--',
    ];
    for (const email of payloads) {
      const res = await request(baseUrl, 'POST', '/api/v1/auth/login', {
        body: { email, password: 'DemoPass123!' },
      });
      assert.equal(res.status, 400, `email=${email}`);
      assert.equal(res.data.code, 'VALIDATION_ERROR');
    }
  });

  it('TC-INJ-03 path UUID injection is rejected before DB lookup', async () => {
    const evil = [
      "1' OR '1'='1",
      '../../etc/passwd',
      'aaaaaaaa-bbbb-4ccc-8ddd-111111111111;DROP TABLE users',
    ];
    for (const documentId of evil) {
      const res = await request(baseUrl, 'GET', `/api/v1/wallet/${encodeURIComponent(documentId)}`, {
        token,
      });
      assert.equal(res.status, 400, `id=${documentId}`);
      assert.equal(res.data.code, 'VALIDATION_ERROR');
    }
  });

  it('TC-INJ-04 service category / serviceId injection blocked', async () => {
    const cat = await request(
      baseUrl,
      'GET',
      `/api/v1/services/catalog?category=${encodeURIComponent("dmv' OR 1=1--")}`
    );
    assert.equal(cat.status, 400);
    assert.equal(cat.data.code, 'VALIDATION_ERROR');

    const submit = await request(baseUrl, 'POST', '/api/v1/services/requests', {
      token,
      body: {
        serviceId: "dmv-license-renewal'; DROP TABLE users;--",
        payload: {},
      },
    });
    assert.equal(submit.status, 400);
    assert.equal(submit.data.code, 'VALIDATION_ERROR');
  });

  it('TC-INJ-05 OTP code must be numeric; SQL-like strings rejected', async () => {
    const res = await request(baseUrl, 'POST', '/api/v1/auth/otp/verify', {
      body: {
        phone: fixture.phone,
        password: fixture.password,
        code: "1' OR '1'='1",
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'VALIDATION_ERROR');
  });

  it('TC-INJ-06 verify presentation code rejects SQL/path payloads', async () => {
    const evil = ["' OR 1=1--", '../admin', 'short', '****injection****'];
    for (const code of evil) {
      const res = await request(baseUrl, 'GET', `/api/v1/verify/${encodeURIComponent(code)}`);
      assert.equal(res.status, 400, `code=${code}`);
      assert.equal(res.data.code, 'VALIDATION_ERROR');
    }
  });

  it('TC-INJ-07 nested object payload keys are rejected; scalars only', async () => {
    const nested = await request(baseUrl, 'POST', '/api/v1/services/requests', {
      token,
      body: {
        serviceId: 'irs-refund-status',
        payload: { taxYear: 2024, evil: { admin: true } },
      },
    });
    assert.equal(nested.status, 400);
    assert.equal(nested.data.code, 'VALIDATION_ERROR');

    const ok = await request(baseUrl, 'POST', '/api/v1/services/requests', {
      token,
      body: {
        serviceId: 'irs-refund-status',
        payload: {
          taxYear: 2024,
          filingStatus: 'single',
          note: "'; DROP TABLE users;--",
        },
      },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.data.request.result.taxYear, 2024);
    assert.equal(ok.data.request.payload.note, "'; DROP TABLE users;--");
  });

  it('TC-INJ-08 parameterized lookup with quoted UUID-like id does not break API', async () => {
    const res = await request(
      baseUrl,
      'GET',
      '/api/v1/wallet/00000000-0000-4000-8000-000000000000',
      { token }
    );
    assert.equal(res.status, 404);
    assert.equal(res.data.code, 'DOC_NOT_FOUND');
  });
});
