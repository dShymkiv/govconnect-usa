'use strict';

const { config } = require('../config');
const { audit } = require('../security/audit');

let twilioClient = null;

function getTwilioClient() {
  if (!twilioClient) {
    const twilio = require('twilio');
    twilioClient = twilio(config.sms.twilioAccountSid, config.sms.twilioAuthToken);
  }
  return twilioClient;
}

function twilioCredentialsReady() {
  return Boolean(config.sms.twilioAccountSid && config.sms.twilioAuthToken);
}

function resolveProvider() {
  const pref = (config.sms.provider || 'auto').toLowerCase();
  const ready = twilioCredentialsReady();
  const hasVerify = Boolean(config.sms.twilioVerifyServiceSid);
  const hasFrom = Boolean(config.sms.twilioFromNumber);

  if (pref === 'mock') return 'mock';
  if (pref === 'twilio' || pref === 'twilio-verify' || pref === 'twilio-messages') {
    if (!ready) {
      const err = new Error('Twilio credentials missing (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)');
      err.status = 500;
      err.code = 'SMS_CONFIG_ERROR';
      throw err;
    }
    if (pref === 'twilio-messages') {
      if (!hasFrom) {
        const err = new Error('TWILIO_FROM_NUMBER required for Messages API');
        err.status = 500;
        err.code = 'SMS_CONFIG_ERROR';
        throw err;
      }
      return 'twilio-messages';
    }
    if (hasVerify) return 'twilio-verify';
    if (hasFrom) return 'twilio-messages';
    const err = new Error('Set TWILIO_VERIFY_SERVICE_SID (recommended) or TWILIO_FROM_NUMBER');
    err.status = 500;
    err.code = 'SMS_CONFIG_ERROR';
    throw err;
  }

  if (!ready) return 'mock';
  if (hasVerify) return 'twilio-verify';
  if (hasFrom) return 'twilio-messages';
  return 'mock';
}

async function sendOtp({ to, code, body, meta = {} }) {
  const provider = resolveProvider();

  if (provider === 'twilio-verify') {
    try {
      const verification = await getTwilioClient()
        .verify.v2.services(config.sms.twilioVerifyServiceSid)
        .verifications.create({ to, channel: 'sms' });

      audit({
        action: 'SMS_SENT',
        outcome: 'success',
        meta: {
          toLast4: String(to).slice(-4),
          provider,
          status: verification.status,
          sid: verification.sid,
          ...meta,
        },
      });

      return { provider, accepted: true, managedByTwilio: true, sid: verification.sid };
    } catch (err) {
      audit({
        action: 'SMS_SENT',
        outcome: 'failure',
        meta: { toLast4: String(to).slice(-4), provider, error: err.message, ...meta },
      });
      const wrapped = new Error(err.message || 'Failed to send SMS verification code');
      wrapped.status = 502;
      wrapped.code = 'SMS_SEND_FAILED';
      wrapped.cause = err;
      throw wrapped;
    }
  }

  if (provider === 'twilio-messages') {
    if (config.sms.twilioTrialTemplates) {
      const err = new Error(
        'Twilio trial cannot send custom OTP via Messages API. Set TWILIO_VERIFY_SERVICE_SID (Verify → Services) or upgrade the account / set TWILIO_TRIAL_TEMPLATES=false.'
      );
      err.status = 502;
      err.code = 'SMS_TRIAL_NEEDS_VERIFY';
      throw err;
    }

    const messageBody = body || `GovConnect USA code: ${code}. Do not share.`;

    try {
      const message = await getTwilioClient().messages.create({
        to,
        from: config.sms.twilioFromNumber,
        body: messageBody,
      });

      audit({
        action: 'SMS_SENT',
        outcome: 'success',
        meta: {
          toLast4: String(to).slice(-4),
          provider,
          sid: message.sid,
          ...meta,
        },
      });

      return {
        provider,
        accepted: true,
        managedByTwilio: false,
        sid: message.sid,
        codeDeliverable: true,
      };
    } catch (err) {
      audit({
        action: 'SMS_SENT',
        outcome: 'failure',
        meta: { toLast4: String(to).slice(-4), provider, error: err.message, ...meta },
      });
      const wrapped = new Error(err.message || 'Failed to send SMS verification code');
      wrapped.status = 502;
      wrapped.code = 'SMS_SEND_FAILED';
      wrapped.cause = err;
      throw wrapped;
    }
  }

  // mock
  // eslint-disable-next-line no-console
  console.log(`[mock-sms] to=${to} body="${body || code}"`);
  audit({
    action: 'SMS_SENT',
    outcome: 'success',
    meta: { toLast4: String(to).slice(-4), provider: 'mock', ...meta },
  });
  return { provider: 'mock', accepted: true, managedByTwilio: false, codeDeliverable: true };
}

async function checkTwilioVerify({ to, code }) {
  const check = await getTwilioClient()
    .verify.v2.services(config.sms.twilioVerifyServiceSid)
    .verificationChecks.create({ to, code: String(code).trim() });

  return check.status === 'approved';
}

function isTwilioActive() {
  try {
    const p = resolveProvider();
    return p === 'twilio-verify' || p === 'twilio-messages';
  } catch {
    return false;
  }
}

async function sendSms(opts) {
  return sendOtp(opts);
}

module.exports = {
  sendOtp,
  sendSms,
  checkTwilioVerify,
  isTwilioActive,
  resolveProvider,
};
