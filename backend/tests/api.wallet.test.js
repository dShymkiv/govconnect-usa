'use strict';

require('./helpers/setupEnv');

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { startServer, request } = require('./helpers/http');
const { seedCitizen } = require('./helpers/fixtures');

async function login(baseUrl, fixture) {
  const res = await request(baseUrl, 'POST', '/api/v1/auth/login', {
    body: { email: fixture.user.email, password: fixture.password },
  });
  assert.equal(res.status, 200);
  return res.data.accessToken;
}

describe('TC-WALLET: document wallet + QR presentation', () => {
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

  it('TC-WALLET-01 lists wallet documents for authenticated user', async () => {
    const res = await request(baseUrl, 'GET', '/api/v1/wallet', { token });
    assert.equal(res.status, 200);
    assert.equal(res.data.documents.length, 1);
    assert.equal(res.data.documents[0].type, 'mDL');
    assert.match(res.data.documents[0].documentNumberMasked, /\*+8901$/);
  });

  it('TC-WALLET-02 denies wallet without token', async () => {
    const res = await request(baseUrl, 'GET', '/api/v1/wallet');
    assert.equal(res.status, 401);
  });

  it('TC-WALLET-03 returns full document details', async () => {
    const res = await request(baseUrl, 'GET', `/api/v1/wallet/${fixture.mdl.id}`, { token });
    assert.equal(res.status, 200);
    assert.equal(res.data.document.fullName, 'Test Citizen');
    assert.equal(res.data.document.documentNumber, 'T123-4567-8901');
  });

  it('TC-WALLET-04 creates one-time QR presentation', async () => {
    const res = await request(baseUrl, 'POST', '/api/v1/wallet/present', {
      token,
      body: { documentId: fixture.mdl.id },
    });
    assert.equal(res.status, 201);
    assert.ok(res.data.presentationCode);
    assert.ok(res.data.expiresAt);
    assert.equal(res.data.qrPayload.system, 'GovConnectUSA');
    assert.ok(res.data.disclosedFields.includes('fullName'));
    assert.ok(res.data.withheldFields.includes('dateOfBirth'));
  });

  it('TC-WALLET-05 verify succeeds once then rejects replay', async () => {
    const present = await request(baseUrl, 'POST', '/api/v1/wallet/present', {
      token,
      body: { documentId: fixture.mdl.id },
    });
    const code = present.data.presentationCode;

    const first = await request(baseUrl, 'GET', `/api/v1/verify/${code}`);
    assert.equal(first.status, 200);
    assert.equal(first.data.valid, true);
    assert.equal(first.data.document.type, 'mDL');
    assert.equal(first.data.document.fullName, 'Test Citizen');
    assert.equal(first.data.document.dateOfBirth, undefined);
    assert.ok(first.data.disclosure?.notShared?.includes('dateOfBirth'));

    const replay = await request(baseUrl, 'GET', `/api/v1/verify/${code}`);
    assert.equal(replay.status, 410);
    assert.equal(replay.data.code, 'PRESENTATION_USED');
  });

  it('TC-WALLET-07 security audit returns own events', async () => {
    await request(baseUrl, 'POST', '/api/v1/wallet/present', {
      token,
      body: { documentId: fixture.mdl.id },
    });
    const res = await request(baseUrl, 'GET', '/api/v1/security/audit?limit=10', { token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.events));
    assert.ok(res.data.events.some((e) => e.action === 'WALLET_PRESENTATION_CREATED'));
    assert.ok(res.data.events[0].integrityPreview);
  });

  it('TC-WALLET-06 verify unknown well-formed code returns 404', async () => {
    const res = await request(
      baseUrl,
      'GET',
      '/api/v1/verify/this-is-a-valid-looking-code-xx'
    );
    assert.equal(res.status, 404);
    assert.equal(res.data.code, 'PRESENTATION_NOT_FOUND');
  });
});
