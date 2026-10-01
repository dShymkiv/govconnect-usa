'use strict';

/** Shared document type metadata for wallet + issuance. */

const DOCUMENT_TYPES = {
  mDL: { label: "Driver's license", category: 'identity', wallet: true },
  passport: { label: 'Passport', category: 'identity', wallet: true },
  studentId: { label: 'Student ID', category: 'education', wallet: true },
  marriageCertificate: { label: 'Marriage certificate', category: 'civil', wallet: true },
  vehicleRegistration: { label: 'Vehicle registration', category: 'vehicle', wallet: true },
  criminalRecordCertificate: {
    label: 'Certificate of no criminal record',
    category: 'civil',
    wallet: true,
  },
  marriageLicense: { label: 'Marriage license', category: 'civil', wallet: true },
  // Tax/IRS filings are services — confirmation lives in document_requests, not the wallet
  irsSs4: { label: 'IRS Form SS-4 (EIN application)', category: 'tax', wallet: false },
};

function labelForType(type) {
  return DOCUMENT_TYPES[type]?.label || type;
}

function isWalletDocumentType(type) {
  const meta = DOCUMENT_TYPES[type];
  if (!meta) return true;
  return meta.wallet !== false;
}

module.exports = { DOCUMENT_TYPES, labelForType, isWalletDocumentType };
