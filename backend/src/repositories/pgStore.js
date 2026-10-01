'use strict';

const { query, withTransaction } = require('./pgPool');

const TABLE_MAP = {
  users: 'users',
  documents: 'documents',
  refresh_tokens: 'refresh_tokens',
  qr_verifications: 'qr_verifications',
  agency_applications: 'agency_applications',
  document_requests: 'document_requests',
  vehicle_fines: 'vehicle_fines',
};

function tableFor(name) {
  const table = TABLE_MAP[name];
  if (!table) throw new Error(`Unknown collection: ${name}`);
  return table;
}

function rowToItem(row) {
  return { ...row.payload, id: row.id };
}

async function readCollection(name) {
  const { rows } = await query(
    `SELECT id, payload FROM ${tableFor(name)} ORDER BY created_at ASC NULLS LAST`
  );
  return rows.map(rowToItem);
}

async function writeCollection(name, items) {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM ${tableFor(name)}`);
    for (const item of items) {
      const { id, ...rest } = item;
      await client.query(
        `INSERT INTO ${tableFor(name)} (id, payload, created_at, updated_at)
         VALUES ($1, $2::jsonb, NOW(), NOW())`,
        [id, JSON.stringify({ ...rest, id })]
      );
    }
  });
}

async function findById(name, id) {
  const { rows } = await query(
    `SELECT id, payload FROM ${tableFor(name)} WHERE id = $1 LIMIT 1`,
    [id]
  );
  if (!rows[0]) return null;
  return rowToItem(rows[0]);
}

async function findWhere(name, predicate) {
  const items = await readCollection(name);
  return items.filter(predicate);
}

async function upsert(name, item) {
  const { id, ...rest } = item;
  const payload = JSON.stringify({ ...rest, id });
  await query(
    `INSERT INTO ${tableFor(name)} (id, payload, created_at, updated_at)
     VALUES ($1, $2::jsonb, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE
       SET payload = EXCLUDED.payload,
           updated_at = NOW()`,
    [id, payload]
  );
  return item;
}

async function removeById(name, id) {
  await query(`DELETE FROM ${tableFor(name)} WHERE id = $1`, [id]);
}

async function insertAuditEvent(entry) {
  await query(
    `INSERT INTO audit_events
       (id, ts, action, user_id, resource, outcome, ip, request_id, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      entry.id,
      entry.ts,
      entry.action,
      entry.userId,
      entry.resource,
      entry.outcome,
      entry.ip,
      entry.requestId,
      JSON.stringify(entry.meta || {}),
    ]
  );
}

module.exports = {
  readCollection,
  writeCollection,
  findById,
  findWhere,
  upsert,
  removeById,
  insertAuditEvent,
};
