'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { config } = require('../src/config');

async function migrate() {
  if (config.storageDriver !== 'postgres') {
    console.log('STORAGE_DRIVER is not postgres — skip migrate.');
    return;
  }

  const { getPool, query, closePool } = require('../src/repositories/pgPool');
  getPool();

  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const dir = path.join(__dirname, '../migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await query(`SELECT 1 FROM schema_migrations WHERE id = $1`, [file]);
    if (rows.length) {
      console.log('Migration already applied:', file);
      continue;
    }

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await query('BEGIN');
    try {
      await query(sql);
      await query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [file]);
      await query('COMMIT');
      console.log('Migration applied:', file);
    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }
  }

  await closePool();
}

migrate().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
