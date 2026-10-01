'use strict';

/**
 * Seeds demo citizens + digital documents.
 * Works with STORAGE_DRIVER=json or postgres.
 *
 * Demo password: DemoPass123! (all seeded accounts with email/password)
 * Demo SMS phones:
 *   +13129609078 — Diana Shymkiv (your number / Twilio Verify)
 *   +13125550142 — Alex Citizen (mock OTP / devCode)
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { hashPassword } = require('../src/security/password');
const { encryptFields } = require('../src/security/encryption');
const { USER_PII_FIELDS, DOCUMENT_PII_FIELDS } = require('../src/security/piiFields');
const { writeCollection, usePostgres, DATA_DIR } = require('../src/repositories/store');
const { config } = require('../src/config');
const { uuidv4 } = require('../src/utils/ids');

async function main() {
  if (usePostgres()) {
    const { getPool, query, closePool } = require('../src/repositories/pgPool');
    getPool();
    // Clear tables for idempotent re-seed in prototype
    await query(`
      TRUNCATE audit_events, sms_otps, vehicle_fines, document_requests, agency_applications, qr_verifications,
               refresh_tokens, documents, users CASCADE
    `);
  } else if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const userId = '0a502d58-9027-4327-9c7a-992ee989ec99';
  const userId2 = '72e6a8b4-9e2e-49e1-94dd-42c5a907fe9c';
  const userIdDiana = '25cc5736-39de-47d5-85a8-b51c0a37ab11';
  const userId3 = '7b7bfdc3-d2dd-42fb-b9bc-a625454d6bd4';
  const userId4 = '835d0152-eec5-4975-acf5-5c127c01bfac';
  const userId5 = '2281627c-c8ed-473f-af10-041aebb77486';
  const userId6 = '542897ad-9830-412f-b5ee-860b87c1e093';
  const passwordHash = await hashPassword('DemoPass123!');

  const users = [
    encryptFields(
      {
        id: userId,
        email: 'alex.citizen@example.com',
        passwordHash,
        firstName: 'Alex',
        lastName: 'Citizen',
        state: 'IL',
        ial: 'IAL1',
        aal: 'AAL1',
        isStudent: true,
        phoneE164: '+13125550142',
        ssnLast4: '6789',
        phone: '+13125550142',
        dateOfBirth: '1992-04-18',
        streetAddress: '123 N Michigan Ave, Chicago, IL 60601',
        createdAt: '2026-01-10T15:00:00.000Z',
      },
      USER_PII_FIELDS
    ),
    encryptFields(
      {
        id: userId2,
        email: 'jordan.resident@example.com',
        passwordHash,
        firstName: 'Jordan',
        lastName: 'Resident',
        state: 'CA',
        ial: 'IAL1',
        aal: 'AAL1',
        isStudent: false,
        phoneE164: '+14155550199',
        ssnLast4: '4321',
        phone: '+14155550199',
        dateOfBirth: '1988-11-02',
        streetAddress: '500 Market St, San Francisco, CA 94105',
        createdAt: '2026-01-12T12:00:00.000Z',
      },
      USER_PII_FIELDS
    ),
    encryptFields(
      {
        id: userIdDiana,
        email: 'diana.shymkiv@example.com',
        passwordHash,
        firstName: 'Diana',
        lastName: 'Shymkiv',
        state: 'IL',
        ial: 'IAL1',
        aal: 'AAL1',
        isStudent: true,
        phoneE164: '+13129609078',
        ssnLast4: '9078',
        phone: '+13129609078',
        dateOfBirth: '1998-05-14',
        streetAddress: '5500 N St Louis Ave, Chicago, IL 60625',
        createdAt: '2026-02-01T09:00:00.000Z',
      },
      USER_PII_FIELDS
    ),
    encryptFields(
      {
        id: userId3,
        email: 'taylor.brooks@example.com',
        passwordHash,
        firstName: 'Taylor',
        lastName: 'Brooks',
        state: 'NY',
        ial: 'IAL1',
        aal: 'AAL1',
        isStudent: false,
        phoneE164: '+12125550101',
        ssnLast4: '1101',
        phone: '+12125550101',
        dateOfBirth: '1990-07-22',
        streetAddress: '120 Broadway, New York, NY 10271',
        createdAt: '2026-01-15T11:00:00.000Z',
      },
      USER_PII_FIELDS
    ),
    encryptFields(
      {
        id: userId4,
        email: 'morgan.lee@example.com',
        passwordHash,
        firstName: 'Morgan',
        lastName: 'Lee',
        state: 'TX',
        ial: 'IAL1',
        aal: 'AAL1',
        isStudent: true,
        phoneE164: '+15125550155',
        ssnLast4: '5515',
        phone: '+15125550155',
        dateOfBirth: '1995-03-08',
        streetAddress: '301 Congress Ave, Austin, TX 78701',
        createdAt: '2026-01-18T14:30:00.000Z',
      },
      USER_PII_FIELDS
    ),
    encryptFields(
      {
        id: userId5,
        email: 'casey.nguyen@example.com',
        passwordHash,
        firstName: 'Casey',
        lastName: 'Nguyen',
        state: 'WA',
        ial: 'IAL1',
        aal: 'AAL1',
        isStudent: false,
        phoneE164: '+12065550177',
        ssnLast4: '7717',
        phone: '+12065550177',
        dateOfBirth: '1985-12-30',
        streetAddress: '400 Broad St, Seattle, WA 98109',
        createdAt: '2026-01-20T16:00:00.000Z',
      },
      USER_PII_FIELDS
    ),
    encryptFields(
      {
        id: userId6,
        email: 'sam.patel@example.com',
        passwordHash,
        firstName: 'Sam',
        lastName: 'Patel',
        state: 'IL',
        ial: 'IAL1',
        aal: 'AAL1',
        isStudent: false,
        phoneE164: '+17085550188',
        ssnLast4: '8818',
        phone: '+17085550188',
        dateOfBirth: '1979-09-05',
        streetAddress: '1 N LaSalle St, Chicago, IL 60602',
        createdAt: '2026-01-22T10:15:00.000Z',
      },
      USER_PII_FIELDS
    ),
  ];

  const documents = [
    encryptFields(
      {
        id: '09fe3f59-5cf2-4de9-b81f-c408352dd143',
        userId,
        type: 'mDL',
        issuer: 'Illinois Secretary of State (mock)',
        status: 'active',
        issuedAt: '2024-06-01T00:00:00.000Z',
        expiresAt: '2028-06-01T00:00:00.000Z',
        state: 'IL',
        documentNumber: 'I123-4567-8901',
        fullName: 'Alex Citizen',
        dateOfBirth: '1992-04-18',
        address: '123 N Michigan Ave, Chicago, IL 60601',
        licenseClass: 'D',
        vin: null,
        plateNumber: null,
        spouseName: null,
        institution: null,
        claims: {
          portraitPresent: true,
          organDonor: false,
          standard: 'ISO/IEC 18013-5 (subset)',
        },
      },
      DOCUMENT_PII_FIELDS
    ),
    encryptFields(
      {
        id: '91baf63d-d785-445f-b432-91a8af6c00a9',
        userId,
        type: 'vehicleRegistration',
        issuer: 'Illinois Secretary of State (mock)',
        status: 'active',
        issuedAt: '2025-03-15T00:00:00.000Z',
        expiresAt: '2026-03-15T00:00:00.000Z',
        state: 'IL',
        documentNumber: 'VR-998877',
        fullName: 'Alex Citizen',
        dateOfBirth: '1992-04-18',
        address: '123 N Michigan Ave, Chicago, IL 60601',
        licenseClass: null,
        vin: '1HGBH41JXMN109186',
        plateNumber: 'IL-GC2026',
        spouseName: null,
        institution: null,
        claims: { make: 'Honda', model: 'Civic', year: 2021 },
      },
      DOCUMENT_PII_FIELDS
    ),
    encryptFields(
      {
        id: '727cf2cf-1479-4504-98dc-1c68209fbf1f',
        userId,
        type: 'passport',
        issuer: 'U.S. Department of State (mock)',
        status: 'active',
        issuedAt: '2022-08-12T00:00:00.000Z',
        expiresAt: '2032-08-11T00:00:00.000Z',
        state: 'IL',
        documentNumber: 'A12345678',
        fullName: 'Alex Citizen',
        dateOfBirth: '1992-04-18',
        address: '123 N Michigan Ave, Chicago, IL 60601',
        licenseClass: null,
        vin: null,
        plateNumber: null,
        spouseName: null,
        institution: null,
        claims: { nationality: 'USA', bookType: 'passport' },
      },
      DOCUMENT_PII_FIELDS
    ),
    encryptFields(
      {
        id: 'b3a8188f-9226-4e43-917c-c0cbbbc3eb06',
        userId,
        type: 'studentId',
        issuer: 'Northeastern Illinois University (mock)',
        status: 'active',
        issuedAt: '2025-08-20T00:00:00.000Z',
        expiresAt: '2027-05-31T00:00:00.000Z',
        state: 'IL',
        documentNumber: 'NEIU-77821',
        fullName: 'Alex Citizen',
        dateOfBirth: '1992-04-18',
        address: null,
        licenseClass: null,
        vin: null,
        plateNumber: null,
        spouseName: null,
        institution: 'Northeastern Illinois University',
        claims: {
          program: "Master's — Computer Science",
          studentStatus: 'enrolled',
        },
      },
      DOCUMENT_PII_FIELDS
    ),
    encryptFields(
      {
        id: '57825882-78d4-49bf-ace5-30ac594a8eab',
        userId,
        type: 'marriageCertificate',
        issuer: 'Cook County Clerk (mock)',
        status: 'active',
        issuedAt: '2021-06-19T00:00:00.000Z',
        expiresAt: null,
        state: 'IL',
        documentNumber: 'MC-2021-44102',
        fullName: 'Alex Citizen',
        dateOfBirth: '1992-04-18',
        address: '123 N Michigan Ave, Chicago, IL 60601',
        licenseClass: null,
        vin: null,
        plateNumber: null,
        spouseName: 'Sam Citizen',
        institution: null,
        claims: {
          marriageDate: '2021-06-19',
          place: 'Chicago, IL',
        },
      },
      DOCUMENT_PII_FIELDS
    ),
    encryptFields(
      {
        id: '2aa49e06-3857-4d38-96b1-ea74a7e61dbd',
        userId: userId2,
        type: 'mDL',
        issuer: 'California DMV (mock)',
        status: 'active',
        issuedAt: '2023-09-20T00:00:00.000Z',
        expiresAt: '2027-09-20T00:00:00.000Z',
        state: 'CA',
        documentNumber: 'C9876543',
        fullName: 'Jordan Resident',
        dateOfBirth: '1988-11-02',
        address: '500 Market St, San Francisco, CA 94105',
        licenseClass: 'C',
        vin: null,
        plateNumber: null,
        spouseName: null,
        institution: null,
        claims: {
          portraitPresent: true,
          organDonor: true,
          standard: 'ISO/IEC 18013-5 (subset)',
        },
      },
      DOCUMENT_PII_FIELDS
    ),
    encryptFields(
      {
        id: 'e0f015ea-f8d3-4d9a-9677-334a583ba7d5',
        userId: userId2,
        type: 'passport',
        issuer: 'U.S. Department of State (mock)',
        status: 'active',
        issuedAt: '2020-01-05T00:00:00.000Z',
        expiresAt: '2030-01-04T00:00:00.000Z',
        state: 'CA',
        documentNumber: 'B99887766',
        fullName: 'Jordan Resident',
        dateOfBirth: '1988-11-02',
        address: '500 Market St, San Francisco, CA 94105',
        licenseClass: null,
        vin: null,
        plateNumber: null,
        spouseName: null,
        institution: null,
        claims: { nationality: 'USA', bookType: 'passport' },
      },
      DOCUMENT_PII_FIELDS
    ),
    // Diana Shymkiv (+13129609078)
    encryptFields(
      {
        id: '3406c1c4-6058-41c2-a25f-12df0d3d82f3',
        userId: userIdDiana,
        type: 'mDL',
        issuer: 'Illinois Secretary of State (mock)',
        status: 'active',
        issuedAt: '2024-09-01T00:00:00.000Z',
        expiresAt: '2028-09-01T00:00:00.000Z',
        state: 'IL',
        documentNumber: 'I890-1234-5678',
        fullName: 'Diana Shymkiv',
        dateOfBirth: '1998-05-14',
        address: '5500 N St Louis Ave, Chicago, IL 60625',
        licenseClass: 'D',
        vin: null,
        plateNumber: null,
        spouseName: null,
        institution: null,
        claims: {
          portraitPresent: true,
          organDonor: false,
          standard: 'ISO/IEC 18013-5 (subset)',
        },
      },
      DOCUMENT_PII_FIELDS
    ),
    encryptFields(
      {
        id: '88092ce5-a319-4016-b9b1-5c29f2ed9838',
        userId: userIdDiana,
        type: 'vehicleRegistration',
        issuer: 'Illinois Secretary of State (mock)',
        status: 'active',
        issuedAt: '2025-05-01T00:00:00.000Z',
        expiresAt: '2026-05-01T00:00:00.000Z',
        state: 'IL',
        documentNumber: 'VR-445566',
        fullName: 'Diana Shymkiv',
        dateOfBirth: '1998-05-14',
        address: '5500 N St Louis Ave, Chicago, IL 60625',
        licenseClass: null,
        vin: '5YJSA1E26MF123456',
        plateNumber: 'IL-DS2026',
        spouseName: null,
        institution: null,
        claims: { make: 'Toyota', model: 'Corolla', year: 2022 },
      },
      DOCUMENT_PII_FIELDS
    ),
    encryptFields(
      {
        id: '20acdab6-6fc0-4970-8494-f44035474163',
        userId: userIdDiana,
        type: 'passport',
        issuer: 'U.S. Department of State (mock)',
        status: 'active',
        issuedAt: '2023-03-15T00:00:00.000Z',
        expiresAt: '2033-03-14T00:00:00.000Z',
        state: 'IL',
        documentNumber: 'C55667788',
        fullName: 'Diana Shymkiv',
        dateOfBirth: '1998-05-14',
        address: '5500 N St Louis Ave, Chicago, IL 60625',
        licenseClass: null,
        vin: null,
        plateNumber: null,
        spouseName: null,
        institution: null,
        claims: { nationality: 'USA', bookType: 'passport' },
      },
      DOCUMENT_PII_FIELDS
    ),
    encryptFields(
      {
        id: '33a36992-d5b0-4b90-9692-b2895d5614b8',
        userId: userIdDiana,
        type: 'studentId',
        issuer: 'Northeastern Illinois University (mock)',
        status: 'active',
        issuedAt: '2025-08-20T00:00:00.000Z',
        expiresAt: '2027-05-31T00:00:00.000Z',
        state: 'IL',
        documentNumber: 'NEIU-731324',
        fullName: 'Diana Shymkiv',
        dateOfBirth: '1998-05-14',
        address: null,
        licenseClass: null,
        vin: null,
        plateNumber: null,
        spouseName: null,
        institution: 'Northeastern Illinois University',
        claims: {
          program: "Master's — Computer Science",
          studentStatus: 'enrolled',
          neiuId: '731324',
        },
      },
      DOCUMENT_PII_FIELDS
    ),
    // Taylor Brooks (NY)
    encryptFields(
      {
        id: 'ad9ce690-0252-4077-9d42-49c7f57ec7f6',
        userId: userId3,
        type: 'mDL',
        issuer: 'New York DMV (mock)',
        status: 'active',
        issuedAt: '2023-04-10T00:00:00.000Z',
        expiresAt: '2027-04-10T00:00:00.000Z',
        state: 'NY',
        documentNumber: 'NY-4455667',
        fullName: 'Taylor Brooks',
        dateOfBirth: '1990-07-22',
        address: '120 Broadway, New York, NY 10271',
        licenseClass: 'D',
        vin: null,
        plateNumber: null,
        spouseName: null,
        institution: null,
        claims: {
          portraitPresent: true,
          organDonor: true,
          standard: 'ISO/IEC 18013-5 (subset)',
        },
      },
      DOCUMENT_PII_FIELDS
    ),
    encryptFields(
      {
        id: '24efe97c-9182-4bb1-a7fe-b2d84548d7b4',
        userId: userId3,
        type: 'passport',
        issuer: 'U.S. Department of State (mock)',
        status: 'active',
        issuedAt: '2021-11-01T00:00:00.000Z',
        expiresAt: '2031-10-31T00:00:00.000Z',
        state: 'NY',
        documentNumber: 'D11223344',
        fullName: 'Taylor Brooks',
        dateOfBirth: '1990-07-22',
        address: '120 Broadway, New York, NY 10271',
        licenseClass: null,
        vin: null,
        plateNumber: null,
        spouseName: null,
        institution: null,
        claims: { nationality: 'USA', bookType: 'passport' },
      },
      DOCUMENT_PII_FIELDS
    ),
    // Morgan Lee (TX student)
    encryptFields(
      {
        id: '40eefcf0-0eee-4bcb-bfbf-ef572e7e27b7',
        userId: userId4,
        type: 'mDL',
        issuer: 'Texas DPS (mock)',
        status: 'active',
        issuedAt: '2024-01-20T00:00:00.000Z',
        expiresAt: '2028-01-20T00:00:00.000Z',
        state: 'TX',
        documentNumber: 'TX-9988776',
        fullName: 'Morgan Lee',
        dateOfBirth: '1995-03-08',
        address: '301 Congress Ave, Austin, TX 78701',
        licenseClass: 'C',
        vin: null,
        plateNumber: null,
        spouseName: null,
        institution: null,
        claims: {
          portraitPresent: true,
          organDonor: false,
          standard: 'ISO/IEC 18013-5 (subset)',
        },
      },
      DOCUMENT_PII_FIELDS
    ),
    encryptFields(
      {
        id: 'f56e2bf2-ccab-438c-a268-f940de36a3e9',
        userId: userId4,
        type: 'studentId',
        issuer: 'University of Texas at Austin (mock)',
        status: 'active',
        issuedAt: '2025-08-15T00:00:00.000Z',
        expiresAt: '2026-05-15T00:00:00.000Z',
        state: 'TX',
        documentNumber: 'UT-441209',
        fullName: 'Morgan Lee',
        dateOfBirth: '1995-03-08',
        address: null,
        licenseClass: null,
        vin: null,
        plateNumber: null,
        spouseName: null,
        institution: 'University of Texas at Austin',
        claims: {
          program: "Bachelor's — Information Systems",
          studentStatus: 'enrolled',
        },
      },
      DOCUMENT_PII_FIELDS
    ),
    // Casey Nguyen (WA)
    encryptFields(
      {
        id: '72047a51-9b68-4de7-a9bb-c451027d5c3d',
        userId: userId5,
        type: 'mDL',
        issuer: 'Washington DOL (mock)',
        status: 'active',
        issuedAt: '2022-06-01T00:00:00.000Z',
        expiresAt: '2026-06-01T00:00:00.000Z',
        state: 'WA',
        documentNumber: 'WA-3344556',
        fullName: 'Casey Nguyen',
        dateOfBirth: '1985-12-30',
        address: '400 Broad St, Seattle, WA 98109',
        licenseClass: 'C',
        vin: null,
        plateNumber: null,
        spouseName: null,
        institution: null,
        claims: {
          portraitPresent: true,
          organDonor: true,
          standard: 'ISO/IEC 18013-5 (subset)',
        },
      },
      DOCUMENT_PII_FIELDS
    ),
    encryptFields(
      {
        id: '1ba0c34f-0ff3-4c90-aca2-826651a07657',
        userId: userId5,
        type: 'vehicleRegistration',
        issuer: 'Washington DOL (mock)',
        status: 'active',
        issuedAt: '2025-02-01T00:00:00.000Z',
        expiresAt: '2026-02-01T00:00:00.000Z',
        state: 'WA',
        documentNumber: 'VR-WA-7788',
        fullName: 'Casey Nguyen',
        dateOfBirth: '1985-12-30',
        address: '400 Broad St, Seattle, WA 98109',
        licenseClass: null,
        vin: 'JM1BL1SF5A1234567',
        plateNumber: 'WA-CN88',
        spouseName: null,
        institution: null,
        claims: { make: 'Mazda', model: 'CX-5', year: 2020 },
      },
      DOCUMENT_PII_FIELDS
    ),
    // Sam Patel (IL)
    encryptFields(
      {
        id: '97650efc-0ad5-4ea0-8a5d-05d66d2cad0e',
        userId: userId6,
        type: 'mDL',
        issuer: 'Illinois Secretary of State (mock)',
        status: 'active',
        issuedAt: '2021-10-12T00:00:00.000Z',
        expiresAt: '2025-10-12T00:00:00.000Z',
        state: 'IL',
        documentNumber: 'I555-6677-8899',
        fullName: 'Sam Patel',
        dateOfBirth: '1979-09-05',
        address: '1 N LaSalle St, Chicago, IL 60602',
        licenseClass: 'D',
        vin: null,
        plateNumber: null,
        spouseName: null,
        institution: null,
        claims: {
          portraitPresent: true,
          organDonor: false,
          standard: 'ISO/IEC 18013-5 (subset)',
        },
      },
      DOCUMENT_PII_FIELDS
    ),
    encryptFields(
      {
        id: '1a7cf44c-ce4e-4659-a5dd-5a1d9540d798',
        userId: userId6,
        type: 'marriageCertificate',
        issuer: 'Cook County Clerk (mock)',
        status: 'active',
        issuedAt: '2015-08-08T00:00:00.000Z',
        expiresAt: null,
        state: 'IL',
        documentNumber: 'MC-2015-11880',
        fullName: 'Sam Patel',
        dateOfBirth: '1979-09-05',
        address: '1 N LaSalle St, Chicago, IL 60602',
        licenseClass: null,
        vin: null,
        plateNumber: null,
        spouseName: 'Priya Patel',
        institution: null,
        claims: {
          marriageDate: '2015-08-08',
          place: 'Chicago, IL',
        },
      },
      DOCUMENT_PII_FIELDS
    ),
  ];

  await writeCollection('users', users);
  await writeCollection('documents', documents);
  await writeCollection('refresh_tokens', []);
  await writeCollection('qr_verifications', []);
  await writeCollection('agency_applications', [
    {
      id: uuidv4(),
      userId,
      serviceId: 'irs-refund-status',
      agency: 'IRS (mock)',
      status: 'approved',
      payload: { taxYear: 2025 },
      result: {
        status: 'approved',
        taxYear: 2025,
        message: 'Mock refund status for tax year 2025: approved',
        refundAmountEstimate: 1240.55,
      },
      createdAt: '2026-02-01T10:00:00.000Z',
      updatedAt: '2026-02-01T10:00:00.000Z',
    },
  ]);
  await writeCollection('document_requests', []);
  await writeCollection('vehicle_fines', [
    {
      id: '5f149c93-2ee3-4715-960f-8f317ee0d0f6',
      userId,
      vehicleDocumentId: '91baf63d-d785-445f-b432-91a8af6c00a9',
      plateNumber: 'IL-GC2026',
      type: 'parking',
      title: 'Parking meter expired',
      location: '200 N Michigan Ave, Chicago, IL',
      issuedAt: '2026-03-02T14:20:00.000Z',
      dueAt: '2026-04-02T23:59:59.000Z',
      amount: 65.0,
      currency: 'USD',
      status: 'unpaid',
      agency: 'City of Chicago Parking (mock)',
      citationNumber: 'P-448291',
      paidAt: null,
      paymentConfirmation: null,
      createdAt: '2026-03-02T14:20:00.000Z',
      updatedAt: '2026-03-02T14:20:00.000Z',
    },
    {
      id: '83b011cc-f34c-4fef-a8b3-b3eeaa91a4f6',
      userId,
      vehicleDocumentId: '91baf63d-d785-445f-b432-91a8af6c00a9',
      plateNumber: 'IL-GC2026',
      type: 'traffic',
      title: 'Speeding — 11–14 mph over limit',
      location: 'I-90 near Exit 51, Chicago, IL',
      issuedAt: '2026-01-18T09:05:00.000Z',
      dueAt: '2026-02-18T23:59:59.000Z',
      amount: 120.0,
      currency: 'USD',
      status: 'paid',
      agency: 'Illinois State Police (mock)',
      citationNumber: 'T-902114',
      paidAt: '2026-01-25T16:40:00.000Z',
      paymentConfirmation: 'PAY-SEED0001',
      createdAt: '2026-01-18T09:05:00.000Z',
      updatedAt: '2026-01-25T16:40:00.000Z',
    },
    {
      id: '41fc3416-95ad-4c88-a60f-34496095472e',
      userId,
      vehicleDocumentId: '91baf63d-d785-445f-b432-91a8af6c00a9',
      plateNumber: 'IL-GC2026',
      type: 'parking',
      title: 'Street cleaning zone',
      location: 'W Division St, Chicago, IL',
      issuedAt: '2026-03-10T08:15:00.000Z',
      dueAt: '2026-04-10T23:59:59.000Z',
      amount: 75.0,
      currency: 'USD',
      status: 'unpaid',
      agency: 'City of Chicago Parking (mock)',
      citationNumber: 'P-551002',
      paidAt: null,
      paymentConfirmation: null,
      createdAt: '2026-03-10T08:15:00.000Z',
      updatedAt: '2026-03-10T08:15:00.000Z',
    },
    {
      id: '72711224-9e07-498b-a7f3-c2ec69a7c4c6',
      userId: userIdDiana,
      vehicleDocumentId: '88092ce5-a319-4016-b9b1-5c29f2ed9838',
      plateNumber: 'IL-DS2026',
      type: 'parking',
      title: 'No parking — fire hydrant',
      location: 'N St Louis Ave, Chicago, IL',
      issuedAt: '2026-03-20T11:00:00.000Z',
      dueAt: '2026-04-20T23:59:59.000Z',
      amount: 150.0,
      currency: 'USD',
      status: 'unpaid',
      agency: 'City of Chicago Parking (mock)',
      citationNumber: 'P-662201',
      paidAt: null,
      paymentConfirmation: null,
      createdAt: '2026-03-20T11:00:00.000Z',
      updatedAt: '2026-03-20T11:00:00.000Z',
    },
  ]);

  if (!usePostgres()) {
    fs.writeFileSync(path.join(DATA_DIR, 'sms_otps.json'), '[]\n', 'utf8');
    fs.writeFileSync(path.join(DATA_DIR, 'audit-log.jsonl'), '', 'utf8');
  }

  console.log('Seed complete.');
  console.log(`Storage: ${config.storageDriver}`);
  console.log(`Users seeded: ${users.length}`);
  console.log('Password (all): DemoPass123!');
  console.log('Your SMS login: +13129609078 (Diana Shymkiv)');
  console.log('Mock SMS demo: +13125550142 (Alex Citizen)');

  if (usePostgres()) {
    const { closePool } = require('../src/repositories/pgPool');
    await closePool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
