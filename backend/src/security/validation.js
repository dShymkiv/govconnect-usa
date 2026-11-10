'use strict';

const { z } = require('zod');

const uuid = z.string().uuid();
const presentationCode = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid presentation code format');

const phoneE164Like = z
  .string()
  .min(10)
  .max(20)
  .regex(/^[+\d][\d\s()-]{8,18}$/, 'Invalid phone format');

const otpCode = z
  .string()
  .min(4)
  .max(8)
  .regex(/^\d+$/, 'OTP must be numeric');

const serviceCategory = z.enum(['dmv', 'irs', 'unemployment']).optional();

const serviceId = z.enum([
  'dmv-schedule-appointment',
  'dmv-schedule-cdl',
  'dmv-manage-appointment',
  'dmv-real-id-upgrade',
  'dmv-license-renewal',
  'dmv-teen-to-dl',
  'dmv-new-license',
  'dmv-duplicate-license',
  'dmv-address-change',
  'dmv-cdl-written',
  'dmv-cdl-drive',
  'vehicle-reg-renewal',
  'dmv-informal-hearing',
  'dmv-driving-record',
  'irs-make-payment',
  'irs-refund-status',
  'irs-transcript-request',
  'irs-payment-plan',
  'irs-estimated-tax',
  'irs-amend-status',
  'irs-form-w9',
  'irs-form-w4',
  'unemployment-application',
  'unemployment-weekly-cert',
  'unemployment-claim-status',
  'unemployment-appeal',
  'unemployment-payment-method',
]);

const requestTypeId = z.enum([
  'criminal-record-certificate',
  'marriage-license',
  'irs-ss4',
  'passport-renewal-copy',
  'student-id-issue',
]);

const fineStatus = z.enum(['unpaid', 'paid', 'dismissed']).optional();

/** Safe JSON object: limited size / depth for agency payloads. */
const safePayload = z
  .record(z.union([z.string().max(500), z.number(), z.boolean(), z.null()]))
  .optional()
  .default({});

function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const err = new Error(result.error.issues.map((i) => i.message).join('; '));
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  return result.data;
}

function zodToHttpError(err) {
  if (err?.name !== 'ZodError') return err;
  err.status = 400;
  err.code = 'VALIDATION_ERROR';
  err.message = err.issues.map((e) => e.message).join('; ');
  return err;
}

module.exports = {
  z,
  uuid,
  presentationCode,
  phoneE164Like,
  otpCode,
  serviceCategory,
  serviceId,
  requestTypeId,
  fineStatus,
  safePayload,
  parseOrThrow,
  zodToHttpError,
};
