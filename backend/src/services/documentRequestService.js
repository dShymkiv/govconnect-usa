'use strict';

/**
 * Request / order new documents into the wallet (Diia-style "get a document").
 * Mock agencies fulfill some instantly and attach a digital copy to the wallet.
 */

const { uuidv4 } = require('../utils/ids');
const { findWhere, upsert, findById } = require('../repositories/store');
const { encryptFields } = require('../security/encryption');
const { DOCUMENT_PII_FIELDS } = require('../security/piiFields');
const { audit } = require('../security/audit');
const { labelForType, isWalletDocumentType } = require('../security/documentTypes');

const CATALOG = [
  {
    id: 'criminal-record-certificate',
    name: 'Certificate of no criminal record',
    description: 'Request an official background / no-conviction certificate (mock FBI/state).',
    agency: 'State Police / FBI CJIS (mock)',
    resultDocumentType: 'criminalRecordCertificate',
    fulfillment: 'instant',
    estimatedDays: 0,
    addsToWallet: true,
  },
  {
    id: 'marriage-license',
    name: 'Marriage license application',
    description: 'Apply for a marriage license with your county clerk (mock).',
    agency: 'County Clerk (mock)',
    resultDocumentType: 'marriageLicense',
    fulfillment: 'pending',
    estimatedDays: 3,
    addsToWallet: true,
  },
  {
    id: 'irs-ss4',
    name: 'IRS Form SS-4 (Apply for EIN)',
    description:
      'File Form SS-4 to request an Employer Identification Number (mock IRS). Confirmation only — IRS forms are not stored in the document wallet.',
    agency: 'IRS (mock)',
    resultDocumentType: 'irsSs4',
    fulfillment: 'instant',
    estimatedDays: 0,
    addsToWallet: false,
  },
  {
    id: 'passport-renewal-copy',
    name: 'Passport digital copy / renewal request',
    description: 'Request a digital passport record or start renewal (mock State Dept).',
    agency: 'U.S. Department of State (mock)',
    resultDocumentType: 'passport',
    fulfillment: 'pending',
    estimatedDays: 14,
    addsToWallet: true,
  },
  {
    id: 'student-id-issue',
    name: 'Student ID (if enrolled)',
    description: 'Issue a digital student ID when the citizen is marked as a student.',
    agency: 'University Registrar (mock)',
    resultDocumentType: 'studentId',
    fulfillment: 'instant',
    estimatedDays: 0,
    requiresStudent: true,
    addsToWallet: true,
  },
];

function listCatalog(user = null) {
  return CATALOG.filter((item) => {
    if (item.requiresStudent && user && user.isStudent !== true) return false;
    return true;
  }).map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    agency: item.agency,
    resultDocumentType: item.resultDocumentType,
    resultLabel: labelForType(item.resultDocumentType),
    fulfillment: item.fulfillment,
    estimatedDays: item.estimatedDays,
    requiresStudent: Boolean(item.requiresStudent),
    addsToWallet: item.addsToWallet !== false,
  }));
}

async function listRequests(userId) {
  return (await findWhere('document_requests', (r) => r.userId === userId)).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1
  );
}

async function getRequest(userId, requestId) {
  const req = await findById('document_requests', requestId);
  if (!req || req.userId !== userId) {
    const err = new Error('Document request not found');
    err.status = 404;
    throw err;
  }
  return req;
}

function sanitizePayload(payload) {
  const blocked = ['ssn', 'socialSecurityNumber', 'fullSsn', 'bankAccount', 'routingNumber', 'password'];
  const out = { ...(payload || {}) };
  for (const key of blocked) {
    if (key in out) out[key] = '[REDACTED]';
  }
  return out;
}

async function submitRequest(userId, userProfile, { requestTypeId, payload }, ctx = {}) {
  const catalogItem = CATALOG.find((c) => c.id === requestTypeId);
  if (!catalogItem) {
    const err = new Error('Unknown document request type');
    err.status = 404;
    err.code = 'REQUEST_TYPE_NOT_FOUND';
    throw err;
  }

  if (catalogItem.requiresStudent && userProfile?.isStudent !== true) {
    const err = new Error('Student ID is only available for enrolled students');
    err.status = 403;
    err.code = 'NOT_A_STUDENT';
    throw err;
  }

  const safePayload = sanitizePayload(payload);
  const now = new Date().toISOString();
  let status = catalogItem.fulfillment === 'instant' ? 'fulfilled' : 'pending';
  let issuedDocumentId = null;
  let result = null;
  let resultMessage = '';

  if (catalogItem.fulfillment === 'instant' && catalogItem.addsToWallet !== false) {
    const doc = await issueResultDocument(userId, userProfile, catalogItem, safePayload);
    issuedDocumentId = doc.id;
    resultMessage = `${labelForType(catalogItem.resultDocumentType)} added to your wallet.`;
  } else if (catalogItem.fulfillment === 'instant' && catalogItem.addsToWallet === false) {
    // IRS / tax filings: confirmation only — never written to the document wallet
    result = buildServiceConfirmation(catalogItem, userProfile, safePayload);
    resultMessage =
      result.message ||
      `${labelForType(catalogItem.resultDocumentType)} submitted. Confirmation saved under your requests (not in wallet).`;
  } else {
    resultMessage = `Request accepted. Estimated processing: ${catalogItem.estimatedDays} day(s) (mock).`;
  }

  const record = {
    id: uuidv4(),
    userId,
    requestTypeId: catalogItem.id,
    name: catalogItem.name,
    agency: catalogItem.agency,
    resultDocumentType: catalogItem.resultDocumentType,
    addsToWallet: catalogItem.addsToWallet !== false,
    status,
    payload: safePayload,
    issuedDocumentId,
    result,
    message: resultMessage,
    createdAt: now,
    updatedAt: now,
  };

  await upsert('document_requests', record);

  audit({
    action: 'DOCUMENT_REQUEST_SUBMIT',
    userId,
    resource: catalogItem.id,
    outcome: 'success',
    ip: ctx.ip,
    requestId: ctx.requestId,
    meta: { status, issuedDocumentId },
  });

  return record;
}

