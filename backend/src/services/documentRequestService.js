'use strict';

/**
 * Request / order documents into the wallet (Diia-style).
 * Marriage license: dual-party confirmation via partner phone OTP (no user directory).
 * IRS SS-4: fields aligned with Form SS-4 (IRS) — confirmation only, not wallet-stored.
 */

const crypto = require('crypto');
const { uuidv4 } = require('../utils/ids');
const { findWhere, upsert, findById } = require('../repositories/store');
const { encryptFields, decryptFields } = require('../security/encryption');
const { DOCUMENT_PII_FIELDS, USER_PII_FIELDS } = require('../security/piiFields');
const { audit } = require('../security/audit');
const { labelForType, isWalletDocumentType } = require('../security/documentTypes');
const { config } = require('../config');
const { sendSms, checkTwilioVerify, isTwilioActive } = require('./smsGateway');
const { assertCatalogPayload } = require('../security/catalogValidation');

const CATALOG = [
  {
    id: 'criminal-record-certificate',
    name: 'Certificate of no criminal record',
    description: 'Request an official background / no-conviction certificate.',
    agency: 'State Police / FBI CJIS',
    resultDocumentType: 'criminalRecordCertificate',
    fulfillment: 'instant',
    estimatedDays: 0,
    addsToWallet: true,
    fields: [
      {
        key: 'purpose',
        label: 'Purpose',
        type: 'select',
        required: true,
        options: [
          { value: 'employment', label: 'Employment' },
          { value: 'immigration', label: 'Immigration' },
          { value: 'adoption', label: 'Adoption / foster' },
          { value: 'other', label: 'Other' },
        ],
      },
    ],
  },
  {
    id: 'marriage-license',
    name: 'Marriage license application',
    description:
      'Enter your partner’s details manually. They receive a secure SMS code and must confirm — you cannot pick them from a user list.',
    agency: 'County Clerk',
    resultDocumentType: 'marriageLicense',
    fulfillment: 'dual_party',
    estimatedDays: 3,
    addsToWallet: true,
    fields: [
      { key: 'partnerFirstName', label: 'Partner first name', type: 'text', required: true },
      { key: 'partnerLastName', label: 'Partner last name', type: 'text', required: true },
      {
        key: 'partnerPhone',
        label: 'Partner mobile (E.164)',
        type: 'text',
        required: true,
        placeholder: '+13125550100',
      },
      {
        key: 'partnerEmail',
        label: 'Partner email (optional)',
        type: 'text',
        required: false,
      },
      { key: 'ceremonyCounty', label: 'County of ceremony', type: 'text', required: true },
      {
        key: 'ceremonyState',
        label: 'State',
        type: 'select',
        required: true,
        options: [
          { value: 'IL', label: 'Illinois' },
          { value: 'NY', label: 'New York' },
          { value: 'CA', label: 'California' },
          { value: 'TX', label: 'Texas' },
          { value: 'WA', label: 'Washington' },
        ],
      },
      {
        key: 'intendedDate',
        label: 'Intended ceremony date',
        type: 'date',
        required: true,
      },
    ],
  },
  {
    id: 'irs-ss4',
    name: 'IRS Form SS-4 (Apply for EIN)',
    description:
      'Application for Employer Identification Number — fields follow IRS Form SS-4. Confirmation only; not stored in the wallet. Full SSN/ITIN is never collected (last 4 only).',
    agency: 'IRS',
    resultDocumentType: 'irsSs4',
    fulfillment: 'instant',
    estimatedDays: 0,
    addsToWallet: false,
    fields: [
      {
        key: 'legalName',
        label: '1. Legal name of entity (or individual)',
        type: 'text',
        required: true,
      },
      {
        key: 'tradeName',
        label: '2. Trade name (if different)',
        type: 'text',
        required: false,
      },
      {
        key: 'mailingAddress',
        label: '4a. Mailing address (street / suite)',
        type: 'text',
        required: true,
      },
      { key: 'mailingCity', label: '4b. City', type: 'text', required: true },
      {
        key: 'mailingState',
        label: '4b. State',
        type: 'select',
        required: true,
        options: [
          { value: 'IL', label: 'IL' },
          { value: 'NY', label: 'NY' },
          { value: 'CA', label: 'CA' },
          { value: 'TX', label: 'TX' },
          { value: 'WA', label: 'WA' },
          { value: 'FL', label: 'FL' },
        ],
      },
      { key: 'mailingZip', label: '4b. ZIP', type: 'text', required: true },
      {
        key: 'principalLocation',
        label: '6. County and state of principal business',
        type: 'text',
        required: true,
      },
      {
        key: 'responsiblePartyName',
        label: '7a. Name of responsible party',
        type: 'text',
        required: true,
      },
      {
        key: 'tinType',
        label: '7b. TIN type of responsible party',
        type: 'select',
        required: true,
        options: [
          { value: 'SSN', label: 'SSN' },
          { value: 'ITIN', label: 'ITIN' },
          { value: 'EIN', label: 'EIN' },
        ],
      },
      {
        key: 'tinLast4',
        label: '7b. TIN last 4 digits only (never enter full TIN)',
        type: 'text',
        required: true,
      },
      {
        key: 'entityType',
        label: '9a. Type of entity',
        type: 'select',
        required: true,
        options: [
          { value: 'sole', label: 'Sole proprietor' },
          { value: 'partnership', label: 'Partnership' },
          { value: 'corporation', label: 'Corporation' },
          { value: 'llc', label: 'LLC' },
          { value: 'estate', label: 'Estate' },
          { value: 'trust', label: 'Trust' },
          { value: 'nonprofit', label: 'Other nonprofit' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        key: 'reasonForApplying',
        label: '10. Reason for applying',
        type: 'select',
        required: true,
        options: [
          { value: 'started', label: 'Started new business' },
          { value: 'hired', label: 'Hired employees' },
          { value: 'banking', label: 'Banking purpose' },
          { value: 'changed', label: 'Changed type of organization' },
          { value: 'compliance', label: 'IRS withholding compliance' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        key: 'businessStartDate',
        label: '11. Date business started or acquired',
        type: 'date',
        required: true,
      },
      {
        key: 'closingMonth',
        label: '12. Closing month of accounting year (1–12)',
        type: 'number',
        required: true,
      },
      {
        key: 'employeesExpected',
        label: '13. Highest number of employees expected (next 12 months)',
        type: 'number',
        required: true,
      },
      {
        key: 'principalActivity',
        label: '16. Principal activity',
        type: 'select',
        required: true,
        options: [
          { value: 'construction', label: 'Construction' },
          { value: 'real_estate', label: 'Real estate' },
          { value: 'manufacturing', label: 'Manufacturing' },
          { value: 'retail', label: 'Wholesale-retail' },
          { value: 'finance', label: 'Finance & insurance' },
          { value: 'health', label: 'Health care & social assistance' },
          { value: 'food', label: 'Accommodation & food service' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        key: 'principalActivityDetail',
        label: '17. Principal line of business (detail — required by IRS)',
        type: 'text',
        required: true,
        placeholder: 'e.g. General contractor for residential buildings',
      },
      {
        key: 'hasPreviousEin',
        label: '18. Has the applicant previously applied for and received an EIN?',
        type: 'select',
        required: true,
        options: [
          { value: 'no', label: 'No' },
          { value: 'yes', label: 'Yes' },
        ],
      },
      {
        key: 'applicantPhone',
        label: 'Telephone number',
        type: 'text',
        required: true,
        placeholder: '+13125550100',
      },
    ],
  },
  {
    id: 'passport-renewal-copy',
    name: 'Passport digital copy / renewal request',
    description: 'Request a digital passport record or start renewal.',
    agency: 'U.S. Department of State',
    resultDocumentType: 'passport',
    fulfillment: 'pending',
    estimatedDays: 14,
    addsToWallet: true,
    fields: [],
  },
  {
    id: 'student-id-issue',
    name: 'Student ID (if enrolled)',
    description: 'Issue a digital student ID when the citizen is marked as a student.',
    agency: 'University Registrar',
    resultDocumentType: 'studentId',
    fulfillment: 'instant',
    estimatedDays: 0,
    requiresStudent: true,
    addsToWallet: true,
    fields: [
      {
        key: 'institution',
        label: 'Institution',
        type: 'text',
        required: true,
      },
      {
        key: 'program',
        label: 'Program',
        type: 'text',
        required: true,
      },
    ],
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
    fields: item.fields || [],
  }));
}

async function listRequests(userId) {
  return (await findWhere('document_requests', (r) => r.userId === userId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(publicRequestView);
}

async function getRequest(userId, requestId) {
  const req = await findById('document_requests', requestId);
  if (!req || req.userId !== userId) {
    const err = new Error('Document request not found');
    err.status = 404;
    throw err;
  }
  return publicRequestView(req);
}

function publicRequestView(req) {
  if (!req) return req;
  const {
    partnerConfirmHash,
    partnerConfirmCode,
    partnerPhoneE164,
    ...rest
  } = req;
  return rest;
}

function sanitizePayload(payload) {
  const blocked = [
    'ssn',
    'socialSecurityNumber',
    'fullSsn',
    'itin',
    'fullTin',
    'bankAccount',
    'routingNumber',
    'password',
  ];
  const out = { ...(payload || {}) };
  for (const key of blocked) {
    if (key in out) out[key] = '[REDACTED]';
  }
  return out;
}

function requireFields(payload, keys) {
  const missing = keys.filter((k) => {
    const v = payload[k];
    return v == null || String(v).trim() === '';
  });
  if (missing.length) {
    const err = new Error(`Missing required fields: ${missing.join(', ')}`);
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
}

function normalizePhone(phone) {
  const raw = String(phone || '').replace(/[^\d+]/g, '');
  if (!/^\+[1-9]\d{9,14}$/.test(raw)) {
    const err = new Error('Phone must be E.164 format (e.g. +13125550100)');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  return raw;
}

function hashConfirmCode(requestId, code) {
  return crypto
    .createHmac('sha256', config.jwtAccessSecret)
    .update(`marriage:${requestId}:${String(code).trim()}`)
    .digest('hex');
}

function generateNumericCode(length = 6) {
  let out = '';
  while (out.length < length) {
    out += String(crypto.randomInt(0, 10));
  }
  return out;
}

function validateSs4(payload) {
  requireFields(payload, [
    'legalName',
    'mailingAddress',
    'mailingCity',
    'mailingState',
    'mailingZip',
    'principalLocation',
    'responsiblePartyName',
    'tinType',
    'tinLast4',
    'entityType',
    'reasonForApplying',
    'businessStartDate',
    'closingMonth',
    'employeesExpected',
    'principalActivity',
    'principalActivityDetail',
    'hasPreviousEin',
    'applicantPhone',
  ]);
  const last4 = String(payload.tinLast4).replace(/\D/g, '');
  if (last4.length !== 4) {
    const err = new Error('TIN last 4 must be exactly 4 digits (full TIN is not accepted)');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  const month = Number(payload.closingMonth);
  if (!month || month < 1 || month > 12) {
    const err = new Error('Closing month must be between 1 and 12');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  if (!['yes', 'no'].includes(String(payload.hasPreviousEin))) {
    const err = new Error('Line 18 must be yes or no');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  normalizePhone(payload.applicantPhone);
  payload.tinLast4 = last4;
  payload.applicantPhone = normalizePhone(payload.applicantPhone);
  payload.principalActivityDetail = String(payload.principalActivityDetail).trim();
}

function validateMarriage(payload) {
  requireFields(payload, [
    'partnerFirstName',
    'partnerLastName',
    'partnerPhone',
    'ceremonyCounty',
    'ceremonyState',
    'intendedDate',
  ]);
  payload.partnerPhone = normalizePhone(payload.partnerPhone);
  payload.partnerFirstName = String(payload.partnerFirstName).trim();
  payload.partnerLastName = String(payload.partnerLastName).trim();
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

  const raw = { ...(payload || {}) };
  assertCatalogPayload(catalogItem.fields || [], raw, { label: requestTypeId });
  if (requestTypeId === 'irs-ss4') validateSs4(raw);
  if (requestTypeId === 'marriage-license') validateMarriage(raw);

  const safePayload = sanitizePayload(raw);
  const now = new Date().toISOString();
  let status = catalogItem.fulfillment === 'instant' ? 'fulfilled' : 'pending';
  let issuedDocumentId = null;
  let result = null;
  let resultMessage = '';
  let partnerConfirmMeta = null;

  if (catalogItem.fulfillment === 'dual_party' && requestTypeId === 'marriage-license') {
    const requestId = uuidv4();
    const code = generateNumericCode(6);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    status = 'awaiting_partner';
    const confirmUrl = `${config.publicAppUrl}/marriage-confirm`;
    resultMessage =
      'Partner confirmation required. A one-time code was sent to their phone. They confirm at the marriage confirmation page using that phone and code.';

    let smsResult;
    try {
      smsResult = await sendSms({
        to: safePayload.partnerPhone,
        code,
        body: `GovConnect: ${userProfile?.firstName || 'A citizen'} invited you to confirm a marriage license. Code: ${code}. Open ${confirmUrl} (valid 24h).`,
        meta: { kind: 'marriage_partner_confirm', requestId },
      });
    } catch (err) {
      // Demo resilience: keep dual-party flow usable if Twilio cannot reach partner phone
      // eslint-disable-next-line no-console
      console.log(
        `[marriage-sms:fallback] to=${safePayload.partnerPhone} code=${code} url=${confirmUrl} err=${err.message}`
      );
      audit({
        action: 'MARRIAGE_PARTNER_SMS_FALLBACK',
        outcome: 'failure',
        userId,
        resource: requestId,
        ip: ctx.ip,
        requestId: ctx.requestId,
        meta: { error: err.message },
      });
      smsResult = { managedByTwilio: false, provider: 'mock-fallback', degraded: true };
      resultMessage =
        'Partner confirmation required. SMS delivery failed (check Twilio verified numbers); use the on-screen partner code in development to confirm.';
    }

    const viaTwilioVerify = Boolean(smsResult?.managedByTwilio);
    partnerConfirmMeta = {
      partnerConfirmVia: viaTwilioVerify ? 'twilio-verify' : 'hmac',
      partnerConfirmHash: viaTwilioVerify ? null : hashConfirmCode(requestId, code),
      partnerConfirmExpiresAt: expiresAt,
      partnerPhoneLast4: String(safePayload.partnerPhone).slice(-4),
      partnerFullName: `${safePayload.partnerFirstName} ${safePayload.partnerLastName}`,
      smsDegraded: Boolean(smsResult?.degraded),
    };

    const record = {
      id: requestId,
      userId,
      requestTypeId: catalogItem.id,
      name: catalogItem.name,
      agency: catalogItem.agency,
      resultDocumentType: catalogItem.resultDocumentType,
      addsToWallet: true,
      status,
      payload: {
        ...safePayload,
        partnerPhone: `***${partnerConfirmMeta.partnerPhoneLast4}`,
      },
      issuedDocumentId: null,
      result: {
        partnerFullName: partnerConfirmMeta.partnerFullName,
        partnerPhoneLast4: partnerConfirmMeta.partnerPhoneLast4,
        ceremonyCounty: safePayload.ceremonyCounty,
        ceremonyState: safePayload.ceremonyState,
        intendedDate: safePayload.intendedDate,
      },
      message: resultMessage,
      partnerConfirmVia: partnerConfirmMeta.partnerConfirmVia,
      partnerConfirmHash: partnerConfirmMeta.partnerConfirmHash,
      partnerConfirmExpiresAt: partnerConfirmMeta.partnerConfirmExpiresAt,
      partnerPhoneE164: safePayload.partnerPhone,
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
      meta: { status, dualParty: true, partnerConfirmVia: partnerConfirmMeta.partnerConfirmVia },
    });

    const view = publicRequestView(record);
    // Show partner code when not using Twilio-managed OTP (mock / SMS fallback)
    if (!config.isProd && !viaTwilioVerify) {
      view.devPartnerCode = code;
      view.partnerConfirmUrl = confirmUrl;
    }
    return view;
  }

  if (catalogItem.fulfillment === 'instant' && catalogItem.addsToWallet !== false) {
    const doc = await issueResultDocument(userId, userProfile, catalogItem, safePayload);
    issuedDocumentId = doc.id;
    resultMessage = `${labelForType(catalogItem.resultDocumentType)} added to your wallet.`;
  } else if (catalogItem.fulfillment === 'instant' && catalogItem.addsToWallet === false) {
    result = buildServiceConfirmation(catalogItem, userProfile, safePayload);
    resultMessage =
      result.message ||
      `${labelForType(catalogItem.resultDocumentType)} submitted. Confirmation saved under your requests (not in wallet).`;
  } else {
    resultMessage = `Request accepted. Estimated processing: ${catalogItem.estimatedDays} day(s).`;
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

  return publicRequestView(record);
}

async function confirmMarriageLicense({ phone, code }, ctx = {}) {
  const normalized = normalizePhone(phone);
  const trimmedCode = String(code || '').trim();
  if (!/^\d{6}$/.test(trimmedCode)) {
    const err = new Error('Confirmation code must be 6 digits');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const candidates = await findWhere(
    'document_requests',
    (r) =>
      r.requestTypeId === 'marriage-license' &&
      r.status === 'awaiting_partner' &&
      r.partnerPhoneE164 === normalized
  );

  if (!candidates.length) {
    const err = new Error('No pending marriage confirmation for this phone');
    err.status = 404;
    err.code = 'MARRIAGE_CONFIRM_NOT_FOUND';
    throw err;
  }

  const req = candidates.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];

  if (req.partnerConfirmExpiresAt && new Date(req.partnerConfirmExpiresAt).getTime() < Date.now()) {
    const err = new Error('Confirmation code expired — ask the applicant to submit again');
    err.status = 410;
    err.code = 'MARRIAGE_CONFIRM_EXPIRED';
    throw err;
  }

  let codeOk = false;
  if (req.partnerConfirmVia === 'twilio-verify' || (isTwilioActive() && !req.partnerConfirmHash)) {
    try {
      codeOk = await checkTwilioVerify({ to: normalized, code: trimmedCode });
    } catch {
      codeOk = false;
    }
  } else {
    const expected = req.partnerConfirmHash;
    const actual = hashConfirmCode(req.id, trimmedCode);
    codeOk =
      Boolean(expected) &&
      expected.length === actual.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  }

  if (!codeOk) {
    audit({
      action: 'MARRIAGE_PARTNER_CONFIRM',
      outcome: 'failure',
      resource: req.id,
      ip: ctx.ip,
      requestId: ctx.requestId,
      meta: { reason: 'bad_code' },
    });
    const err = new Error('Invalid confirmation code');
    err.status = 401;
    err.code = 'MARRIAGE_CONFIRM_INVALID';
    throw err;
  }

  const applicant = await findById('users', req.userId);
  const applicantProfile = applicant
    ? decryptFields(applicant, USER_PII_FIELDS)
    : { firstName: 'Citizen', lastName: 'User', state: req.payload?.ceremonyState || 'IL' };

  const catalogItem = CATALOG.find((c) => c.id === 'marriage-license');
  const doc = await issueResultDocument(req.userId, applicantProfile, catalogItem, {
    spouseName: req.result?.partnerFullName || 'Partner',
    partnerFirstName: req.result?.partnerFullName?.split?.(' ')?.[0],
    partnerLastName: req.result?.partnerFullName?.split?.(' ')?.slice(1).join(' '),
    ceremonyCounty: req.result?.ceremonyCounty,
    ceremonyState: req.result?.ceremonyState,
    intendedDate: req.result?.intendedDate,
  });

  req.status = 'fulfilled';
  req.issuedDocumentId = doc.id;
  req.partnerConfirmedAt = new Date().toISOString();
  req.message = 'Partner confirmed. Marriage license added to the applicant wallet.';
  req.updatedAt = new Date().toISOString();
  delete req.partnerConfirmHash;
  // Keep partnerPhoneE164 encrypted-ish by wiping after confirm
  delete req.partnerPhoneE164;

  await upsert('document_requests', req);

  audit({
    action: 'MARRIAGE_PARTNER_CONFIRM',
    outcome: 'success',
    userId: req.userId,
    resource: req.id,
    ip: ctx.ip,
    requestId: ctx.requestId,
    meta: { issuedDocumentId: doc.id },
  });

  return {
    confirmed: true,
    requestId: req.id,
    message: req.message,
    documentId: doc.id,
  };
}

function buildServiceConfirmation(catalogItem, userProfile, payload) {
  if (catalogItem.resultDocumentType === 'irsSs4') {
    return {
      form: 'SS-4',
      legalName: payload.legalName,
      tradeName: payload.tradeName || null,
      entityType: payload.entityType,
      reasonForApplying: payload.reasonForApplying,
      responsiblePartyName: payload.responsiblePartyName,
      tinType: payload.tinType,
      tinLast4: payload.tinLast4,
      mailingCity: payload.mailingCity,
      mailingState: payload.mailingState,
      principalActivity: payload.principalActivity,
      principalActivityDetail: payload.principalActivityDetail,
      hasPreviousEin: payload.hasPreviousEin,
      businessStartDate: payload.businessStartDate,
      employeesExpected: Number(payload.employeesExpected) || 0,
      einStatus: 'assigned',
      einMasked: `**-***${Math.floor(1000 + Math.random() * 9000)}`,
      confirmationNumber: `IRS-SS4-${uuidv4().slice(0, 8).toUpperCase()}`,
      message:
        'Form SS-4 accepted (prototype). EIN confirmation kept with this request — full TIN was never stored; form is not in the wallet.',
      source: 'IRS Form SS-4 / Instructions (irs.gov/FormSS4, irs.gov/instructions/iss4)',
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
  const state = userProfile?.state || payload.ceremonyState || 'IL';
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
        issuer: 'Illinois State Police',
        expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
        documentNumber: `CRC-${uuidv4().slice(0, 8).toUpperCase()}`,
        claims: {
          result: 'No disqualifying criminal record found',
          purpose: payload.purpose,
        },
      });
      break;
    case 'studentId':
      Object.assign(base, {
        issuer: payload.institution,
        expiresAt: '2027-05-31T00:00:00.000Z',
        documentNumber: `STU-${uuidv4().slice(0, 8).toUpperCase()}`,
        institution: payload.institution,
        claims: {
          program: payload.program,
          studentStatus: 'enrolled',
        },
      });
      break;
    case 'marriageLicense':
      Object.assign(base, {
        issuer: `${payload.ceremonyState || state} County Clerk`,
        expiresAt: new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString(),
        documentNumber: `ML-${uuidv4().slice(0, 8).toUpperCase()}`,
        spouseName: payload.spouseName || null,
        claims: {
          licenseStatus: 'issued',
          partnerConfirmed: true,
          ceremonyCounty: payload.ceremonyCounty || null,
          ceremonyState: payload.ceremonyState || state,
          intendedDate: payload.intendedDate || null,
        },
      });
      break;
    case 'passport':
      Object.assign(base, {
        issuer: 'U.S. Department of State',
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
  confirmMarriageLicense,
  CATALOG,
};
