'use strict';

const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { uuidv4 } = require('../utils/ids');

function usePostgres() {
  return config.storageDriver === 'postgres';
}

function jsonPath() {
  return path.join(__dirname, '../../data/sms_otps.json');
}

function readJson() {
  const fp = jsonPath();
  if (!fs.existsSync(fp)) return [];
  const raw = fs.readFileSync(fp, 'utf8');
  return raw.trim() ? JSON.parse(raw) : [];
}

function writeJson(items) {
  const dir = path.dirname(jsonPath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${jsonPath()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, jsonPath());
}

async function createChallenge({ phoneE164, codeHash, expiresAt, maxAttempts }) {
  const row = {
    id: uuidv4(),
    phoneE164,
    codeHash,
    attempts: 0,
    maxAttempts: maxAttempts || 5,
    expiresAt,
    consumedAt: null,
    createdAt: new Date().toISOString(),
  };

  if (usePostgres()) {
    const { query } = require('../repositories/pgPool');
    await query(
      `INSERT INTO sms_otps
        (id, phone_e164, code_hash, attempts, max_attempts, expires_at, consumed_at, created_at)
       VALUES ($1,$2,$3,0,$4,$5,NULL,NOW())`,
      [row.id, phoneE164, codeHash, row.maxAttempts, expiresAt]
    );
    return row;
  }

  const items = readJson();
  items.push(row);
  writeJson(items);
  return row;
}

async function findLatestActive(phoneE164) {
  if (usePostgres()) {
    const { query } = require('../repositories/pgPool');
    const { rows } = await query(
      `SELECT id, phone_e164 AS "phoneE164", code_hash AS "codeHash",
              attempts, max_attempts AS "maxAttempts",
              expires_at AS "expiresAt", consumed_at AS "consumedAt",
              created_at AS "createdAt"
       FROM sms_otps
       WHERE phone_e164 = $1 AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [phoneE164]
    );
    return rows[0] || null;
  }

  const items = readJson()
    .filter((x) => x.phoneE164 === phoneE164 && !x.consumedAt)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return items[0] || null;
}

async function incrementAttempts(id) {
  if (usePostgres()) {
    const { query } = require('../repositories/pgPool');
    await query(`UPDATE sms_otps SET attempts = attempts + 1 WHERE id = $1`, [id]);
    return;
  }
  const items = readJson();
  const idx = items.findIndex((x) => x.id === id);
  if (idx >= 0) {
    items[idx].attempts += 1;
    writeJson(items);
  }
}

async function consume(id) {
  if (usePostgres()) {
    const { query } = require('../repositories/pgPool');
    await query(`UPDATE sms_otps SET consumed_at = NOW() WHERE id = $1`, [id]);
    return;
  }
  const items = readJson();
  const idx = items.findIndex((x) => x.id === id);
  if (idx >= 0) {
    items[idx].consumedAt = new Date().toISOString();
    writeJson(items);
  }
}

module.exports = {
  createChallenge,
  findLatestActive,
  incrementAttempts,
  consume,
};
