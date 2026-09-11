/**
 * BookUp Multi-Tenant Token Store
 * Securely stores encrypted OAuth tokens per provider in server/data/tokens.json.
 * Plaintext secrets or refresh tokens are never written to disk or exposed to client.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { encryptToken, decryptToken } from '../utils/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');

// Ensure directory exists
function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(TOKENS_FILE)) {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify({}, null, 2), 'utf8');
  }
}

function readAllTokens() {
  ensureStorage();
  try {
    const raw = fs.readFileSync(TOKENS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

function writeAllTokens(data) {
  ensureStorage();
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export const tokenStore = {
  /**
   * Save newly authorized tokens for a provider
   */
  saveTokens(providerId, { email, accessToken, refreshToken, expiresAt, scope }) {
    if (!providerId) throw new Error('providerId is required');

    const all = readAllTokens();
    const existing = all[providerId] || {};

    all[providerId] = {
      providerId,
      email: email || existing.email || '',
      encryptedAccessToken: encryptToken(accessToken),
      // Only overwrite refresh token if a new one was provided by Google
      encryptedRefreshToken: refreshToken ? encryptToken(refreshToken) : existing.encryptedRefreshToken,
      expiresAt: expiresAt || existing.expiresAt || 0,
      scope: scope || existing.scope || '',
      connectedAt: existing.connectedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    writeAllTokens(all);
    return true;
  },

  /**
   * Update access token after refresh
   */
  updateAccessToken(providerId, newAccessToken, newExpiresAt) {
    const all = readAllTokens();
    const record = all[providerId];
    if (!record) return false;

    record.encryptedAccessToken = encryptToken(newAccessToken);
    record.expiresAt = newExpiresAt;
    record.updatedAt = new Date().toISOString();

    writeAllTokens(all);
    return true;
  },

  /**
   * Get decrypted tokens for server-side Google API operations
   */
  getDecryptedTokens(providerId) {
    const all = readAllTokens();
    const record = all[providerId];
    if (!record) return null;

    try {
      return {
        providerId: record.providerId,
        email: record.email,
        accessToken: decryptToken(record.encryptedAccessToken),
        refreshToken: record.encryptedRefreshToken ? decryptToken(record.encryptedRefreshToken) : null,
        expiresAt: record.expiresAt,
        scope: record.scope,
      };
    } catch (err) {
      console.error(`Failed to decrypt tokens for ${providerId}:`, err.message);
      return null;
    }
  },

  /**
   * Safe status query for UI / client (never exposes tokens)
   */
  getStatus(providerId) {
    const all = readAllTokens();
    const record = all[providerId];
    if (!record || (!record.encryptedAccessToken && !record.encryptedRefreshToken)) {
      return { isConnected: false, email: null, connectedAt: null };
    }

    return {
      isConnected: true,
      email: record.email,
      connectedAt: record.connectedAt,
    };
  },

  /**
   * Remove tokens on disconnect
   */
  deleteTokens(providerId) {
    const all = readAllTokens();
    if (all[providerId]) {
      delete all[providerId];
      writeAllTokens(all);
      return true;
    }
    return false;
  }
};
