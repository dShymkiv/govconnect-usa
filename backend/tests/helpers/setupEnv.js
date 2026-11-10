'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'govconnect-test-'));

process.env.NODE_ENV = 'test';
process.env.STORAGE_DRIVER = 'json';
process.env.SMS_PROVIDER = 'mock';
process.env.OTP_DEV_RETURN_CODE = 'true';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '0';
process.env.GC_DATA_DIR = dataDir;
process.env.DATA_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.JWT_ACCESS_SECRET = crypto.randomBytes(40).toString('hex');
process.env.JWT_REFRESH_SECRET = crypto.randomBytes(40).toString('hex');
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.RATE_LIMIT_MAX = '10000';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.TWILIO_ACCOUNT_SID = '';
process.env.TWILIO_AUTH_TOKEN = '';
process.env.TWILIO_FROM_NUMBER = '';
process.env.TWILIO_VERIFY_SERVICE_SID = '';

module.exports = { dataDir };
