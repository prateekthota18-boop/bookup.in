/**
 * BookUp Server Auth Middleware
 * Enforces authenticated Supabase session and resolves provider ownership:
 * auth.users.id -> providers.user_id -> provider.id
 *
 * Prevents arbitrary client-supplied provider IDs from accessing or modifying
 * another provider's Google Calendar credentials.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

function isServiceRoleKey(key) {
  if (!key || typeof key !== 'string') return false;
  try {
    const parts = key.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
      return payload.role === 'service_role';
    }
  } catch {}
  return false;
}

// Detect service-role key
const effectiveServiceRoleKey = isServiceRoleKey(config.supabaseServiceRoleKey)
  ? config.supabaseServiceRoleKey
  : isServiceRoleKey(config.supabaseKey)
    ? config.supabaseKey
    : null;

// Service-role client that bypasses RLS (server-side only, never exposed to frontend)
const serviceRoleClient = (config.supabaseUrl && effectiveServiceRoleKey)
  ? createClient(config.supabaseUrl, effectiveServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

// General server client for verifying user JWTs
const authClient = (config.supabaseUrl && (effectiveServiceRoleKey || config.supabaseAnonKey || config.supabaseKey))
  ? createClient(config.supabaseUrl, effectiveServiceRoleKey || config.supabaseAnonKey || config.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

function generateSlug(name) {
  return (name || 'provider')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'provider';
}

export async function requireProviderAuth(req, res, next) {
  if (!authClient) {
    console.error('[AUTH] Supabase server client not configured');
    return res.status(500).json({ success: false, error: 'Supabase server client not configured' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required: missing Bearer token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    // 1. Verify the Supabase JWT
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);
    if (userError || !user) {
      console.warn('[AUTH] Token verification failed:', userError?.message || 'No user returned');
      return res.status(401).json({ success: false, error: 'Invalid or expired session' });
    }

    // 2. Diagnostic logging for authenticated user
    console.log(`[AUTH] Authenticated user.id: ${user.id}, user.email: ${user.email}`);

    // User-scoped client (satisfies auth.uid() = user_id for RLS)
    const userClient = createClient(
      config.supabaseUrl,
      config.supabaseAnonKey || config.supabaseKey,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    const queryClient = serviceRoleClient || userClient || authClient;

    // 3. Search providers for user_id = authenticated user.id
    const { data: providerByUid, error: lookupErr } = await queryClient
      .from('providers')
      .select('id, user_id, name, slug, timezone, email')
      .eq('user_id', user.id)
      .maybeSingle();

    console.log(`[AUTH] Provider lookup result:`, providerByUid ? `Found ID ${providerByUid.id}` : 'None', `| Lookup error:`, lookupErr ? lookupErr.message : 'none');
    console.log(`[AUTH] Whether provider was found: ${Boolean(providerByUid)}`);

    let provider = providerByUid;

    // 4. If found, use that provider
    if (!provider) {
      // 5. If not found, attempt fallback provisioning
      console.log(`[AUTH] Fallback provisioning attempted for user.id: ${user.id}`);

      // Search for an unlinked provider matching the authenticated user's email
      if (user.email) {
        const { data: emailMatch, error: emailMatchErr } = await queryClient
          .from('providers')
          .select('id, user_id, name, slug, timezone, email')
          .eq('email', user.email.trim().toLowerCase())
          .is('user_id', null)
          .maybeSingle();

        console.log(`[AUTH] Unlinked provider match by email:`, emailMatch ? `Found ID ${emailMatch.id}` : 'None', `| Error:`, emailMatchErr ? emailMatchErr.message : 'none');

        // 6. If found, safely update that provider's user_id to authenticated user.id
        if (emailMatch) {
          const updateClient = serviceRoleClient || userClient;
          const { data: updated, error: updateErr } = await updateClient
            .from('providers')
            .update({ user_id: user.id })
            .eq('id', emailMatch.id)
            .select('id, user_id, name, slug, timezone, email')
            .maybeSingle();

          if (!updateErr && updated) {
            provider = updated;
            console.log(`[AUTH] Provider update succeeded: linked existing provider ${provider.id} to user_id ${user.id}`);
          } else {
            console.warn(`[AUTH] Provider update failed:`, updateErr ? updateErr.message : 'No updated row returned');
          }
        }
      }

      // 7. If still not found, create a minimal provider record linked to authenticated user.id
      if (!provider) {
        const providerName = user.user_metadata?.name || user.email?.split('@')[0] || 'Provider';
        const baseSlug = generateSlug(providerName);
        let candidateSlug = `${baseSlug}-${user.id.substring(0, 6)}`;

        // 8. Ensure slug uniqueness
        let slugIsUnique = false;
        let attempts = 0;
        while (!slugIsUnique && attempts < 5) {
          const { data: existingSlug } = await queryClient
            .from('providers')
            .select('id')
            .eq('slug', candidateSlug)
            .maybeSingle();

          if (!existingSlug) {
            slugIsUnique = true;
          } else {
            attempts++;
            candidateSlug = `${baseSlug}-${user.id.substring(0, 4)}-${Math.floor(Math.random() * 9000 + 1000)}`;
          }
        }

        const insertPayload = {
          user_id: user.id,
          name: providerName,
          slug: candidateSlug,
          email: user.email || '',
          timezone: 'Asia/Kolkata',
          buffer_time: 15,
          min_notice: 2,
          max_advance_booking: 30,
        };

        let created = null;
        let createErr = null;

        if (serviceRoleClient) {
          const res = await serviceRoleClient
            .from('providers')
            .insert(insertPayload)
            .select('id, user_id, name, slug, timezone, email')
            .maybeSingle();
          created = res.data;
          createErr = res.error;
        }

        if (!created && userClient) {
          const res = await userClient
            .from('providers')
            .insert(insertPayload)
            .select('id, user_id, name, slug, timezone, email')
            .maybeSingle();
          created = res.data;
          createErr = res.error || createErr;
        }

        if (created) {
          provider = created;
          console.log(`[AUTH] Provider creation succeeded: created provider ${provider.id} for user_id ${user.id}`);
        } else {
          console.error(`[AUTH] Provider creation failed:`, createErr ? createErr.message : 'Unknown insertion error');
        }
      }
    }

    if (!provider) {
      console.error(`[AUTH] No provider profile linked to authenticated user ${user.id} and provisioning failed`);
      return res.status(403).json({ success: false, error: 'No provider profile linked to authenticated user' });
    }

    // 9. Return/use the resulting provider.id
    console.log(`[AUTH] Resulting provider.id: ${provider.id}, provider.user_id: ${provider.user_id}`);
    req.user = user;
    req.provider = provider;
    req.providerId = provider.id;

    // 10. Continue Google OAuth instead of returning 403
    next();
  } catch (err) {
    console.error(`[AUTH] Exception in requireProviderAuth:`, err.message);
    return res.status(500).json({ success: false, error: `Auth verification failed: ${err.message}` });
  }
}
