'use strict';

require('./helpers/setupEnv');

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { startServer, request } = require('./helpers/http');
const { seedCitizen, resetCollections } = require('./helpers/fixtures');
const { hashPassword } = require('../src/security/password');
const { encryptFields } = require('../src/security/encryption');
const { USER_PII_FIELDS } = require('../src/security/piiFields');
const { writeCollection } = require('../src/repositories/store');

async function login(baseUrl, email, password) {
  const res = await request(baseUrl, 'POST', '/api/v1/auth/login', {
    body: { email, password },
  });
  assert.equal(res.status, 200);
  return res.data.accessToken;
}

describe('TC-SVC: mock agency service adapters', () => {
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
    token = await login(baseUrl, fixture.user.email, fixture.password);
  });

  it('TC-SVC-01 catalog lists DMV/IRS/unemployment services', async () => {
    const all = await request(baseUrl, 'GET', '/api/v1/services/catalog');
    assert.equal(all.status, 200);
    assert.ok(all.data.services.length >= 3);

    const dmv = await request(baseUrl, 'GET', '/api/v1/services/catalog?category=dmv');
    assert.ok(dmv.data.services.every((s) => s.category === 'dmv'));
  });

  it('TC-SVC-02 DMV license renewal accepts when mDL is in wallet', async () => {
    const res = await request(baseUrl, 'POST', '/api/v1/services/requests', {
      token,
      body: { serviceId: 'dmv-license-renewal', payload: {} },
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.request.status, 'accepted');
    assert.ok(res.data.request.result.confirmationNumber.startsWith('DMV-'));
    assert.equal(res.data.request.linkedDocuments.mDL.documentId, fixture.mdl.id);
  });

  it('TC-SVC-03 unemployment requires mDL and weekly wage', async () => {
    const bad = await request(baseUrl, 'POST', '/api/v1/services/requests', {
      token,
      body: { serviceId: 'unemployment-application', payload: {} },
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.data.code, 'VALIDATION_ERROR');

    const ok = await request(baseUrl, 'POST', '/api/v1/services/requests', {
      token,
      body: {
        serviceId: 'unemployment-application',
        payload: { priorWeeklyWage: 800, reason: 'laid_off' },
      },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.data.request.status, 'submitted');
    assert.equal(ok.data.request.result.weeklyBenefitEstimate, 400);
  });

  it('TC-SVC-04 IRS refund status lookup by tax year', async () => {
    const incomplete = await request(baseUrl, 'POST', '/api/v1/services/requests', {
      token,
      body: { serviceId: 'irs-refund-status', payload: { taxYear: 2024 } },
    });
    assert.equal(incomplete.status, 400);
    assert.equal(incomplete.data.code, 'VALIDATION_ERROR');

    const res = await request(baseUrl, 'POST', '/api/v1/services/requests', {
      token,
      body: {
        serviceId: 'irs-refund-status',
        payload: { taxYear: 2024, filingStatus: 'single' },
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.request.result.taxYear, 2024);
    assert.ok(res.data.request.result.message.includes('2024'));
  });

  it('TC-SVC-05 rejects service that needs missing wallet document', async () => {
    await resetCollections();
    const password = 'DemoPass123!';
    const user = encryptFields(
      {
        id: 'cccccccc-dddd-4eee-8fff-333333333333',
        email: 'nodocs@example.com',
        passwordHash: await hashPassword(password),
        firstName: 'No',
        lastName: 'Docs',
        state: 'IL',
        ial: 'IAL1',
        aal: 'AAL1',
        isStudent: false,
        phoneE164: '+13125550888',
        ssnLast4: null,
        phone: '+13125550888',
        dateOfBirth: null,
        streetAddress: null,
        createdAt: new Date().toISOString(),
      },
      USER_PII_FIELDS
    );
    await writeCollection('users', [user]);
    await writeCollection('documents', []);
    const bareToken = await login(baseUrl, user.email, password);

    const res = await request(baseUrl, 'POST', '/api/v1/services/requests', {
      token: bareToken,
      body: { serviceId: 'dmv-license-renewal', payload: {} },
    });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'MISSING_WALLET_DOCUMENT');
  });

  it('TC-SVC-06 lists prior service requests for user', async () => {
    await request(baseUrl, 'POST', '/api/v1/services/requests', {
      token,
      body: {
        serviceId: 'irs-refund-status',
        payload: { taxYear: 2023, filingStatus: 'single' },
      },
    });
    const res = await request(baseUrl, 'GET', '/api/v1/services/requests?category=irs', {
      token,
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.requests.length >= 1);
    assert.equal(res.data.requests[0].serviceId, 'irs-refund-status');
  });

  it('TC-SVC-07 vehicle renewal requires selecting which registration', async () => {
    const { encryptFields } = require('../src/security/encryption');
    const { DOCUMENT_PII_FIELDS } = require('../src/security/piiFields');
    const { writeCollection } = require('../src/repositories/store');

    const carA = encryptFields(
      {
        id: 'dddddddd-eeee-4fff-8aaa-444444444441',
        userId: fixture.user.id,
        type: 'vehicleRegistration',
        issuer: 'IL SOS (test)',
        status: 'active',
        issuedAt: '2024-01-01T00:00:00.000Z',
        expiresAt: '2026-01-01T00:00:00.000Z',
        state: 'IL',
        documentNumber: 'VR-TEST-A',
        fullName: 'Test Citizen',
        dateOfBirth: '1995-01-15',
        address: '1 Test St',
        licenseClass: null,
        vin: '1HGCM82633A004351',
        plateNumber: 'IL-AAA111',
        spouseName: null,
        institution: null,
        claims: { make: 'Toyota', model: 'Corolla', year: 2020 },
      },
      DOCUMENT_PII_FIELDS
    );
    const carB = encryptFields(
      {
        id: 'dddddddd-eeee-4fff-8aaa-444444444442',
        userId: fixture.user.id,
        type: 'vehicleRegistration',
        issuer: 'IL SOS (test)',
        status: 'active',
        issuedAt: '2023-06-01T00:00:00.000Z',
        expiresAt: '2025-06-01T00:00:00.000Z',
        state: 'IL',
        documentNumber: 'VR-TEST-B',
        fullName: 'Test Citizen',
        dateOfBirth: '1995-01-15',
        address: '1 Test St',
        licenseClass: null,
        vin: '1HGCM82633A004352',
        plateNumber: 'IL-BBB222',
        spouseName: null,
        institution: null,
        claims: { make: 'Honda', model: 'Civic', year: 2018 },
      },
      DOCUMENT_PII_FIELDS
    );
    await writeCollection('documents', [fixture.mdl, carA, carB]);

    const missingFields = await request(baseUrl, 'POST', '/api/v1/services/requests', {
      token,
      body: { serviceId: 'vehicle-reg-renewal', payload: {} },
    });
    assert.equal(missingFields.status, 400);
    assert.equal(missingFields.data.code, 'VALIDATION_ERROR');

    const missingDoc = await request(baseUrl, 'POST', '/api/v1/services/requests', {
      token,
      body: { serviceId: 'vehicle-reg-renewal', payload: { plateAction: 'renew' } },
    });
    assert.equal(missingDoc.status, 400);
    assert.equal(missingDoc.data.code, 'VALIDATION_ERROR');

    const needsPick = await request(baseUrl, 'POST', '/api/v1/services/requests', {
      token,
      body: {
        serviceId: 'vehicle-reg-renewal',
        payload: { plateAction: 'renew', documentId: '' },
      },
    });
    assert.equal(needsPick.status, 400);
    assert.ok(
      needsPick.data.code === 'VALIDATION_ERROR' ||
        needsPick.data.code === 'DOCUMENT_SELECTION_REQUIRED'
    );

    const ok = await request(baseUrl, 'POST', '/api/v1/services/requests', {
      token,
      body: {
        serviceId: 'vehicle-reg-renewal',
        payload: { documentId: carB.id, plateAction: 'renew' },
      },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.data.request.status, 'accepted');
    assert.equal(
      ok.data.request.linkedDocuments.vehicleRegistration.documentId,
      carB.id
    );
    assert.equal(ok.data.request.linkedDocuments.vehicleRegistration.plateNumber, 'IL-BBB222');
  });

  it('TC-SVC-08 appointment booking rejects empty payload', async () => {
    const bad = await request(baseUrl, 'POST', '/api/v1/services/requests', {
      token,
      body: { serviceId: 'dmv-schedule-appointment', payload: {} },
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.data.code, 'VALIDATION_ERROR');

    const ok = await request(baseUrl, 'POST', '/api/v1/services/requests', {
      token,
      body: {
        serviceId: 'dmv-schedule-appointment',
        payload: {
          serviceType: 'license',
          appointmentDate: '2026-11-15',
          state: 'IL',
          location: 'chicago_north',
        },
      },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.data.request.status, 'accepted');
    assert.ok(ok.data.request.result.confirmationNumber.startsWith('APT-'));
    assert.equal(ok.data.request.result.smsConfirmation?.sent, true);
    assert.ok(ok.data.request.result.smsConfirmation?.phoneLast4);
  });
});
