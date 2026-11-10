'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { uuidv4 } = require('../utils/ids');
const { config } = require('../config');

const AUDIT_PATH = path.join(
  process.env.GC_DATA_DIR
    ? path.resolve(process.env.GC_DATA_DIR)
    : path.join(__dirname, '../../data'),
  'audit-log.jsonl'
);

function ensureFile() {
  const dir = path.dirname(AUDIT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(AUDIT_PATH)) fs.writeFileSync(AUDIT_PATH, '', 'utf8');
}

function integrityHash(record) {
  const body = JSON.stringify({
    id: record.id,
    ts: record.ts,
    action: record.action,
    userId: record.userId,
    resource: record.resource,
    outcome: record.outcome,
    ip: record.ip,
    requestId: record.requestId,
    meta: record.meta,
  });
  return crypto.createHmac('sha256', config.jwtAccessSecret).update(body).digest('hex');
}

function audit(entry) {
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
  record.integrity = integrityHash(record);

  ensureFile();
  fs.appendFileSync(AUDIT_PATH, `${JSON.stringify(record)}\n`, 'utf8');

  if (config.storageDriver === 'postgres') {
    // Fire-and-forget DB write; JSONL remains the durable local fallback.
    Promise.resolve()
      .then(async () => {
        const { insertAuditEvent } = require('../repositories/pgStore');
        await insertAuditEvent(record);
      })
      .catch(() => {
        // Avoid breaking request path if audit DB insert fails.
      });
  }

  return record;
}

function listRecentAudit({ userId = null, limit = 25 } = {}) {
  ensureFile();
  const raw = fs.readFileSync(AUDIT_PATH, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  const out = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i -= 1) {
    try {
      const rec = JSON.parse(lines[i]);
      if (userId && rec.userId !== userId) continue;
      out.push({
        id: rec.id,
        ts: rec.ts,
        action: rec.action,
        outcome: rec.outcome,
        resource: rec.resource,
        integrityPreview: rec.integrity ? `${String(rec.integrity).slice(0, 16)}…` : null,
        meta: sanitizeAuditMeta(rec.meta),
      });
    } catch {
      // skip malformed lines
    }
  }
  return out;
}

function sanitizeAuditMeta(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const blocked = new Set(['code', 'password', 'token', 'ssn', 'fullSsn']);
  const clean = {};
  for (const [k, v] of Object.entries(meta)) {
    if (blocked.has(k)) continue;
    if (v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      clean[k] = v;
    } else {
      clean[k] = '[omitted]';
    }
  }
  return clean;
}

module.exports = { audit, integrityHash, listRecentAudit };
