'use strict';

const { uuidv4 } = require('../utils/ids');
const { findWhere, upsert, findById } = require('../repositories/store');
const { decryptFields } = require('../security/encryption');
const { DOCUMENT_PII_FIELDS, USER_PII_FIELDS } = require('../security/piiFields');
const { audit } = require('../security/audit');
const { assertCatalogPayload } = require('../security/catalogValidation');
const { sendNotificationSms } = require('./smsGateway');

const US_STATE_OPTIONS = [
  { value: 'IL', label: 'Illinois' },
  { value: 'NY', label: 'New York' },
  { value: 'CA', label: 'California' },
  { value: 'TX', label: 'Texas' },
  { value: 'WA', label: 'Washington' },
  { value: 'FL', label: 'Florida' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'OH', label: 'Ohio' },
  { value: 'GA', label: 'Georgia' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'MI', label: 'Michigan' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'VA', label: 'Virginia' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'CO', label: 'Colorado' },
];

const DMV_LOCATION_OPTIONS = [
  { value: 'chicago_north', label: 'Chicago — North (St. Louis Ave)', state: 'IL' },
  { value: 'chicago_loop', label: 'Chicago — Loop (Randolph)', state: 'IL' },
  { value: 'springfield', label: 'Springfield — Howlett Building', state: 'IL' },
  { value: 'naperville', label: 'Naperville facility', state: 'IL' },
  { value: 'joliet', label: 'Joliet facility', state: 'IL' },
  { value: 'rockford', label: 'Rockford facility', state: 'IL' },
  { value: 'peoria', label: 'Peoria facility', state: 'IL' },
  { value: 'champaign', label: 'Champaign facility', state: 'IL' },
  { value: 'nyc_queens', label: 'NYC — Queens', state: 'NY' },
  { value: 'nyc_brooklyn', label: 'NYC — Brooklyn', state: 'NY' },
  { value: 'albany', label: 'Albany', state: 'NY' },
  { value: 'los_angeles', label: 'Los Angeles', state: 'CA' },
  { value: 'sacramento', label: 'Sacramento', state: 'CA' },
  { value: 'houston', label: 'Houston', state: 'TX' },
  { value: 'austin', label: 'Austin', state: 'TX' },
  { value: 'seattle', label: 'Seattle', state: 'WA' },
  { value: 'other', label: 'Other / nearest available', state: '*' },
];

const APPOINTMENT_PLACE_FIELDS = [
  {
    key: 'state',
    label: 'State',
    type: 'select',
    required: true,
    options: US_STATE_OPTIONS,
  },
  {
    key: 'location',
    label: 'Office location',
    type: 'select',
    required: true,
    options: DMV_LOCATION_OPTIONS,
  },
];

const APPOINTMENT_DATE_FIELD = {
  key: 'appointmentDate',
  label: 'Appointment date',
  type: 'date',
  required: true,
};

function stateLabel(code) {
  return US_STATE_OPTIONS.find((s) => s.value === code)?.label || code || null;
}

function locationLabel(code) {
  return DMV_LOCATION_OPTIONS.find((l) => l.value === code)?.label || code || null;
}