function buildServiceConfirmation(catalogItem, userProfile, payload) {
  const fullName =
    `${userProfile?.firstName || 'Citizen'} ${userProfile?.lastName || 'User'}`.trim();

  if (catalogItem.resultDocumentType === 'irsSs4') {
    return {
      form: 'SS-4',
      entityName: payload.entityName || `${fullName} LLC`,
      einStatus: 'assigned',
      einMasked: `**-***${Math.floor(1000 + Math.random() * 9000)}`,
      confirmationNumber: `IRS-SS4-${uuidv4().slice(0, 8).toUpperCase()}`,
      message:
        'SS-4 accepted (mock). EIN confirmation is kept with this request — IRS forms are not stored in the wallet.',
    };
  }

  return {
    confirmationNumber: `REQ-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: 'Request fulfilled without adding a wallet document.',
  };
}

async function issueResultDocument(userId, userProfile, catalogItem, payload) {
  if (!isWalletDocumentType(catalogItem.resultDocumentType)) {
    const err = new Error('This document type cannot be stored in the wallet');
    err.status = 400;
    err.code = 'NOT_WALLET_DOCUMENT';
    throw err;
  }

  const fullName =
    `${userProfile?.firstName || 'Citizen'} ${userProfile?.lastName || 'User'}`.trim();
  const state = userProfile?.state || 'IL';
  const base = {
    id: uuidv4(),
    userId,
    type: catalogItem.resultDocumentType,
    status: 'active',
    issuedAt: new Date().toISOString(),
    state,
    fullName,
    dateOfBirth: null,
    address: null,
    licenseClass: null,
    vin: null,
    plateNumber: null,
    spouseName: null,
    institution: null,
  };

  switch (catalogItem.resultDocumentType) {
    case 'criminalRecordCertificate':
      Object.assign(base, {
        issuer: 'Illinois State Police (mock)',
        expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
        documentNumber: `CRC-${uuidv4().slice(0, 8).toUpperCase()}`,
        claims: {
          result: 'No disqualifying criminal record found (mock)',
          purpose: payload.purpose || 'general',
        },
      });
      break;
    case 'studentId':
      Object.assign(base, {
        issuer: payload.institution || 'Northeastern Illinois University (mock)',
        expiresAt: '2027-05-31T00:00:00.000Z',
        documentNumber: `STU-${uuidv4().slice(0, 8).toUpperCase()}`,
        institution: payload.institution || 'Northeastern Illinois University',
        claims: {
          program: payload.program || "Master's — Computer Science",
          studentStatus: 'enrolled',
        },
      });
      break;
    case 'marriageLicense':
      Object.assign(base, {
        issuer: `${state} County Clerk (mock)`,
        expiresAt: new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString(),
        documentNumber: `ML-${uuidv4().slice(0, 8).toUpperCase()}`,
        spouseName: payload.spouseName || null,
        claims: { licenseStatus: 'issued' },
      });
      break;
    case 'passport':
      Object.assign(base, {
        issuer: 'U.S. Department of State (mock)',
        expiresAt: '2034-01-01T00:00:00.000Z',
        documentNumber: `P${uuidv4().replace(/-/g, '').slice(0, 9).toUpperCase()}`,
        claims: { nationality: 'USA', bookType: 'passport' },
      });
      break;
    default:
      Object.assign(base, {
        issuer: catalogItem.agency,
        expiresAt: null,
        documentNumber: `DOC-${uuidv4().slice(0, 8).toUpperCase()}`,
        claims: {},
      });
  }

  const doc = encryptFields(base, DOCUMENT_PII_FIELDS);
  await upsert('documents', doc);
  return doc;
}

module.exports = {
  listCatalog,
  listRequests,
  getRequest,
  submitRequest,
  CATALOG,
};
