// utils/credentialVault.js
// Minimal AES-256-GCM credential vault.
//
// Stores third-party API secrets encrypted at rest. Symmetric authenticated
// encryption (GCM) so any tampering of the ciphertext is detected at decrypt.
//
// Key: env CREDENTIAL_VAULT_KEY = 64 hex chars (32 bytes / 256 bits).
//   - production  : missing/invalid key => HARD boot failure (validateCredentialVaultKey throws)
//   - non-prod    : missing/invalid key => warning (vault disabled, callers fall back per policy)
//   - test        : a fake 64-hex key is injected by tests/setup/testEnv.js
//
// Storage format: "ivB64.authTagB64.ciphertextB64" (separator '.' is outside base64).
//
// SECURITY: never log a decrypted value; only slug/role/generic messages elsewhere.

import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce recommended for GCM
const KEY_ENV = 'CREDENTIAL_VAULT_KEY';
const SENTINEL_PREFIX = '__UNFILLED';

function readKeyHex() {
  return String(process.env[KEY_ENV] || '').trim();
}

function isValidKeyHex(hex) {
  return /^[0-9a-fA-F]{64}$/.test(hex);
}

/**
 * Validate the vault key at boot.
 * @returns {boolean} true if a valid key is present.
 * @throws {Error} in production when the key is absent/invalid (blocking boot).
 */
export function validateCredentialVaultKey() {
  const hex = readKeyHex();
  if (isValidKeyHex(hex)) {
    console.log('[credentialVault] CREDENTIAL_VAULT_KEY present and valid.');
    return true;
  }
  const msg = `${KEY_ENV} is missing or not a 64-char hex string (32 bytes).`;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`[credentialVault] ${msg} Refusing to boot in production.`);
  }
  console.warn(`[credentialVault] ${msg} Vault disabled until configured (non-production).`);
  return false;
}

function getKeyBuffer() {
  const hex = readKeyHex();
  if (!isValidKeyHex(hex)) {
    throw new Error(`[credentialVault] ${KEY_ENV} missing or invalid (need 64 hex chars).`);
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a plaintext credential.
 * @param {string} value
 * @returns {string} "iv.authTag.ciphertext" (base64 segments)
 */
export function encryptCredential(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('[credentialVault] encryptCredential expects a non-empty string.');
  }
  const key = getKeyBuffer();
  const iv = crypto.randomBytes(IV_LENGTH); // random IV per encryption (never reuse with GCM)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString('base64')}`;
}

/**
 * Decrypt a stored credential.
 * @param {string} encryptedValue "iv.authTag.ciphertext"
 * @returns {string} plaintext
 * @throws {Error} on bad format, tampering, or missing key
 */
export function decryptCredential(encryptedValue) {
  if (typeof encryptedValue !== 'string') {
    throw new Error('[credentialVault] decryptCredential expects a string.');
  }
  const parts = encryptedValue.split('.');
  if (parts.length !== 3) {
    throw new Error('[credentialVault] invalid encrypted format (expected 3 segments).');
  }
  const key = getKeyBuffer();
  const [ivB64, authTagB64, encB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(encB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]); // throws on tamper
  return decrypted.toString('utf8');
}

/** True if a decrypted value is a seed placeholder (never to be sent to a provider). */
export function isUnfilledSentinel(value) {
  return typeof value === 'string' && value.startsWith(SENTINEL_PREFIX);
}

/** 4 last clear chars for masked display (••••XXXX). Never the full value. */
export function lastFour(value) {
  const s = String(value || '');
  return s.slice(-4);
}
