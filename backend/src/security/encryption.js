'use strict';

/**
 * Field-level encryption for PII at rest (JSON dumps / future DB columns).
 * Algorithm: AES-256-GCM (authenticated encryption — confidentiality + integrity).
 *
 * Ciphertext format: enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
 * Aligns with proposal: encryption at rest + privacy-by-design (minimize plaintext PII).
 */

const crypto = require('crypto');
const { config } = require('../config');

const PREFIX = 'enc:v1:';

function getKey() {
  const hex = config.dataEncryptionKey;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('DATA_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return plaintext;
  const text = String(plaintext);
  if (text.startsWith(PREFIX)) return text;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    'enc:v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

function decrypt(payload) {
  if (payload === null || payload === undefined) return payload;
  const text = String(payload);
  if (!text.startsWith(PREFIX)) return text;

  const parts = text.split(':');
  // enc : v1 : iv : tag : ciphertext
  if (parts.length !== 5) {
    throw new Error('Invalid encrypted payload format');
  }

  const iv = Buffer.from(parts[2], 'base64url');
  const tag = Buffer.from(parts[3], 'base64url');
  const data = Buffer.from(parts[4], 'base64url');

  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

function encryptFields(obj, fields) {
  const out = { ...obj };
  for (const field of fields) {
    if (out[field] !== undefined && out[field] !== null) {
      out[field] = encrypt(out[field]);
    }
  }
  return out;
}

function decryptFields(obj, fields) {
  const out = { ...obj };
  for (const field of fields) {
    if (out[field] !== undefined && out[field] !== null) {
      out[field] = decrypt(out[field]);
    }
  }
  return out;
}

module.exports = { encrypt, decrypt, encryptFields, decryptFields };
