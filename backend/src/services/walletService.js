'use strict';

const { uuidv4 } = require('../utils/ids');
const crypto = require('crypto');
const { findWhere, findById, upsert } = require('../repositories/store');
const { encryptFields, decryptFields } = require('../security/encryption');
const { DOCUMENT_PII_FIELDS } = require('../security/piiFields');
const { audit } = require('../security/audit');
const { isWalletDocumentType } = require('../security/documentTypes');

function loadDoc(doc) {
  return decryptFields(doc, DOCUMENT_PII_FIELDS);
}

function toWalletItem(doc) {
  return {
    id: doc.id,
    type: doc.type,
    issuer: doc.issuer,
    status: doc.status,
    issuedAt: doc.issuedAt,
    expiresAt: doc.expiresAt,
    displayName: doc.fullName,
    documentNumberMasked: maskId(doc.documentNumber),
    state: doc.state,
  };
}

function maskId(value) {
  if (!value || value.length < 4) return '****';
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

async function listForUser(userId, ctx = {}) {
  const docs = (await findWhere('documents', (d) => d.userId === userId))
    .map(loadDoc)
    .filter((d) => isWalletDocumentType(d.type));
  audit({
    action: 'WALLET_LIST',
    userId,
    outcome: 'success',
    ip: ctx.ip,
    requestId: ctx.requestId,
    meta: { count: docs.length },
  });
  return docs.map(toWalletItem);
}

async function getDocument(userId, documentId, ctx = {}) {
  const doc = loadDoc(await findById('documents', documentId));
  if (!doc || doc.userId !== userId) {
    audit({
      action: 'WALLET_VIEW_DENIED',
      userId,
      resource: documentId,
      outcome: 'denied',
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    const err = new Error('Document not found');
    err.status = 404;
    err.code = 'DOC_NOT_FOUND';
    throw err;
  }

  audit({
    action: 'WALLET_VIEW',
    userId,
    resource: documentId,
    outcome: 'success',
    ip: ctx.ip,
    requestId: ctx.requestId,
    meta: { type: doc.type },
  });

  return {
    ...toWalletItem(doc),
    documentNumber: doc.documentNumber,
    fullName: doc.fullName,
    dateOfBirth: doc.dateOfBirth,
    address: doc.address,
    licenseClass: doc.licenseClass || null,
    vin: doc.vin || null,
    plateNumber: doc.plateNumber || null,
    spouseName: doc.spouseName || null,
    institution: doc.institution || null,
    claims: doc.claims || {},
  };
}

async function createPresentation(userId, documentId, ctx = {}) {
  const doc = loadDoc(await findById('documents', documentId));
  if (!doc || doc.userId !== userId) {
    const err = new Error('Document not found');
    err.status = 404;
    throw err;
  }
  if (doc.status !== 'active') {
    const err = new Error('Document is not active');
    err.status = 400;
    err.code = 'DOC_INACTIVE';
    throw err;
  }

  const code = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

  await upsert('qr_verifications', {
    id: code,
    userId,
    documentId,
    createdAt: new Date().toISOString(),
    expiresAt,
    usedAt: null,
    disclosedFields: ['type', 'fullName', 'documentNumber', 'expiresAt', 'status', 'issuer', 'state'],
  });

  audit({
    action: 'WALLET_PRESENTATION_CREATED',
    userId,
    resource: documentId,
    outcome: 'success',
    ip: ctx.ip,
    requestId: ctx.requestId,
  });

  return {
    presentationCode: code,
    expiresAt,
    qrPayload: {
      system: 'GovConnectUSA',
      v: 1,
      code,
      verifyPath: `/api/v1/verify/${code}`,
    },
  };
}

async function verifyPresentation(code, ctx = {}) {
  const presentation = await findById('qr_verifications', code);
  if (!presentation) {
    audit({
      action: 'VERIFY_UNKNOWN_CODE',
      outcome: 'failure',
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    const err = new Error('Presentation not found');
    err.status = 404;
    err.code = 'PRESENTATION_NOT_FOUND';
    throw err;
  }

  if (presentation.usedAt) {
    audit({
      action: 'VERIFY_REPLAY',
      userId: presentation.userId,
      outcome: 'denied',
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    const err = new Error('Presentation already used');
    err.status = 410;
    err.code = 'PRESENTATION_USED';
    throw err;
  }

  if (new Date(presentation.expiresAt).getTime() < Date.now()) {
    audit({
      action: 'VERIFY_EXPIRED',
      userId: presentation.userId,
      outcome: 'denied',
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    const err = new Error('Presentation expired');
    err.status = 410;
    err.code = 'PRESENTATION_EXPIRED';
    throw err;
  }

  const doc = loadDoc(await findById('documents', presentation.documentId));
  presentation.usedAt = new Date().toISOString();
  await upsert('qr_verifications', presentation);

  const disclosed = {};
  for (const field of presentation.disclosedFields) {
    disclosed[field] = doc[field];
  }

  audit({
    action: 'VERIFY_SUCCESS',
    userId: presentation.userId,
    resource: presentation.documentId,
    outcome: 'success',
    ip: ctx.ip,
    requestId: ctx.requestId,
    meta: { type: doc.type },
  });

  return {
    valid: true,
    verifiedAt: presentation.usedAt,
    document: disclosed,
  };
}

async function createDocument(raw) {
  const doc = encryptFields(
    {
      id: raw.id || uuidv4(),
      userId: raw.userId,
      type: raw.type,
      issuer: raw.issuer,
      status: raw.status || 'active',
      issuedAt: raw.issuedAt,
      expiresAt: raw.expiresAt,
      state: raw.state,
      documentNumber: raw.documentNumber,
      fullName: raw.fullName,
      dateOfBirth: raw.dateOfBirth,
      address: raw.address,
      licenseClass: raw.licenseClass || null,
      vin: raw.vin || null,
      plateNumber: raw.plateNumber || null,
      claims: raw.claims || {},
    },
    DOCUMENT_PII_FIELDS
  );
  await upsert('documents', doc);
  return doc;
}

module.exports = {
  listForUser,
  getDocument,
  createPresentation,
  verifyPresentation,
  createDocument,
  toWalletItem,
};
