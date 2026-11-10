'use strict';

/** JSON-file repository used when STORAGE_DRIVER=json (tests / offline demos). */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.GC_DATA_DIR
  ? path.resolve(process.env.GC_DATA_DIR)
  : path.join(__dirname, '../../data');

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readCollection(name) {
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return [];
  const raw = fs.readFileSync(fp, 'utf8');
  if (!raw.trim()) return [];
  return JSON.parse(raw);
}

function writeCollection(name, items) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  // Atomic-ish write: temp + rename reduces partial-write risk
  const fp = filePath(name);
  const tmp = `${fp}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, fp);
}

function findById(name, id) {
  return readCollection(name).find((item) => item.id === id) || null;
}

function findWhere(name, predicate) {
  return readCollection(name).filter(predicate);
}

function upsert(name, item) {
  const items = readCollection(name);
  const idx = items.findIndex((x) => x.id === item.id);
  if (idx >= 0) items[idx] = item;
  else items.push(item);
  writeCollection(name, items);
  return item;
}

function removeById(name, id) {
  const items = readCollection(name).filter((x) => x.id !== id);
  writeCollection(name, items);
}

module.exports = {
  readCollection,
  writeCollection,
  findById,
  findWhere,
  upsert,
  removeById,
  DATA_DIR,
};
