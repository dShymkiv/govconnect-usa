'use strict';

/**
 * Storage facade — JSON dumps (default/local) or PostgreSQL (Docker).
 * All methods are async so callers stay driver-agnostic.
 */

const { config } = require('../config');
const json = require('./jsonStore');

function usePostgres() {
  return config.storageDriver === 'postgres';
}

function getPg() {
  return require('./pgStore');
}

async function readCollection(name) {
  if (usePostgres()) return getPg().readCollection(name);
  return json.readCollection(name);
}

async function writeCollection(name, items) {
  if (usePostgres()) return getPg().writeCollection(name, items);
  return json.writeCollection(name, items);
}

async function findById(name, id) {
  if (usePostgres()) return getPg().findById(name, id);
  return json.findById(name, id);
}

async function findWhere(name, predicate) {
  if (usePostgres()) return getPg().findWhere(name, predicate);
  return json.findWhere(name, predicate);
}

async function upsert(name, item) {
  if (usePostgres()) return getPg().upsert(name, item);
  return json.upsert(name, item);
}

async function removeById(name, id) {
  if (usePostgres()) return getPg().removeById(name, id);
  return json.removeById(name, id);
}

module.exports = {
  readCollection,
  writeCollection,
  findById,
  findWhere,
  upsert,
  removeById,
  usePostgres,
  DATA_DIR: json.DATA_DIR,
};
