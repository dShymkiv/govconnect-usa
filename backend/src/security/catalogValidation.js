'use strict';

/**
 * Enforce catalog field requirements for agency / document-request payloads.
 * Rejects missing/blank required values and invalid enums before mock adapters run.
 */

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

function fieldIsRequired(field, payload) {
  if (field.required === true) return true;
  const when = field.requiredWhen;
  if (!when || typeof when !== 'object') return false;
  return Object.entries(when).every(([depKey, allowed]) => {
    const current = String(payload?.[depKey] ?? '');
    const list = Array.isArray(allowed) ? allowed.map(String) : [String(allowed)];
    return list.includes(current);
  });
}

function assertCatalogPayload(fields, payload, { label = 'request' } = {}) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const missing = [];
  const invalid = [];

  for (const field of fields || []) {
    if (!field?.key) continue;
    const value = p[field.key];
    const required = fieldIsRequired(field, p);

    if (required && isBlank(value)) {
      missing.push(field.key);
      continue;
    }
    if (isBlank(value)) continue;

    if (field.options?.length) {
      const allowed = new Set(field.options.map((o) => String(o.value)));
      if (!allowed.has(String(value))) {
        invalid.push(`${field.key} (invalid option)`);
      }
    }

    if (field.type === 'number' || field.type === 'walletDocument') {
      // walletDocument ids are strings; skip numeric check
    }

    if (field.type === 'number') {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        invalid.push(`${field.key} (must be a number)`);
        continue;
      }
      if (field.min != null && n < Number(field.min)) {
        invalid.push(`${field.key} (min ${field.min})`);
      }
      if (field.max != null && n > Number(field.max)) {
        invalid.push(`${field.key} (max ${field.max})`);
      }
      if (field.positive === true && !(n > 0)) {
        invalid.push(`${field.key} (must be greater than 0)`);
      }
      if (field.nonNegative === true && n < 0) {
        invalid.push(`${field.key} (must be ≥ 0)`);
      }
    }

    if (field.type === 'date') {
      const s = String(value).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
        invalid.push(`${field.key} (invalid date)`);
      }
    }

    if (field.pattern) {
      const re = new RegExp(field.pattern);
      if (!re.test(String(value))) {
        invalid.push(`${field.key} (format)`);
      }
    }
  }

  if (missing.length || invalid.length) {
    const parts = [];
    if (missing.length) parts.push(`Missing required fields: ${missing.join(', ')}`);
    if (invalid.length) parts.push(`Invalid fields: ${invalid.join(', ')}`);
    const err = new Error(`${parts.join('. ')} (${label})`);
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.details = { missing, invalid };
    throw err;
  }

  return p;
}

module.exports = {
  assertCatalogPayload,
  fieldIsRequired,
  isBlank,
};
