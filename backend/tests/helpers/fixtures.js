'use strict';

const { hashPassword } = require('../../src/security/password');
const { encryptFields } = require('../../src/security/encryption');
const { USER_PII_FIELDS, DOCUMENT_PII_FIELDS } = require('../../src/security/piiFields');
const { writeCollection } = require('../../src/repositories/store');

async function resetCollections() {
  await writeCollection('users', []);
  await writeCollection('documents', []);
  await writeCollection('refresh_tokens', []);
  await writeCollection('qr_verifications', []);
  await writeCollection('agency_applications', []);
  await writeCollection('document_requests', []);
  await writeCollection('vehicle_fines', []);
}

async function seedCitizen({
  id = 'aaaaaaaa-bbbb-4ccc-8ddd-111111111111',
  email = 'test.citizen@example.com',
  password = 'DemoPass123!',
  phone = '+13125550999',
  firstName = 'Test',
  lastName = 'Citizen',
} = {}) {
  const passwordHash = await hashPassword(password);
  const user = encryptFields(
    {
      id,
      email,
      passwordHash,
      firstName,
      lastName,
      state: 'IL',
      ial: 'IAL1',
      aal: 'AAL1',
      isStudent: true,
      phoneE164: phone,
      ssnLast4: '1234',
      phone,
      dateOfBirth: '1995-01-15',
      streetAddress: '1 Test St, Chicago, IL 60601',
      createdAt: new Date().toISOString(),
    },
    USER_PII_FIELDS
  );

  const mdl = encryptFields(
    {
      id: 'bbbbbbbb-cccc-4ddd-8eee-222222222222',
      userId: id,
      type: 'mDL',
      issuer: 'Illinois SOS (test)',
      status: 'active',
      issuedAt: '2024-01-01T00:00:00.000Z',
      expiresAt: '2028-01-01T00:00:00.000Z',
      state: 'IL',
      documentNumber: 'T123-4567-8901',
      fullName: `${firstName} ${lastName}`,
      dateOfBirth: '1995-01-15',
      address: '1 Test St, Chicago, IL 60601',
      licenseClass: 'D',
      vin: null,
      plateNumber: null,
      spouseName: null,
      institution: null,
      claims: { standard: 'ISO/IEC 18013-5 (subset)' },
    },
    DOCUMENT_PII_FIELDS
  );

  await writeCollection('users', [user]);
  await writeCollection('documents', [mdl]);
  await writeCollection('refresh_tokens', []);
  await writeCollection('qr_verifications', []);
  await writeCollection('agency_applications', []);
  await writeCollection('document_requests', []);
  await writeCollection('vehicle_fines', []);

  return { user, password, phone, mdl };
}

module.exports = { resetCollections, seedCitizen };
