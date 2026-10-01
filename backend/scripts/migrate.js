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

  const dir = path.join(__dirname, '../migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sqlPath = path.join(dir, file);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await query(sql);
    console.log('Migration applied:', file);
  }

  await closePool();
}

migrate().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
