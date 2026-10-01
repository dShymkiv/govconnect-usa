'use strict';

/**
 * Append-only audit log for security-relevant events.
 * Stored as JSON lines for now; swap to immutable store / SIEM later.
 *
 * CCPA / privacy note: log event metadata, avoid unnecessary PII.
 * Prefer userId + hashed/redacted identifiers over raw SSN, full address, etc.
 */

const fs = require('fs');
const path = require('path');
const { uuidv4 } = require('../utils/ids');

const AUDIT_PATH = path.join(__dirname, '../../data/audit-log.jsonl');

function ensureFile() {
  const dir = path.dirname(AUDIT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(AUDIT_PATH)) fs.writeFileSync(AUDIT_PATH, '', 'utf8');
}

/**
 * @param {object} entry
 * @param {string} entry.action - e.g. AUTH_LOGIN_SUCCESS, WALLET_VIEW, SERVICE_SUBMIT
 * @param {string} [entry.userId]
 * @param {string} [entry.resource]
 * @param {string} [entry.outcome] - success | failure | denied
 * @param {object} [entry.meta] - non-sensitive context only
 * @param {string} [entry.ip]
 * @param {string} [entry.requestId]
 */
function audit(entry) {
  ensureFile();
  const record = {
    id: uuidv4(),
    ts: new Date().toISOString(),
    action: entry.action,
    userId: entry.userId || null,
    resource: entry.resource || null,
    outcome: entry.outcome || 'success',
    ip: entry.ip || null,
    requestId: entry.requestId || null,
    meta: entry.meta || {},
  };
  fs.appendFileSync(AUDIT_PATH, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

module.exports = { audit };
