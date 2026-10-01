'use strict';

const { uuidv4 } = require('../utils/ids');
const { findWhere, upsert, findById } = require('../repositories/store');
const { audit } = require('../security/audit');

const CATALOG = [
  {
    id: 'dmv-license-renewal',
    agency: 'State DMV (mock)',
    name: "Driver's License Renewal Request",
    description: 'Submit a renewal request for an eligible digital driver’s license.',
    requiredDocumentTypes: ['mDL'],
  },
  {
    id: 'irs-refund-status',
    agency: 'IRS (mock)',
    name: 'Tax Refund Status Lookup',
    description: 'Look up simulated federal tax refund status by tax year.',
    requiredDocumentTypes: [],
  },
  {
    id: 'unemployment-application',
    agency: 'State Workforce Agency (mock)',
    name: 'Unemployment Benefit Application',
    description: 'File a simulated unemployment benefits application.',
    requiredDocumentTypes: ['mDL'],
  },
  {
    id: 'vehicle-reg-renewal',
    agency: 'State DMV (mock)',
    name: 'Vehicle Registration Renewal',
    description: 'Renew vehicle registration using a digital vehicle title/registration.',
    requiredDocumentTypes: ['vehicleRegistration'],
  },
];

function listCatalog() {
  return CATALOG;
}

async function listRequests(userId) {
  return (await findWhere('agency_applications', (r) => r.userId === userId)).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1
  );
}

async function getRequest(userId, requestId) {
  const req = await findById('agency_applications', requestId);
  if (!req || req.userId !== userId) {
    const err = new Error('Service request not found');
    err.status = 404;
    throw err;
  }
  return req;
}

async function submitRequest(userId, { serviceId, payload }, ctx = {}) {
  const service = CATALOG.find((s) => s.id === serviceId);
  if (!service) {
    const err = new Error('Unknown service');
    err.status = 404;
    err.code = 'SERVICE_NOT_FOUND';
    throw err;
  }

  const safePayload = sanitizePayload(payload || {});

  let result;
  switch (serviceId) {
    case 'dmv-license-renewal':
      result = mockDmvRenewal(safePayload);
      break;
    case 'irs-refund-status':
      result = mockIrsRefund(safePayload);
      break;
    case 'unemployment-application':
      result = mockUnemployment(safePayload);
      break;
    case 'vehicle-reg-renewal':
      result = mockVehicleRenewal(safePayload);
      break;
    default:
      result = { status: 'received', message: 'Queued for processing' };
  }

  const record = {
    id: uuidv4(),
    userId,
    serviceId,
    agency: service.agency,
    status: result.status,
    payload: safePayload,
    result,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await upsert('agency_applications', record);

  audit({
    action: 'SERVICE_SUBMIT',
    userId,
    resource: serviceId,
    outcome: 'success',
    ip: ctx.ip,
    requestId: ctx.requestId,
    meta: { requestId: record.id, status: record.status },
  });

  return record;
}

function sanitizePayload(payload) {
  const blocked = ['ssn', 'socialSecurityNumber', 'fullSsn', 'bankAccount', 'routingNumber', 'password'];
  const out = { ...payload };
  for (const key of blocked) {
    if (key in out) out[key] = '[REDACTED]';
  }
  return out;
}

function mockDmvRenewal(payload) {
  const eligible = payload.eligible !== false;
  return {
    status: eligible ? 'accepted' : 'rejected',
    confirmationNumber: `DMV-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: eligible
      ? 'Renewal request accepted. Temporary extension granted for 30 days (mock).'
      : 'Not eligible for online renewal (mock rule).',
    estimatedCompletionDays: eligible ? 14 : null,
  };
}

function mockIrsRefund(payload) {
  const year = Number(payload.taxYear) || new Date().getFullYear() - 1;
  const statuses = ['received', 'processing', 'approved', 'sent'];
  const pick = statuses[year % statuses.length];
  return {
    status: pick,
    taxYear: year,
    message: `Mock refund status for tax year ${year}: ${pick}`,
    refundAmountEstimate: pick === 'approved' || pick === 'sent' ? 1240.55 : null,
  };
}

function mockUnemployment(payload) {
  return {
    status: 'submitted',
    confirmationNumber: `UI-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: 'Application submitted for review (mock).',
    weeklyBenefitEstimate: Number(payload.priorWeeklyWage)
      ? Math.min(500, Math.round(Number(payload.priorWeeklyWage) * 0.5))
      : null,
  };
}

function mockVehicleRenewal(payload) {
  return {
    status: 'accepted',
    confirmationNumber: `VR-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: 'Vehicle registration renewal accepted (mock).',
    newExpirationDate: payload.requestedExpiration || null,
    feeAmount: 151.0,
  };
}

module.exports = {
  listCatalog,
  listRequests,
  getRequest,
  submitRequest,
};