const CATALOG = [
  // —— DMV (wording aligned with typical state DMV portals) ——
  {
    id: 'dmv-schedule-appointment',
    agency: 'State DMV',
    category: 'dmv',
    name: 'Schedule a DMV Appointment',
    description: 'Book an in-office visit for license, ID, or vehicle services.',
    requiredDocumentTypes: ['mDL'],
    flow: 'appointment',
    fields: [
      {
        key: 'serviceType',
        label: 'What do you need to do?',
        type: 'select',
        required: true,
        options: [
          { value: 'license', label: "Renew or update driver's license / ID" },
          { value: 'vehicle', label: 'Vehicle registration or title help' },
          { value: 'real_id', label: 'REAL ID upgrade' },
          { value: 'replace', label: 'Replace a lost or damaged card' },
          { value: 'other', label: 'Something else at the DMV office' },
        ],
      },
      APPOINTMENT_DATE_FIELD,
      ...APPOINTMENT_PLACE_FIELDS,
    ],
  },
  {
    id: 'dmv-schedule-cdl',
    agency: 'State DMV',
    category: 'dmv',
    name: 'Schedule a CDL Appointment',
    description: 'Book a commercial driver license appointment (up to 90 days ahead).',
    requiredDocumentTypes: ['mDL'],
    flow: 'appointment',
    fields: [
      {
        key: 'examType',
        label: 'What do you need to do?',
        type: 'select',
        required: true,
        options: [
          { value: 'skills', label: 'Skills / drive test' },
          { value: 'knowledge', label: 'Knowledge / written exam' },
          { value: 'both', label: 'Written exam and drive test' },
        ],
      },
      APPOINTMENT_DATE_FIELD,
      ...APPOINTMENT_PLACE_FIELDS,
    ],
  },
  {
    id: 'dmv-manage-appointment',
    agency: 'State DMV',
    category: 'dmv',
    name: 'Cancel or Modify an Appointment',
    description: 'Reschedule or cancel an existing DMV or CDL office appointment.',
    requiredDocumentTypes: [],
    flow: 'appointment',
    fields: [
      {
        key: 'action',
        label: 'What do you want to do?',
        type: 'select',
        required: true,
        options: [
          { value: 'reschedule', label: 'Reschedule my appointment' },
          { value: 'cancel', label: 'Cancel my appointment' },
        ],
      },
      { key: 'confirmationNumber', label: 'Appointment confirmation #', type: 'text', required: true },
      APPOINTMENT_DATE_FIELD,
      ...APPOINTMENT_PLACE_FIELDS,
    ],
  },
  {
    id: 'dmv-real-id-upgrade',
    agency: 'State DMV',
    category: 'dmv',
    name: 'Get a REAL ID',
    description: 'Upgrade your license or ID to REAL ID–compliant.',
    requiredDocumentTypes: ['mDL'],
    flow: 'appointment',
    fields: [
      {
        key: 'serviceType',
        label: 'What do you need to do?',
        type: 'select',
        required: true,
        options: [
          { value: 'upgrade_dl', label: 'Add REAL ID to my driver’s license' },
          { value: 'upgrade_id', label: 'Get a REAL ID state ID card' },
          { value: 'both', label: 'New card with REAL ID' },
        ],
      },
      APPOINTMENT_DATE_FIELD,
      ...APPOINTMENT_PLACE_FIELDS,
    ],
  },
  {
    id: 'dmv-license-renewal',
    agency: 'State DMV',
    category: 'dmv',
    name: "Renew my Driver's License or ID Card",
    description: 'Renew using the digital credential already in your wallet.',
    requiredDocumentTypes: ['mDL'],
    fields: [{ key: 'notes', label: 'Notes (optional)', type: 'text', required: false }],
  },
  {
    id: 'dmv-teen-to-dl',
    agency: 'State DMV',
    category: 'dmv',
    name: 'Change Instruction Permit (Teen) to a DL',
    description: 'Graduate a teen instruction permit to a full driver’s license.',
    requiredDocumentTypes: ['mDL'],
    fields: [
      {
        key: 'supervisedHours',
        label: 'Supervised driving hours logged',
        type: 'number',
        required: true,
        min: 50,
      },
    ],
  },
  {
    id: 'dmv-new-license',
    agency: 'State DMV',
    category: 'dmv',
    name: 'New DL or Instruction Permit',
    description: 'Start a new driver’s license or instruction permit application.',
    requiredDocumentTypes: [],
    fields: [
      {
        key: 'credentialType',
        label: 'Credential',
        type: 'select',
        required: true,
        options: [
          { value: 'dl', label: "Driver's license" },
          { value: 'permit', label: 'Instruction permit' },
          { value: 'id', label: 'State ID card' },
        ],
      },
      { key: 'fullName', label: 'Legal name', type: 'text', required: true },
    ],
  },
  {
    id: 'dmv-duplicate-license',
    agency: 'State DMV',
    category: 'dmv',
    name: "Replace my Driver's License or ID Card",
    description: 'Order a replacement if your card was lost, stolen, or damaged.',
    requiredDocumentTypes: ['mDL'],
    fields: [
      {
        key: 'reason',
        label: 'Reason',
        type: 'select',
        required: true,
        options: [
          { value: 'lost', label: 'Lost' },
          { value: 'stolen', label: 'Stolen' },
          { value: 'damaged', label: 'Damaged' },
          { value: 'name_change', label: 'Name change' },
        ],
      },
    ],
  },
  {
    id: 'dmv-address-change',
    agency: 'State DMV',
    category: 'dmv',
    name: 'Change my Name or Address',
    description: 'Update the name or residential address on your credential.',
    requiredDocumentTypes: ['mDL'],
    fields: [
      {
        key: 'changeType',
        label: 'What are you changing?',
        type: 'select',
        required: true,
        options: [
          { value: 'address', label: 'Address only (online)' },
          { value: 'name', label: 'Legal name' },
          { value: 'both', label: 'Name and address' },
        ],
      },
      { key: 'newAddress', label: 'New residential address', type: 'text', required: true },
      { key: 'city', label: 'City', type: 'text', required: true },
      { key: 'zip', label: 'ZIP code', type: 'text', required: true },
      {
        key: 'newName',
        label: 'New legal name (if changing)',
        type: 'text',
        required: false,
        requiredWhen: { changeType: ['name', 'both'] },
      },
    ],
  },
  {
    id: 'dmv-cdl-written',
    agency: 'State DMV',
    category: 'dmv',
    name: 'CDL Written Appointments',
    description: 'Schedule the commercial knowledge / written exams.',
    requiredDocumentTypes: ['mDL'],
    flow: 'appointment',
    fields: [
      {
        key: 'examType',
        label: 'What do you need to do?',
        type: 'select',
        required: true,
        options: [
          { value: 'general', label: 'General knowledge test' },
          { value: 'endorsement', label: 'Endorsement test' },
          { value: 'air_brakes', label: 'Air brakes test' },
        ],
      },
      APPOINTMENT_DATE_FIELD,
      ...APPOINTMENT_PLACE_FIELDS,
    ],
  },
  {
    id: 'dmv-cdl-drive',
    agency: 'State DMV',
    category: 'dmv',
    name: 'CDL Drive Appointments',
    description: 'Schedule the commercial skills / road test.',
    requiredDocumentTypes: ['mDL'],
    flow: 'appointment',
    fields: [
      {
        key: 'vehicleClass',
        label: 'What do you need to do?',
        type: 'select',
        required: true,
        options: [
          { value: 'A', label: 'Class A skills test' },
          { value: 'B', label: 'Class B skills test' },
          { value: 'C', label: 'Class C skills test' },
        ],
      },
      APPOINTMENT_DATE_FIELD,
      ...APPOINTMENT_PLACE_FIELDS,
    ],
  },
  {
    id: 'vehicle-reg-renewal',
    agency: 'State DMV',
    category: 'dmv',
    name: 'Vehicle Plates & Titles',
    description: 'Renew registration, manage plates, or start a title-related request.',
    requiredDocumentTypes: ['vehicleRegistration'],
    fields: [
      {
        key: 'documentId',
        label: 'Select vehicle',
        type: 'walletDocument',
        documentType: 'vehicleRegistration',
        required: true,
      },
      {
        key: 'plateAction',
        label: 'Request type',
        type: 'select',
        required: true,
        options: [
          { value: 'renew', label: 'Renew registration' },
          { value: 'replace_plate', label: 'Replace plate' },
          { value: 'title_copy', label: 'Title copy / inquiry' },
        ],
      },
    ],
  },
  {
    id: 'dmv-informal-hearing',
    agency: 'State DMV',
    category: 'dmv',
    name: 'Informal Hearings',
    description: 'Request an informal hearing for a suspension or related notice.',
    requiredDocumentTypes: ['mDL'],
    flow: 'appointment',
    fields: [
      {
        key: 'hearingType',
        label: 'What do you need to do?',
        type: 'select',
        required: true,
        options: [
          { value: 'suspension', label: 'Appeal a suspension' },
          { value: 'revocation', label: 'Appeal a revocation' },
          { value: 'other', label: 'Other hearing request' },
        ],
      },
      { key: 'noticeId', label: 'Notice / case ID', type: 'text', required: true },
      APPOINTMENT_DATE_FIELD,
      ...APPOINTMENT_PLACE_FIELDS,
    ],
  },
  {
    id: 'dmv-driving-record',
    agency: 'State DMV',
    category: 'dmv',
    name: 'Get my Driving Record',
    description: 'Order an official driving record for employment or insurance.',
    requiredDocumentTypes: ['mDL'],
    fields: [
      {
        key: 'recordType',
        label: 'Record type',
        type: 'select',
        required: true,
        options: [
          { value: 'standard', label: 'Standard (3-year)' },
          { value: 'complete', label: 'Complete (full history)' },
          { value: 'insurance', label: 'Insurance abstract' },
        ],
      },
    ],
  },

  // —— IRS ——
  {
    id: 'irs-make-payment',
    agency: 'IRS',
    category: 'irs',
    name: 'Make a payment',
    description: 'Pay your federal taxes by bank account, debit, or credit card.',
    requiredDocumentTypes: [],
    fields: [
      {
        key: 'taxYear',
        label: 'Tax year',
        type: 'number',
        required: true,
      },
      {
        key: 'paymentMethod',
        label: 'Payment method',
        type: 'select',
        required: true,
        options: [
          { value: 'bank', label: 'Bank account (ACH)' },
          { value: 'debit', label: 'Debit card' },
          { value: 'credit', label: 'Credit card' },
        ],
      },
      {
        key: 'paymentType',
        label: 'Payment type',
        type: 'select',
        required: true,
        options: [
          { value: 'balance', label: 'Balance due' },
          { value: 'estimated', label: 'Estimated tax' },
          { value: 'extension', label: 'Extension payment' },
        ],
      },
      { key: 'amount', label: 'Amount (USD)', type: 'number', required: true, positive: true },
    ],
  },
  {
    id: 'irs-refund-status',
    agency: 'IRS',
    category: 'irs',
    name: 'Refunds',
    description: 'When to expect your refund · Check Where’s My Refund status by tax year.',
    requiredDocumentTypes: [],
    fields: [
      {
        key: 'taxYear',
        label: 'Tax year',
        type: 'number',
        required: true,
      },
      {
        key: 'filingStatus',
        label: 'Filing status',
        type: 'select',
        required: true,
        options: [
          { value: 'single', label: 'Single' },
          { value: 'mfj', label: 'Married filing jointly' },
          { value: 'hoh', label: 'Head of household' },
        ],
      },
    ],
  },
  {
    id: 'irs-transcript-request',
    agency: 'IRS',
    category: 'irs',
    name: 'Get Your Tax Record',
    description: 'Access your personal tax records online (transcript / Form 4506-T style request).',
    requiredDocumentTypes: [],
    fields: [
      {
        key: 'taxYear',
        label: 'Tax year',
        type: 'number',
        required: true,
      },
      {
        key: 'transcriptType',
        label: 'Record type',
        type: 'select',
        required: true,
        options: [
          { value: 'return', label: 'Tax return transcript (4506-T)' },
          { value: 'wage', label: 'Wage & Income' },
          { value: 'account', label: 'Tax Account' },
          { value: 'record', label: 'Record of Account' },
        ],
      },
      {
        key: 'delivery',
        label: 'Delivery',
        type: 'select',
        required: true,
        options: [
          { value: 'online', label: 'Online PDF' },
          { value: 'mail', label: 'Mail to address on file' },
        ],
      },
    ],
  },
  {
    id: 'irs-payment-plan',
    agency: 'IRS',
    category: 'irs',
    name: 'Form 9465 — Installment Agreement',
    description: 'Request a monthly installment agreement for a balance due.',
    requiredDocumentTypes: [],
    fields: [
      {
        key: 'taxYear',
        label: 'Tax year',
        type: 'number',
        required: true,
      },
      {
        key: 'balanceDue',
        label: 'Balance due (USD)',
        type: 'number',
        required: true,
        positive: true,
      },
      {
        key: 'monthlyPayment',
        label: 'Proposed monthly payment (USD)',
        type: 'number',
        required: true,
        positive: true,
      },
    ],
  },
  {
    id: 'irs-estimated-tax',
    agency: 'IRS',
    category: 'irs',
    name: 'Form 1040-ES — Estimated Tax',
    description: 'Record a quarterly estimated tax payment.',
    requiredDocumentTypes: [],
    fields: [
      {
        key: 'taxYear',
        label: 'Tax year',
        type: 'number',
        required: true,
      },
      {
        key: 'quarter',
        label: 'Quarter',
        type: 'select',
        required: true,
        options: [
          { value: 'Q1', label: 'Q1' },
          { value: 'Q2', label: 'Q2' },
          { value: 'Q3', label: 'Q3' },
          { value: 'Q4', label: 'Q4' },
        ],
      },
      { key: 'amount', label: 'Payment amount (USD)', type: 'number', required: true, positive: true },
    ],
  },
  {
    id: 'irs-amend-status',
    agency: 'IRS',
    category: 'irs',
    name: 'Form 1040-X — Amended Return',
    description: 'Correct or amend a prior individual income tax return and check status.',
    requiredDocumentTypes: [],
    fields: [
      {
        key: 'taxYear',
        label: 'Tax year',
        type: 'number',
        required: true,
      },
      {
        key: 'reason',
        label: 'Reason for amendment',
        type: 'select',
        required: true,
        options: [
          { value: 'income', label: 'Correct income' },
          { value: 'credits', label: 'Credits / deductions' },
          { value: 'filing_status', label: 'Filing status' },
          { value: 'other', label: 'Other' },
        ],
      },
    ],
  },
  {
    id: 'irs-form-w9',
    agency: 'IRS',
    category: 'irs',
    name: 'Form W-9 — Taxpayer ID',
    description: 'Request for Taxpayer Identification Number (TIN) and certification.',
    requiredDocumentTypes: [],
    fields: [
      { key: 'name', label: 'Name (as shown on tax return)', type: 'text', required: true },
      {
        key: 'taxClassification',
        label: 'Federal tax classification',
        type: 'select',
        required: true,
        options: [
          { value: 'individual', label: 'Individual / sole proprietor' },
          { value: 'llc', label: 'LLC' },
          { value: 'corporation', label: 'C Corporation' },
          { value: 's_corp', label: 'S Corporation' },
          { value: 'partnership', label: 'Partnership' },
        ],
      },
      { key: 'address', label: 'Address', type: 'text', required: true },
    ],
  },
  {
    id: 'irs-form-w4',
    agency: 'IRS',
    category: 'irs',
    name: 'Form W-4 — Withholding',
    description: "Employee's Withholding Certificate for your employer.",
    requiredDocumentTypes: [],
    fields: [
      {
        key: 'filingStatus',
        label: 'Filing status',
        type: 'select',
        required: true,
        options: [
          { value: 'single', label: 'Single or married filing separately' },
          { value: 'mfj', label: 'Married filing jointly' },
          { value: 'hoh', label: 'Head of household' },
        ],
      },
      {
        key: 'multipleJobs',
        label: 'Multiple jobs?',
        type: 'select',
        required: true,
        options: [
          { value: 'no', label: 'No' },
          { value: 'yes', label: 'Yes' },
        ],
      },
      {
        key: 'dependentsAmount',
        label: 'Claimed dependents amount (USD)',
        type: 'number',
        required: false,
        default: '0',
      },
    ],
  },

  // —— Unemployment ——
  {
    id: 'unemployment-application',
    agency: 'State Workforce Agency',
    category: 'unemployment',
    name: 'Unemployment Benefits Application',
    description: 'File an unemployment benefits claim (requires mDL in wallet).',
    requiredDocumentTypes: ['mDL'],
    fields: [
      {
        key: 'priorWeeklyWage',
        label: 'Prior weekly wage (USD)',
        type: 'number',
        required: true,
        positive: true,
      },
      {
        key: 'reason',
        label: 'Reason for separation',
        type: 'select',
        required: true,
        options: [
          { value: 'laid_off', label: 'Laid off' },
          { value: 'hours_reduced', label: 'Hours reduced' },
          { value: 'fired', label: 'Discharged' },
          { value: 'quit', label: 'Quit' },
          { value: 'other', label: 'Other' },
        ],
      },
    ],
  },
  {
    id: 'unemployment-weekly-cert',
    agency: 'State Workforce Agency',
    category: 'unemployment',
    name: 'Weekly Certification',
    description: 'Certify work search and request payment for the current week.',
    requiredDocumentTypes: ['mDL'],
    fields: [
      {
        key: 'hoursWorked',
        label: 'Hours worked this week',
        type: 'number',
        required: true,
        nonNegative: true,
      },
      {
        key: 'ableAndAvailable',
        label: 'Able and available for work?',
        type: 'select',
        required: true,
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
      },
      {
        key: 'jobContacts',
        label: 'Job contacts this week',
        type: 'number',
        required: true,
        nonNegative: true,
      },
    ],
  },
  {
    id: 'unemployment-claim-status',
    agency: 'State Workforce Agency',
    category: 'unemployment',
    name: 'Claim Status',
    description: 'View the status of your active unemployment claim.',
    requiredDocumentTypes: ['mDL'],
    fields: [],
  },
  {
    id: 'unemployment-appeal',
    agency: 'State Workforce Agency',
    category: 'unemployment',
    name: 'Appeal a Determination',
    description: 'File an appeal if benefits were denied or reduced.',
    requiredDocumentTypes: ['mDL'],
    fields: [
      {
        key: 'determinationId',
        label: 'Determination / notice ID',
        type: 'text',
        required: true,
      },
      {
        key: 'appealReason',
        label: 'Why are you appealing?',
        type: 'text',
        required: true,
      },
    ],
  },
  {
    id: 'unemployment-payment-method',
    agency: 'State Workforce Agency',
    category: 'unemployment',
    name: 'Update Payment Method',
    description: 'Confirm how you want to receive benefit payments.',
    requiredDocumentTypes: ['mDL'],
    fields: [
      {
        key: 'method',
        label: 'Payment method',
        type: 'select',
        required: true,
        options: [
          { value: 'direct_deposit', label: 'Direct deposit' },
          { value: 'debit_card', label: 'State debit card' },
        ],
      },
    ],
  },
];

