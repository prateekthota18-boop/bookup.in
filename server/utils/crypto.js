/**
 * BookUp Cryptography & Security Utilities
 * AES-256-GCM authenticated encryption for OAuth tokens at rest.
 * HMAC-SHA256 signer for OAuth CSRF state protection.
 */

import crypto from 'crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

/**
 * Get 32-byte Buffer key from hex configuration string
 */
function getKeyBuffer() {
  const keyHex = config.tokenEncryptionKey || '';
  if (keyHex.length === 64) {
    return Buffer.from(keyHex, 'hex');
  }
  // Fallback hash to ensure exactly 32 bytes
  return crypto.createHash('sha256').update(keyHex || 'bookup-secret-key-fallback').digest();
}

/**
 * Encrypt plaintext string using AES-256-GCM
 * Output format: iv_hex:authTag_hex:ciphertext_hex
 * @param {string} plaintext
 * @returns {string} encrypted bundle
 */
export function encryptToken(plaintext) {
  if (!plaintext) return '';
  const key = getKeyBuffer();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt AES-256-GCM bundle
 * @param {string} encryptedBundle iv_hex:authTag_hex:ciphertext_hex
 * @returns {string} decrypted plaintext
 */
export function decryptToken(encryptedBundle) {
  if (!encryptedBundle) return '';
  const parts = encryptedBundle.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getKeyBuffer();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Generate cryptographically signed OAuth state
 * Embeds providerId, timestamp, and random nonce, signed with HMAC-SHA256.
 * @param {string} providerId
 * @returns {string} base64url encoded payload.signature
 */
export function generateOAuthState(providerId = 'provider-1') {
  const payload = {
    providerId,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
  };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr).toString('base64url');

  const hmac = crypto.createHmac('sha256', getKeyBuffer());
  hmac.update(payloadB64);
  const signature = hmac.digest('base64url');

  return `${payloadB64}.${signature}`;
}

/**
 * Verify and decode OAuth state token
 * Validates HMAC signature and verifies token is not expired (max 15 mins).
 * @param {string} stateToken
 * @returns {{ valid: boolean, providerId?: string, error?: string }}
 */
export function verifyOAuthState(stateToken) {
  if (!stateToken || typeof stateToken !== 'string') {
    return { valid: false, error: 'State parameter missing' };
  }

  const parts = stateToken.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed state parameter' };
  }

  const [payloadB64, signature] = parts;
  const hmac = crypto.createHmac('sha256', getKeyBuffer());
  hmac.update(payloadB64);
  const expectedSig = hmac.digest('base64url');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return { valid: false, error: 'Invalid state signature (potential CSRF)' };
  }

  try {
    const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadStr);

    // Expire after 15 minutes
    const MAX_AGE_MS = 15 * 60 * 1000;
    if (Date.now() - payload.timestamp > MAX_AGE_MS) {
      return { valid: false, error: 'State token expired' };
    }

    return { valid: true, providerId: payload.providerId };
  } catch (_err) {
    return { valid: false, error: 'Failed to parse state payload' };
  }
}
