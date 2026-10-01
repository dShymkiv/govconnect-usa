'use strict';

/**
 * Vehicle fines / parking tickets — live under the vehicle domain, not the identity wallet.
 */

const { uuidv4 } = require('../utils/ids');
const { findWhere, findById, upsert } = require('../repositories/store');
const { decryptFields } = require('../security/encryption');
const { DOCUMENT_PII_FIELDS } = require('../security/piiFields');
const { audit } = require('../security/audit');

async function listVehicles(userId) {
  const docs = await findWhere(
    'documents',
    (d) => d.userId === userId && d.type === 'vehicleRegistration'
  );
  return docs.map((raw) => {
    const doc = decryptFields(raw, DOCUMENT_PII_FIELDS);
    return {
      documentId: doc.id,
      plateNumber: doc.plateNumber,
      vinMasked: doc.vin ? `***********${String(doc.vin).slice(-4)}` : null,
      make: doc.claims?.make || null,
      model: doc.claims?.model || null,
      year: doc.claims?.year || null,
      state: doc.state,
      status: doc.status,
    };
  });
}

async function listFines(userId, { documentId, status } = {}) {
  let fines = await findWhere('vehicle_fines', (f) => f.userId === userId);
  if (documentId) fines = fines.filter((f) => f.vehicleDocumentId === documentId);
  if (status) fines = fines.filter((f) => f.status === status);
  return fines.sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1));
}

async function getFine(userId, fineId) {
  const fine = await findById('vehicle_fines', fineId);
  if (!fine || fine.userId !== userId) {
    const err = new Error('Fine not found');
    err.status = 404;
    throw err;
  }
  return fine;
}

async function payFine(userId, fineId, ctx = {}) {
  const fine = await getFine(userId, fineId);
  if (fine.status === 'paid') {
    return fine;
  }
  if (fine.status === 'dismissed') {
    const err = new Error('Fine was dismissed and cannot be paid');
    err.status = 400;
    err.code = 'FINE_DISMISSED';
    throw err;
  }

  fine.status = 'paid';
  fine.paidAt = new Date().toISOString();
  fine.paymentConfirmation = `PAY-${uuidv4().slice(0, 8).toUpperCase()}`;
  fine.updatedAt = new Date().toISOString();
  await upsert('vehicle_fines', fine);

  audit({
    action: 'VEHICLE_FINE_PAID',
    userId,
    resource: fineId,
    outcome: 'success',
    ip: ctx.ip,
    requestId: ctx.requestId,
    meta: { amount: fine.amount, plateNumber: fine.plateNumber },
  });

  return fine;
}

module.exports = {
  listVehicles,
  listFines,
  getFine,
  payFine,
};