function listCatalog(category) {
  if (!category) return CATALOG;
  return CATALOG.filter((s) => s.category === category);
}

function withServiceLabels(req) {
  if (!req) return req;
  const service = CATALOG.find((s) => s.id === req.serviceId);
  return {
    ...req,
    serviceName: req.serviceName || service?.name || req.serviceId,
    agency: req.agency || service?.agency || null,
  };
}

async function listRequests(userId, category) {
  const ids = new Set(listCatalog(category).map((s) => s.id));
  return (await findWhere('agency_applications', (r) => r.userId === userId))
    .filter((r) => !category || ids.has(r.serviceId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(withServiceLabels);
}

async function getRequest(userId, requestId) {
  const req = await findById('agency_applications', requestId);
  if (!req || req.userId !== userId) {
    const err = new Error('Service request not found');
    err.status = 404;
    throw err;
  }
  return withServiceLabels(req);
}

function loadDoc(raw) {
  if (!raw) return null;
  return decryptFields(raw, DOCUMENT_PII_FIELDS);
}

async function listActiveDocsOfType(userId, type) {
  const docs = await findWhere(
    'documents',
    (d) => d.userId === userId && d.status === 'active' && d.type === type
  );
  return docs.map(loadDoc).filter(Boolean);
}

async function findRequiredDocuments(userId, service, payload = {}) {
  const types = service.requiredDocumentTypes || [];
  if (!types.length) return [];

  const selectField = (service.fields || []).find((f) => f.type === 'walletDocument');
  const selectedId = payload.documentId ? String(payload.documentId) : '';

  return Promise.all(
    types.map(async (type) => {
      const candidates = await listActiveDocsOfType(userId, type);
      if (!candidates.length) return { type, document: null };

      if (selectField && selectField.documentType === type) {
        if (!selectedId) {
          return { type, document: null, needsSelection: true, options: candidates.length };
        }
        const picked = candidates.find((d) => d.id === selectedId) || null;
        return { type, document: picked };
      }

      return { type, document: candidates[0] };
    })
  );
}

async function submitRequest(userId, { serviceId, payload }, ctx = {}) {
  const service = CATALOG.find((s) => s.id === serviceId);
  if (!service) {
    const err = new Error('Unknown service');
    err.status = 404;
    err.code = 'SERVICE_NOT_FOUND';
    throw err;
  }

  const rawPayload = assertCatalogPayload(service.fields || [], payload || {}, {
    label: service.id,
  });

  // Appointment: office must belong to the chosen state (or "other")
  if (rawPayload.state && rawPayload.location) {
    const office = DMV_LOCATION_OPTIONS.find((o) => o.value === String(rawPayload.location));
    if (
      office &&
      office.state !== '*' &&
      office.state !== String(rawPayload.state)
    ) {
      const err = new Error(
        `Office location does not match state ${rawPayload.state}. Choose a location in that state.`
      );
      err.status = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
  }

  const required = await findRequiredDocuments(userId, service, rawPayload);

  const needsPick = required.find((r) => r.needsSelection);
  if (needsPick) {
    const err = new Error(
      `Select which ${needsPick.type} to use for this request (documentId).`
    );
    err.status = 400;
    err.code = 'DOCUMENT_SELECTION_REQUIRED';
    throw err;
  }

  const invalidPick = (service.fields || []).some(
    (f) =>
      f.type === 'walletDocument' &&
      rawPayload.documentId &&
      required.some((r) => r.type === f.documentType && !r.document)
  );
  if (invalidPick) {
    const err = new Error(
      'Selected document was not found in your wallet or is not active.'
    );
    err.status = 400;
    err.code = 'INVALID_WALLET_DOCUMENT';
    throw err;
  }

  const missing = required.filter((r) => !r.document).map((r) => r.type);
  if (missing.length) {
    const err = new Error(
      `Missing required wallet document(s): ${missing.join(', ')}. Add them to your wallet first.`
    );
    err.status = 400;
    err.code = 'MISSING_WALLET_DOCUMENT';
    throw err;
  }

  const safePayload = sanitizePayload(rawPayload);
  const linkedDocs = Object.fromEntries(
    required.map((r) => [
      r.type,
      {
        documentId: r.document.id,
        documentNumber: r.document.documentNumber,
        state: r.document.state,
        expiresAt: r.document.expiresAt,
        plateNumber: r.document.plateNumber || null,
      },
    ])
  );

  let result;
  switch (serviceId) {
    case 'dmv-schedule-appointment':
      result = mockDmvScheduleAppointment(safePayload, linkedDocs.mDL);
      break;
    case 'dmv-schedule-cdl':
      result = mockDmvScheduleCdl(safePayload, linkedDocs.mDL);
      break;
    case 'dmv-manage-appointment':
      result = mockDmvManageAppointment(safePayload);
      break;
    case 'dmv-license-renewal':
      result = mockDmvRenewal(safePayload, linkedDocs.mDL);
      break;
    case 'vehicle-reg-renewal':
      result = mockVehicleRenewal(safePayload, linkedDocs.vehicleRegistration);
      break;
    case 'dmv-address-change':
      result = mockDmvAddressChange(safePayload, linkedDocs.mDL);
      break;
    case 'dmv-duplicate-license':
      result = mockDmvDuplicate(safePayload, linkedDocs.mDL);
      break;
    case 'dmv-driving-record':
      result = mockDmvDrivingRecord(safePayload, linkedDocs.mDL);
      break;
    case 'dmv-real-id-upgrade':
      result = mockDmvRealId(safePayload, linkedDocs.mDL);
      break;
    case 'dmv-teen-to-dl':
      result = mockDmvTeenToDl(safePayload, linkedDocs.mDL);
      break;
    case 'dmv-new-license':
      result = mockDmvNewLicense(safePayload);
      break;
    case 'dmv-cdl-written':
      result = mockDmvCdlWritten(safePayload, linkedDocs.mDL);
      break;
    case 'dmv-cdl-drive':
      result = mockDmvCdlDrive(safePayload, linkedDocs.mDL);
      break;
    case 'dmv-informal-hearing':
      result = mockDmvInformalHearing(safePayload, linkedDocs.mDL);
      break;
    case 'irs-make-payment':
      result = mockIrsMakePayment(safePayload);
      break;
    case 'irs-refund-status':
      result = mockIrsRefund(safePayload);
      break;
    case 'irs-transcript-request':
      result = mockIrsTranscript(safePayload);
      break;
    case 'irs-payment-plan':
      result = mockIrsPaymentPlan(safePayload);
      break;
    case 'irs-estimated-tax':
      result = mockIrsEstimatedTax(safePayload);
      break;
    case 'irs-amend-status':
      result = mockIrsAmendStatus(safePayload);
      break;
    case 'irs-form-w9':
      result = mockIrsFormW9(safePayload);
      break;
    case 'irs-form-w4':
      result = mockIrsFormW4(safePayload);
      break;
    case 'unemployment-application':
      result = mockUnemployment(safePayload, linkedDocs.mDL);
      break;
    case 'unemployment-weekly-cert':
      result = mockUnemploymentWeekly(safePayload, linkedDocs.mDL);
      break;
    case 'unemployment-claim-status':
      result = mockUnemploymentClaimStatus(safePayload, linkedDocs.mDL);
      break;
    case 'unemployment-appeal':
      result = mockUnemploymentAppeal(safePayload, linkedDocs.mDL);
      break;
    case 'unemployment-payment-method':
      result = mockUnemploymentPaymentMethod(safePayload, linkedDocs.mDL);
      break;
    default:
      result = { status: 'received', message: 'Queued for processing' };
  }

  const record = {
    id: uuidv4(),
    userId,
    serviceId,
    serviceName: service.name,
    agency: service.agency,
    category: service.category,
    status: result.status,
    payload: safePayload,
    linkedDocuments: linkedDocs,
    result,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (shouldSendAppointmentSms(service, result)) {
    const sms = await notifyAppointmentBySms(userId, service, record, ctx);
    record.result = { ...record.result, smsConfirmation: sms };
    record.updatedAt = new Date().toISOString();
  } else if (shouldSendPaymentSms(service, result)) {
    const sms = await notifyPaymentBySms(userId, service, record, ctx);
    record.result = { ...record.result, smsConfirmation: sms };
    record.updatedAt = new Date().toISOString();
  }

  await upsert('agency_applications', record);

  audit({
    action: 'SERVICE_SUBMIT',
    userId,
    resource: serviceId,
    outcome: 'success',
    ip: ctx.ip,
    requestId: ctx.requestId,
    meta: {
      requestId: record.id,
      status: record.status,
      category: service.category,
      smsSent: Boolean(record.result?.smsConfirmation?.sent),
    },
  });

  return record;
}

function shouldSendAppointmentSms(service, result) {
  if (service?.flow !== 'appointment') return false;
  const status = String(result?.status || '');
  return status === 'accepted' || status === 'submitted';
}

const PAYMENT_SMS_SERVICE_IDS = new Set([
  'irs-make-payment',
  'irs-payment-plan',
  'irs-estimated-tax',
  'unemployment-payment-method',
]);

function shouldSendPaymentSms(service, result) {
  if (!PAYMENT_SMS_SERVICE_IDS.has(service?.id)) return false;
  const status = String(result?.status || '');
  return status === 'accepted' || status === 'submitted';
}

async function loadUserPhone(userId) {
  const raw = await findById('users', userId);
  if (!raw) return null;
  const user = decryptFields(raw, USER_PII_FIELDS);
  const phone = user.phoneE164 || user.phone || null;
  return phone ? String(phone) : null;
}

function buildAppointmentSmsBody(service, record) {
  const r = record.result || {};
  const conf = r.confirmationNumber || record.id.slice(0, 8).toUpperCase();
  const when = r.appointmentWindow || record.payload?.appointmentDate || 'your selected date';
  const place = r.officeLocation || record.payload?.location || 'your selected office';
  const action =
    service.id === 'dmv-manage-appointment'
      ? 'updated'
      : service.id === 'dmv-informal-hearing'
        ? 'scheduled'
        : 'confirmed';
  return `GovConnect: ${service.name} ${action}. Confirmation ${conf}. ${when} at ${place}. Keep this message for your visit.`;
}

async function notifyAppointmentBySms(userId, service, record, ctx = {}) {
  const phone = await loadUserPhone(userId);
  if (!phone) {
    return { sent: false, reason: 'no_phone_on_file' };
  }

  try {
    const delivery = await sendNotificationSms({
      to: phone,
      body: buildAppointmentSmsBody(service, record),
      meta: {
        kind: 'appointment_confirmation',
        serviceId: service.id,
        requestId: record.id,
        userId,
        ip: ctx.ip,
      },
    });
    return {
      sent: Boolean(delivery.accepted) && !delivery.degraded,
      provider: delivery.provider,
      degraded: Boolean(delivery.degraded),
      phoneLast4: phone.slice(-4),
      reason: delivery.degraded ? delivery.error || 'degraded_delivery' : undefined,
    };
  } catch (err) {
    audit({
      action: 'APPOINTMENT_SMS_FAILED',
      outcome: 'failure',
      userId,
      resource: record.id,
      ip: ctx.ip,
      requestId: ctx.requestId,
      meta: { serviceId: service.id, error: err.message },
    });
    // Booking already succeeded — SMS is best-effort
    return { sent: false, reason: err.code || 'SMS_SEND_FAILED', message: err.message };
  }
}

function buildPaymentSmsBody(service, record) {
  const r = record.result || {};
  const conf = r.confirmationNumber || record.id.slice(0, 8).toUpperCase();
  if (service.id === 'irs-payment-plan') {
    const monthly = Number(r.monthlyPayment || 0).toFixed(2);
    return `GovConnect: IRS installment plan confirmed (${conf}). About $${monthly}/mo. First due ${r.firstPaymentDue || 'soon'}.`;
  }
  if (service.id === 'unemployment-payment-method') {
    return `GovConnect: Unemployment payment method updated (${conf}). ${r.paymentMethod || 'Method on file'}.`;
  }
  const amount = Number(r.paymentAmount || 0).toFixed(2);
  return `GovConnect: Payment confirmed. $${amount}. Ref ${conf}. ${service.name}.`;
}

async function notifyPaymentBySms(userId, service, record, ctx = {}) {
  const phone = await loadUserPhone(userId);
  if (!phone) {
    return { sent: false, reason: 'no_phone_on_file' };
  }

  try {
    const delivery = await sendNotificationSms({
      to: phone,
      body: buildPaymentSmsBody(service, record),
      meta: {
        kind: 'payment_confirmation',
        serviceId: service.id,
        requestId: record.id,
        userId,
        ip: ctx.ip,
      },
    });
    return {
      sent: Boolean(delivery.accepted) && !delivery.degraded,
      provider: delivery.provider,
      degraded: Boolean(delivery.degraded),
      phoneLast4: phone.slice(-4),
      reason: delivery.degraded ? delivery.error || 'degraded_delivery' : undefined,
    };
  } catch (err) {
    audit({
      action: 'PAYMENT_SMS_FAILED',
      outcome: 'failure',
      userId,
      resource: record.id,
      ip: ctx.ip,
      requestId: ctx.requestId,
      meta: { serviceId: service.id, error: err.message },
    });
    return { sent: false, reason: err.code || 'SMS_SEND_FAILED', message: err.message };
  }
}

function sanitizePayload(payload) {
  const blocked = ['ssn', 'socialSecurityNumber', 'fullSsn', 'bankAccount', 'routingNumber', 'password'];
  const out = { ...payload };
  for (const key of blocked) {
    if (key in out) out[key] = '[REDACTED]';
  }
  return out;
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function mockDmvRenewal(payload, mdl) {
  const expired =
    mdl?.expiresAt && new Date(mdl.expiresAt).getTime() < Date.now() - 365 * 24 * 3600 * 1000;
  if (expired) {
    return {
      status: 'rejected',
      confirmationNumber: null,
      message: 'License expired more than 1 year ago — visit a DMV office.',
      estimatedCompletionDays: null,
      linkedDocumentId: mdl.documentId,
    };
  }
  return {
    status: 'accepted',
    confirmationNumber: `DMV-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: `Renewal accepted for license ${mdl.documentNumber} (${mdl.state}). Temporary extension: 30 days.`,
    estimatedCompletionDays: 14,
    linkedDocumentId: mdl.documentId,
    notes: payload.notes || null,
  };
}

function mockVehicleRenewal(payload, reg) {
  const action = String(payload.plateAction);
  const labels = {
    renew: 'Registration renewal',
    replace_plate: 'Plate replacement',
    title_copy: 'Title copy / inquiry',
  };
  const fee = action === 'renew' ? 151 : action === 'replace_plate' ? 45 : 20;
  const base = reg?.expiresAt ? new Date(reg.expiresAt) : new Date();
  const next = new Date(base);
  next.setFullYear(next.getFullYear() + 1);
  const plate = reg.plateNumber ? ` · plate ${reg.plateNumber}` : '';
  return {
    status: 'accepted',
    confirmationNumber: `VR-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: `${labels[action] || 'Vehicle request'} for ${reg.documentNumber}${plate} accepted.`,
    newExpirationDate: action === 'renew' ? next.toISOString().slice(0, 10) : null,
    feeAmount: fee,
    linkedDocumentId: reg.documentId,
    plateNumber: reg.plateNumber || null,
  };
}

function mockDmvAddressChange(payload, mdl) {
  const address = [payload.newAddress, payload.city, payload.zip].filter(Boolean).join(', ');
  const changeType = String(payload.changeType);
  return {
    status: 'accepted',
    confirmationNumber: `ADDR-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: `Name/address update filed for license ${mdl.documentNumber}.`,
    mailingAddress: address,
    estimatedCompletionDays: changeType === 'address' ? 3 : 14,
    linkedDocumentId: mdl.documentId,
    feeAmount: changeType === 'address' ? 0 : 30,
  };
}

function appointmentPlace(payload) {
  const state = String(payload.state);
  const location = String(payload.location);
  return {
    state: stateLabel(state) || state,
    officeLocation: locationLabel(location) || location,
  };
}

function appointmentWhen(payload) {
  return String(payload.appointmentDate);
}

function mockDmvScheduleAppointment(payload, mdl) {
  const when = appointmentWhen(payload);
  const place = appointmentPlace(payload);
  return {
    status: 'accepted',
    confirmationNumber: `APT-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: `DMV appointment booked for ${when} at ${place.officeLocation}.`,
    appointmentWindow: `${when} · 10:00–10:30 AM`,
    documentsNeeded: 'Current credential + proof of residency',
    linkedDocumentId: mdl?.documentId || null,
    feeAmount: 0,
    reason: payload.serviceType || null,
    ...place,
  };
}

function mockDmvScheduleCdl(payload, mdl) {
  const when = appointmentWhen(payload);
  const place = appointmentPlace(payload);
  return {
    status: 'accepted',
    confirmationNumber: `CDL-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: `CDL appointment (${payload.examType}) booked for ${when} at ${place.officeLocation}.`,
    appointmentWindow: `${when} · 8:00–11:00 AM`,
    linkedDocumentId: mdl?.documentId || null,
    feeAmount: 50,
    ...place,
  };
}

function mockDmvManageAppointment(payload) {
  const action = payload.action === 'cancel' ? 'cancelled' : 'rescheduled';
  const place = appointmentPlace(payload);
  const when = appointmentWhen(payload);
  return {
    status: 'accepted',
    confirmationNumber: String(payload.confirmationNumber),
    message: `Appointment ${payload.confirmationNumber} ${action}${place.state ? ` (${place.state})` : ''}.`,
    appointmentWindow: action === 'rescheduled' ? `${when} (new time window)` : null,
    ...place,
  };
}

function mockDmvTeenToDl(payload, mdl) {
  return {
    status: 'accepted',
    confirmationNumber: `TEEN-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: `Permit-to-DL upgrade started for ${mdl.documentNumber}. Road test may be required.`,
    estimatedCompletionDays: 21,
    feeAmount: 30,
    linkedDocumentId: mdl.documentId,
  };
}

function mockDmvNewLicense(payload) {
  const types = { dl: "Driver's license", permit: 'Instruction permit', id: 'State ID card' };
  const credentialType = String(payload.credentialType);
  return {
    status: 'accepted',
    confirmationNumber: `NEW-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: `New ${types[credentialType] || 'credential'} application started for ${payload.fullName}.`,
    appointmentWindow: 'Visit required — book a DMV appointment',
    estimatedCompletionDays: 30,
    feeAmount: 35,
    documentsNeeded: 'Proof of identity, SSN, and residency',
  };
}

function mockDmvCdlWritten(payload, mdl) {
  const when = appointmentWhen(payload);
  const place = appointmentPlace(payload);
  return {
    status: 'accepted',
    confirmationNumber: `CDLW-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: `CDL written exam (${payload.examType}) set for ${when} at ${place.officeLocation}.`,
    appointmentWindow: `${when} · 9:00 AM knowledge testing`,
    feeAmount: 20,
    linkedDocumentId: mdl.documentId,
    ...place,
  };
}

function mockDmvCdlDrive(payload, mdl) {
  const when = appointmentWhen(payload);
  const place = appointmentPlace(payload);
  return {
    status: 'accepted',
    confirmationNumber: `CDLD-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: `CDL Class ${payload.vehicleClass} drive test scheduled for ${when} at ${place.officeLocation}.`,
    appointmentWindow: `${when} · skills course — bring qualified vehicle`,
    feeAmount: 75,
    linkedDocumentId: mdl.documentId,
    ...place,
  };
}

function mockDmvInformalHearing(payload, mdl) {
  const when = appointmentWhen(payload);
  const place = appointmentPlace(payload);
  return {
    status: 'submitted',
    confirmationNumber: `HRG-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: `Informal hearing (${payload.hearingType}) for notice ${payload.noticeId} on ${when}.`,
    determinationId: String(payload.noticeId),
    appointmentWindow: `${when} · hearing window`,
    appealDeadline: daysFromNow(14),
    linkedDocumentId: mdl.documentId,
    ...place,
  };
}

function mockDmvDuplicate(payload, mdl) {
  const reasonLabels = {
    lost: 'Lost',
    stolen: 'Stolen',
    damaged: 'Damaged',
    name_change: 'Name change',
  };
  const reason = String(payload.reason);
  return {
    status: 'accepted',
    confirmationNumber: `DUP-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: `Duplicate license ordered for ${mdl.documentNumber} (${reasonLabels[reason] || reason}).`,
    reason: reasonLabels[reason] || reason,
    feeAmount: 20,
    estimatedCompletionDays: 10,
    linkedDocumentId: mdl.documentId,
  };
}

function mockDmvDrivingRecord(payload, mdl) {
  const types = {
    standard: 'Standard (3-year)',
    complete: 'Complete (full history)',
    insurance: 'Insurance abstract',
  };
  const recordType = String(payload.recordType);
  return {
    status: 'accepted',
    confirmationNumber: `REC-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: `${types[recordType] || 'Driving record'} ordered for license ${mdl.documentNumber}.`,
    recordType: types[recordType] || recordType,
    points: recordType === 'complete' ? 2 : 0,
    feeAmount: recordType === 'complete' ? 22 : 12,
    estimatedCompletionDays: 3,
    deliveryMethod: 'Secure download link (email)',
    linkedDocumentId: mdl.documentId,
  };
}

function mockDmvRealId(payload, mdl) {
  const when = appointmentWhen(payload);
  const place = appointmentPlace(payload);
  return {
    status: 'accepted',
    confirmationNumber: `RID-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: `REAL ID appointment for ${mdl.documentNumber} on ${when} at ${place.officeLocation}.`,
    appointmentWindow: `${when} · 9:00–11:30 AM`,
    estimatedCompletionDays: 21,
    feeAmount: 30,
    documentsNeeded: 'Passport or birth certificate + two proofs of address',
    linkedDocumentId: mdl.documentId,
    reason: payload.serviceType,
    ...place,
  };
}

function mockIrsMakePayment(payload) {
  const amount = Number(payload.amount);
  const year = Number(payload.taxYear);
  const methods = { bank: 'Bank account (ACH)', debit: 'Debit card', credit: 'Credit card' };
  const types = {
    balance: 'Balance due',
    estimated: 'Estimated tax',
    extension: 'Extension payment',
  };
  const method = String(payload.paymentMethod);
  const paymentType = String(payload.paymentType);
  return {
    status: 'accepted',
    confirmationNumber: `PAY-${uuidv4().slice(0, 8).toUpperCase()}`,
    taxYear: year,
    paymentMethod: methods[method] || method,
    paymentAmount: amount,
    paymentDate: new Date().toISOString().slice(0, 10),
    filingType: types[paymentType] || paymentType,
    message: `Payment of $${amount.toFixed(2)} submitted via ${methods[method] || method}.`,
    feeAmount: method === 'bank' ? 0 : Number((amount * 0.0199).toFixed(2)),
  };
}

function mockIrsRefund(payload) {
  const year = Number(payload.taxYear);
  if (year < 2018 || year > new Date().getFullYear()) {
    return {
      status: 'rejected',
      taxYear: year,
      statusLabel: 'Unavailable',
      message: `Tax year ${year} is outside the supported range.`,
      refundAmountEstimate: null,
      estimatedDepositDate: null,
    };
  }
  const statuses = ['received', 'processing', 'approved', 'sent'];
  const labels = {
    received: 'Return received',
    processing: 'Processing — typically within 21 days of e-file',
    approved: 'Refund approved',
    sent: 'Refund sent',
  };
  const pick = statuses[Math.abs(year) % statuses.length];
  const amount = pick === 'approved' || pick === 'sent' ? 1240.55 : null;
  let estimatedDepositDate = null;
  if (pick === 'approved' || pick === 'sent') {
    estimatedDepositDate = daysFromNow(pick === 'sent' ? 0 : 7);
  }
  const filingLabels = {
    single: 'Single',
    mfj: 'Married filing jointly',
    hoh: 'Head of household',
  };
  return {
    status: pick,
    taxYear: year,
    statusLabel: labels[pick],
    message: `Where’s My Refund — tax year ${year}: ${labels[pick]}.`,
    refundAmountEstimate: amount,
    estimatedDepositDate,
    filingType: 'Form 1040',
    reason: filingLabels[payload.filingStatus] || payload.filingStatus,
  };
}

function mockIrsTranscript(payload) {
  const year = Number(payload.taxYear);
  const labels = {
    wage: 'Wage & Income',
    account: 'Tax Account',
    return: 'Tax return transcript (4506-T)',
    record: 'Record of Account',
  };
  const transcriptType = String(payload.transcriptType);
  const delivery = payload.delivery === 'mail' ? 'Mail to address on file' : 'Online PDF';
  return {
    status: 'accepted',
    confirmationNumber: `TXP-${uuidv4().slice(0, 8).toUpperCase()}`,
    taxYear: year,
    transcriptType: labels[transcriptType] || transcriptType,
    message: `Get Your Tax Record: ${labels[transcriptType] || 'transcript'} for ${year} requested.`,
    estimatedCompletionDays: payload.delivery === 'mail' ? 10 : 1,
    deliveryMethod: delivery,
  };
}

function mockIrsPaymentPlan(payload) {
  const balance = Number(payload.balanceDue);
  const monthly = Number(payload.monthlyPayment);
  const year = Number(payload.taxYear);
  if (monthly > balance) {
    return {
      status: 'rejected',
      message: 'Monthly payment cannot exceed the balance due.',
      confirmationNumber: null,
    };
  }
  const months = Math.ceil(balance / monthly);
  return {
    status: 'accepted',
    confirmationNumber: `IA-${uuidv4().slice(0, 8).toUpperCase()}`,
    taxYear: year,
    balanceDue: balance,
    monthlyPayment: monthly,
    estimatedMonths: months,
    firstPaymentDue: daysFromNow(30),
    message: `Installment agreement set up: $${monthly.toFixed(2)}/mo for ~${months} months.`,
    feeAmount: 31,
  };
}

function mockIrsEstimatedTax(payload) {
  const amount = Number(payload.amount);
  const year = Number(payload.taxYear);
  const quarter = String(payload.quarter);
  return {
    status: 'accepted',
    confirmationNumber: `ES-${uuidv4().slice(0, 8).toUpperCase()}`,
    taxYear: year,
    quarter,
    paymentAmount: amount,
    message: `Estimated tax payment of $${amount.toFixed(2)} recorded for ${year} ${quarter}.`,
    paymentDate: new Date().toISOString().slice(0, 10),
    filingType: 'Form 1040-ES',
  };
}

function mockIrsAmendStatus(payload) {
  const year = Number(payload.taxYear);
  const statuses = ['received', 'processing', 'approved'];
  const labels = {
    received: 'Amended return received',
    processing: 'Under review',
    approved: 'Adjustment complete',
  };
  const reasonLabels = {
    income: 'Correct income',
    credits: 'Credits / deductions',
    filing_status: 'Filing status',
    other: 'Other',
  };
  const pick = statuses[Math.abs(year + 1) % statuses.length];
  return {
    status: pick,
    taxYear: year,
    statusLabel: labels[pick],
    message: `1040-X status for ${year}: ${labels[pick]}.`,
    filingType: 'Form 1040-X',
    reason: reasonLabels[payload.reason] || payload.reason,
    estimatedCompletionDays: pick === 'approved' ? 0 : 16,
  };
}

function mockIrsFormW9(payload) {
  const classes = {
    individual: 'Individual / sole proprietor',
    llc: 'LLC',
    corporation: 'C Corporation',
    s_corp: 'S Corporation',
    partnership: 'Partnership',
  };
  return {
    status: 'accepted',
    confirmationNumber: `W9-${uuidv4().slice(0, 8).toUpperCase()}`,
    filingType: 'Form W-9',
    message: `Form W-9 prepared for ${payload.name}. Share the PDF with the requester; TIN is not stored in this prototype.`,
    mailingAddress: String(payload.address),
    reason: classes[payload.taxClassification] || payload.taxClassification,
  };
}

function mockIrsFormW4(payload) {
  const filingLabels = {
    single: 'Single or married filing separately',
    mfj: 'Married filing jointly',
    hoh: 'Head of household',
  };
  return {
    status: 'accepted',
    confirmationNumber: `W4-${uuidv4().slice(0, 8).toUpperCase()}`,
    filingType: 'Form W-4',
    message: 'Form W-4 withholding certificate completed. Give a copy to your employer.',
    reason: filingLabels[payload.filingStatus] || payload.filingStatus,
    paymentAmount: Number(payload.dependentsAmount) || 0,
  };
}

function mockUnemployment(payload, mdl) {
  const wage = Number(payload.priorWeeklyWage);
  const reasonLabels = {
    laid_off: 'Laid off',
    hours_reduced: 'Hours reduced',
    fired: 'Discharged',
    quit: 'Quit',
    other: 'Other',
  };
  const reason = String(payload.reason);
  return {
    status: 'submitted',
    confirmationNumber: `UI-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: `Application submitted using mDL ${mdl.documentNumber}. Under review.`,
    weeklyBenefitEstimate: Math.min(500, Math.round(wage * 0.5)),
    reason: reasonLabels[reason] || reason,
    linkedDocumentId: mdl.documentId,
    claimId: `CLM-${uuidv4().slice(0, 8).toUpperCase()}`,
  };
}

function mockUnemploymentWeekly(payload, mdl) {
  const hours = Number(payload.hoursWorked);
  const contacts = Number(payload.jobContacts);
  const able = payload.ableAndAvailable !== 'no';
  if (!able) {
    return {
      status: 'rejected',
      confirmationNumber: `WC-${uuidv4().slice(0, 8).toUpperCase()}`,
      message: 'Weekly certification not payable — you indicated you are not able/available for work.',
      hoursWorked: hours,
      jobContacts: contacts,
      linkedDocumentId: mdl.documentId,
    };
  }
  const payable = hours < 32;
  return {
    status: payable ? 'accepted' : 'rejected',
    confirmationNumber: `WC-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: payable
      ? `Weekly certification accepted. Payment scheduled for week ending ${daysFromNow(2)}.`
      : 'Too many hours worked this week for a full benefit payment.',
    hoursWorked: hours,
    jobContacts: contacts,
    paymentAmount: payable ? Math.max(0, 280 - hours * 8) : 0,
    weekEnding: daysFromNow(2),
    linkedDocumentId: mdl.documentId,
  };
}

function mockUnemploymentClaimStatus(payload, mdl) {
  return {
    status: 'approved',
    statusLabel: 'Active claim',
    confirmationNumber: `ST-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: `Claim linked to mDL ${mdl.documentNumber} is active. Continue weekly certifications.`,
    claimId: `CLM-${String(mdl.documentNumber || 'X').slice(-6).toUpperCase()}`,
    benefitYearEnd: daysFromNow(300),
    weeksRemaining: 18,
    weeklyBenefitEstimate: 280,
    linkedDocumentId: mdl.documentId,
  };
}

function mockUnemploymentAppeal(payload, mdl) {
  return {
    status: 'submitted',
    confirmationNumber: `APL-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: `Appeal filed for notice ${payload.determinationId}.`,
    determinationId: String(payload.determinationId),
    appealReason: String(payload.appealReason),
    appealDeadline: daysFromNow(21),
    hearingWindow: 'Telehearing within 30–45 days',
    linkedDocumentId: mdl.documentId,
  };
}

function mockUnemploymentPaymentMethod(payload, mdl) {
  const method = String(payload.method);
  const label = method === 'debit_card' ? 'State debit card' : 'Direct deposit';
  return {
    status: 'accepted',
    confirmationNumber: `PAY-${uuidv4().slice(0, 8).toUpperCase()}`,
    message: `Payment method updated to ${label}.`,
    paymentMethod: label,
    effectiveDate: daysFromNow(3),
    linkedDocumentId: mdl.documentId,
  };
}

module.exports = {
  listCatalog,
  listRequests,
  getRequest,
  submitRequest,
  CATALOG,
};
