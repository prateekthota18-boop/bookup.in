/**
 * Calup Multi-Tenant Token Store
 * Securely stores encrypted Google OAuth tokens per provider in Supabase
 * with local file caching in server/data/tokens.json.
 *
 * Tokens are encrypted at rest with AES-256-GCM using TOKEN_ENCRYPTION_KEY.
 * Ephemeral Render redeployments and restarts recover tokens from Supabase seamlessly.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { encryptToken, decryptToken } from '../utils/crypto.js';
import { serviceRoleClient } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');

// Backend Supabase client
function getSupabaseClient() {
  if (serviceRoleClient) return serviceRoleClient;
  const key = config.supabaseServiceRoleKey || config.supabaseKey;
  if (!config.supabaseUrl || !key) return null;
  return createClient(config.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Local cache helpers
function ensureStorage() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(TOKENS_FILE)) {
      fs.writeFileSync(TOKENS_FILE, JSON.stringify({}, null, 2), 'utf8');
    }
  } catch (_e) {}
}

function readLocalTokens() {
  ensureStorage();
  try {
    const raw = fs.readFileSync(TOKENS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

function writeLocalTokens(data) {
  ensureStorage();
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (_e) {}
}

export const tokenStore = {
  /**
   * Save newly authorized tokens for a provider.
   * Persists to Supabase (encrypted with TOKEN_ENCRYPTION_KEY) and syncs local cache.
   */
  async saveTokens(providerId, { email, accessToken, refreshToken, expiresAt, scope }) {
    if (!providerId) throw new Error('providerId is required');

    const all = readLocalTokens();
    const existing = all[providerId] || {};

    const encAccessToken = accessToken ? encryptToken(accessToken) : existing.encryptedAccessToken;
    const encRefreshToken = refreshToken ? encryptToken(refreshToken) : existing.encryptedRefreshToken;
    const effectiveExpiresAt = expiresAt || existing.expiresAt || 0;
    const effectiveScope = scope || existing.scope || '';
    const effectiveEmail = email || existing.email || '';
    const connectedAt = existing.connectedAt || new Date().toISOString();
    const updatedAt = new Date().toISOString();

    const record = {
      providerId,
      email: effectiveEmail,
      encryptedAccessToken: encAccessToken,
      encryptedRefreshToken: encRefreshToken,
      expiresAt: effectiveExpiresAt,
      scope: effectiveScope,
      connectedAt,
      updatedAt,
    };

    // 1. Sync to local file cache
    all[providerId] = record;
    writeLocalTokens(all);

    // 2. Persist to Supabase so tokens survive Render container restarts & redeploys
    const supabase = getSupabaseClient();
    if (supabase) {
      let persisted = false;

      // Strategy A: Dedicated google_tokens table
      try {
        const { error: gtErr } = await supabase
          .from('google_tokens')
          .upsert(
            {
              provider_id: providerId,
              email: effectiveEmail,
              encrypted_access_token: encAccessToken,
              encrypted_refresh_token: encRefreshToken || null,
              expires_at: effectiveExpiresAt,
              scope: effectiveScope,
              connected_at: connectedAt,
              updated_at: updatedAt,
            },
            { onConflict: 'provider_id' }
          );

        if (!gtErr) {
          persisted = true;
        }
      } catch (_e) {}

      // Strategy B: Dedicated columns on providers table
      if (!persisted) {
        try {
          const { error: provColErr } = await supabase
            .from('providers')
            .update({
              google_access_token_encrypted: encAccessToken,
              google_refresh_token_encrypted: encRefreshToken || null,
              google_token_expires_at: effectiveExpiresAt,
              google_calendar_email: effectiveEmail,
              google_calendar_connected_at: connectedAt,
              updated_at: updatedAt,
            })
            .eq('id', providerId);

          if (!provColErr) {
            persisted = true;
          }
        } catch (_e) {}
      }

      // Strategy C: Fallback storage inside providers.bio tagged bundle [gcal_tokens:<encrypted>]
      if (!persisted) {
        try {
          const { data: prov } = await supabase
            .from('providers')
            .select('bio')
            .eq('id', providerId)
            .maybeSingle();

          const currentBio = prov?.bio || '';
          const cleanBio = currentBio.replace(/\n?\[gcal_tokens:[^\]]+\]/g, '').trim();
          const tokensPayload = JSON.stringify({
            email: effectiveEmail,
            encAccessToken,
            encRefreshToken,
            expiresAt: effectiveExpiresAt,
            scope: effectiveScope,
            connectedAt,
          });
          const encryptedPayload = encryptToken(tokensPayload);
          const newBio = cleanBio
            ? `${cleanBio}\n[gcal_tokens:${encryptedPayload}]`
            : `[gcal_tokens:${encryptedPayload}]`;

          await supabase
            .from('providers')
            .update({ bio: newBio, updated_at: updatedAt })
            .eq('id', providerId);
        } catch (_e) {}
      }
    }

    return true;
  },

  /**
   * Update access token after refresh.
   */
  async updateAccessToken(providerId, newAccessToken, newExpiresAt) {
    if (!providerId || !newAccessToken) return false;

    const all = readLocalTokens();
    const existing = all[providerId] || {};

    const encAccessToken = encryptToken(newAccessToken);
    const updatedAt = new Date().toISOString();

    existing.encryptedAccessToken = encAccessToken;
    existing.expiresAt = newExpiresAt;
    existing.updatedAt = updatedAt;

    all[providerId] = existing;
    writeLocalTokens(all);

    // Sync to Supabase
    const supabase = getSupabaseClient();
    if (supabase) {
      let updated = false;

      // Strategy A: google_tokens table
      try {
        const { error: gtErr } = await supabase
          .from('google_tokens')
          .update({
            encrypted_access_token: encAccessToken,
            expires_at: newExpiresAt,
            updated_at: updatedAt,
          })
          .eq('provider_id', providerId);

        if (!gtErr) updated = true;
      } catch (_e) {}

      // Strategy B: providers table columns
      if (!updated) {
        try {
          const { error: provErr } = await supabase
            .from('providers')
            .update({
              google_access_token_encrypted: encAccessToken,
              google_token_expires_at: newExpiresAt,
              updated_at: updatedAt,
            })
            .eq('id', providerId);

          if (!provErr) updated = true;
        } catch (_e) {}
      }

      // Strategy C: providers.bio tagged bundle
      if (!updated) {
        try {
          const { data: prov } = await supabase
            .from('providers')
            .select('bio')
            .eq('id', providerId)
            .maybeSingle();

          if (prov) {
            const currentBio = prov.bio || '';
            const cleanBio = currentBio.replace(/\n?\[gcal_tokens:[^\]]+\]/g, '').trim();
            const tokensPayload = JSON.stringify({
              email: existing.email || '',
              encAccessToken,
              encRefreshToken: existing.encryptedRefreshToken || null,
              expiresAt: newExpiresAt,
              scope: existing.scope || '',
              connectedAt: existing.connectedAt || updatedAt,
            });
            const encryptedPayload = encryptToken(tokensPayload);
            const newBio = cleanBio
              ? `${cleanBio}\n[gcal_tokens:${encryptedPayload}]`
              : `[gcal_tokens:${encryptedPayload}]`;

            await supabase
              .from('providers')
              .update({ bio: newBio, updated_at: updatedAt })
              .eq('id', providerId);
          }
        } catch (_e) {}
      }
    }

    return true;
  },

  /**
   * Get decrypted tokens for server-side Google Calendar operations.
   * Checks local cache first; if empty (after Render redeploy or cold start),
   * retrieves encrypted tokens from Supabase and restores them into local cache.
   */
  async getDecryptedTokens(providerId) {
    if (!providerId) return null;

    let record = null;
    const all = readLocalTokens();

    if (all[providerId]?.encryptedAccessToken || all[providerId]?.encryptedRefreshToken) {
      record = all[providerId];
    }

    // If not in local cache (or after Render container restart), recover from Supabase
    if (!record) {
      const supabase = getSupabaseClient();
      if (supabase) {
        // Strategy A: Check google_tokens table
        try {
          const { data: gtData, error: gtErr } = await supabase
            .from('google_tokens')
            .select('*')
            .eq('provider_id', providerId)
            .maybeSingle();

          if (!gtErr && gtData?.encrypted_access_token) {
            record = {
              providerId,
              email: gtData.email || '',
              encryptedAccessToken: gtData.encrypted_access_token,
              encryptedRefreshToken: gtData.encrypted_refresh_token || null,
              expiresAt: Number(gtData.expires_at) || 0,
              scope: gtData.scope || '',
              connectedAt: gtData.connected_at || gtData.created_at || null,
            };
          }
        } catch (_e) {}

        // Strategy B: Check providers table columns
        if (!record) {
          try {
            const { data: provData, error: provErr } = await supabase
              .from('providers')
              .select('id, email, bio, google_access_token_encrypted, google_refresh_token_encrypted, google_token_expires_at, google_calendar_email, google_calendar_connected_at')
              .eq('id', providerId)
              .maybeSingle();

            if (!provErr && provData) {
              if (provData.google_access_token_encrypted || provData.google_refresh_token_encrypted) {
                record = {
                  providerId,
                  email: provData.google_calendar_email || provData.email || '',
                  encryptedAccessToken: provData.google_access_token_encrypted || '',
                  encryptedRefreshToken: provData.google_refresh_token_encrypted || null,
                  expiresAt: Number(provData.google_token_expires_at) || 0,
                  scope: '',
                  connectedAt: provData.google_calendar_connected_at || null,
                };
              } else if (provData.bio && provData.bio.includes('[gcal_tokens:')) {
                // Strategy C: Extract tagged bundle from bio
                const match = provData.bio.match(/\[gcal_tokens:([^\]]+)\]/);
                if (match && match[1]) {
                  try {
                    const decryptedPayload = decryptToken(match[1]);
                    const parsed = JSON.parse(decryptedPayload);
                    record = {
                      providerId,
                      email: parsed.email || provData.email || '',
                      encryptedAccessToken: parsed.encAccessToken || '',
                      encryptedRefreshToken: parsed.encRefreshToken || null,
                      expiresAt: Number(parsed.expiresAt) || 0,
                      scope: parsed.scope || '',
                      connectedAt: parsed.connectedAt || null,
                    };
                  } catch (_decErr) {
                    console.warn(`[TokenStore] Bio token tag decrypt error for ${providerId}:`, _decErr.message);
                  }
                }
              }
            }
          } catch (_e) {}
        }

        // Restore recovered record to local cache
        if (record) {
          all[providerId] = record;
          writeLocalTokens(all);
        }
      }
    }

    if (!record) return null;

    try {
      return {
        providerId: record.providerId,
        email: record.email,
        accessToken: record.encryptedAccessToken ? decryptToken(record.encryptedAccessToken) : null,
        refreshToken: record.encryptedRefreshToken ? decryptToken(record.encryptedRefreshToken) : null,
        expiresAt: record.expiresAt,
        scope: record.scope,
      };
    } catch (err) {
      console.error(`[TokenStore] Failed to decrypt tokens for ${providerId}:`, err.message);
      return null;
    }
  },

  /**
   * Safe status query for UI / client (never exposes tokens).
   */
  async getStatus(providerId) {
    if (!providerId) {
      return { isConnected: false, email: null, connectedAt: null };
    }

    const all = readLocalTokens();
    let record = all[providerId];

    if (!record || (!record.encryptedAccessToken && !record.encryptedRefreshToken)) {
      // Check Supabase
      const recovered = await this.getDecryptedTokens(providerId);
      if (recovered) {
        const cached = readLocalTokens()[providerId];
        record = cached;
      }
    }

    if (!record || (!record.encryptedAccessToken && !record.encryptedRefreshToken)) {
      return { isConnected: false, email: null, connectedAt: null };
    }

    return {
      isConnected: true,
      email: record.email || null,
      connectedAt: record.connectedAt || null,
    };
  },

  /**
   * Remove tokens on disconnect from local cache and Supabase.
   */
  async deleteTokens(providerId) {
    if (!providerId) return false;

    // 1. Delete from local cache
    const all = readLocalTokens();
    if (all[providerId]) {
      delete all[providerId];
      writeLocalTokens(all);
    }

    // 2. Delete from Supabase
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('google_tokens').delete().eq('provider_id', providerId);
      } catch (_e) {}

      try {
        await supabase
          .from('providers')
          .update({
            google_access_token_encrypted: null,
            google_refresh_token_encrypted: null,
            google_token_expires_at: null,
            google_calendar_email: null,
            google_calendar_connected_at: null,
          })
          .eq('id', providerId);
      } catch (_e) {}

      try {
        const { data: prov } = await supabase
          .from('providers')
          .select('bio')
          .eq('id', providerId)
          .maybeSingle();

        if (prov?.bio && prov.bio.includes('[gcal_tokens:')) {
          const cleanBio = prov.bio.replace(/\n?\[gcal_tokens:[^\]]+\]/g, '').trim();
          await supabase
            .from('providers')
            .update({ bio: cleanBio })
            .eq('id', providerId);
        }
      } catch (_e) {}
    }

    return true;
  }
};
