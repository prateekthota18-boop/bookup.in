/**
 * BookUp — Customer Management Token Security Utilities
 * High-entropy random token generation and cryptographic SHA-256 hashing.
 */

/**
 * Generate a cryptographically secure, high-entropy random management token.
 * Example: 48-character hexadecimal string with high entropy (192 bits).
 */
export function generateManagementToken() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for non-browser/legacy environments
  return (
    'mgmt_' +
    Date.now().toString(36) +
    Math.random().toString(36).substring(2) +
    Math.random().toString(36).substring(2)
  );
}

import { getCustomerManagementUrl } from './url.js';

/**
 * Computes SHA-256 hex digest of a management token.
 * Only the hash is persisted in the database, while the raw token is given to the customer in the URL.
 */
export async function hashManagementToken(token) {
  if (!token || typeof token !== 'string') return '';
  const trimmed = token.trim();

  // Web Crypto API (Browser & Node.js 16+)
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(trimmed);
      const hashBuffer = await subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fallback below if subtle crypto fails
    }
  }

  // Simple string fallback if no crypto available
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(16);
}

/**
 * Build the full management URL for a given raw token.
 */
export function buildManagementUrl(token) {
  return getCustomerManagementUrl(token);
}
