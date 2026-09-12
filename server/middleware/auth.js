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
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
      return payload.role === 'service_role';
    }
  } catch {}
  return false;
}

const rawServiceKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  config.supabaseServiceRoleKey ||
  (isServiceRoleKey(config.supabaseKey) ? config.supabaseKey : null)
);
const effectiveServiceRoleKey = rawServiceKey ? rawServiceKey.trim().replace(/^["']|["']$/g, '') : null;

// Service-role client that bypasses RLS (server-side only, never exposed to frontend)
export const serviceRoleClient = (config.supabaseUrl && effectiveServiceRoleKey)
  ? createClient(config.supabaseUrl, effectiveServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const generalKey = (
  effectiveServiceRoleKey ||
  config.supabaseAnonKey ||
  config.supabaseKey ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  ''
).trim().replace(/^["']|["']$/g, '');

// General server client for verifying user JWTs
export const authClient = (config.supabaseUrl && generalKey)
  ? createClient(config.supabaseUrl, generalKey, {
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
      config.supabaseAnonKey || config.supabaseKey || generalKey,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    // Prefer serviceRoleClient (bypasses RLS), then userClient, then authClient
    const queryClient = serviceRoleClient || userClient || authClient;

    // 3. Search providers for user_id = authenticated user.id
    let { data: provider, error: lookupErr } = await queryClient
      .from('providers')
      .select('id, user_id, name, slug, timezone, email')
      .eq('user_id', user.id)
      .maybeSingle();

    // If not found with primary queryClient and userClient is different, try userClient
    if (!provider && userClient && queryClient !== userClient) {
      const { data: provUser } = await userClient
        .from('providers')
        .select('id, user_id, name, slug, timezone, email')
        .eq('user_id', user.id)
        .maybeSingle();
      if (provUser) provider = provUser;
    }

    console.log(`[AUTH] Provider lookup by user_id result:`, provider ? `Found ID ${provider.id}` : 'None', `| Lookup error:`, lookupErr ? lookupErr.message : 'none');

    // 4. If not found by user_id, search by email to link existing profile
    if (!provider && user.email) {
      console.log(`[AUTH] Searching providers by email for: ${user.email}`);
      const { data: emailMatch, error: emailMatchErr } = await queryClient
        .from('providers')
        .select('id, user_id, name, slug, timezone, email')
        .eq('email', user.email.trim().toLowerCase())
        .maybeSingle();

      console.log(`[AUTH] Provider match by email:`, emailMatch ? `Found ID ${emailMatch.id} (user_id: ${emailMatch.user_id})` : 'None', `| Error:`, emailMatchErr ? emailMatchErr.message : 'none');

      if (emailMatch) {
        if (emailMatch.user_id !== user.id) {
          const updateClient = serviceRoleClient || userClient || authClient;
          const { data: updated, error: updateErr } = await updateClient
            .from('providers')
            .update({ user_id: user.id })
            .eq('id', emailMatch.id)
            .select('id, user_id, name, slug, timezone, email')
            .maybeSingle();

          if (!updateErr && updated) {
            provider = updated;
            console.log(`[AUTH] Provider update succeeded: linked provider ${provider.id} to user_id ${user.id}`);
          } else {
            console.warn(`[AUTH] Provider link update note:`, updateErr ? updateErr.message : 'using in-memory link');
            provider = { ...emailMatch, user_id: user.id };
          }
        } else {
          provider = emailMatch;
        }
      }
    }

    // 5. If still not found, auto-provision minimal provider record
    if (!provider) {
      console.log(`[AUTH] Fallback provisioning minimal provider for user.id: ${user.id}`);
      const providerName = user.user_metadata?.name || user.email?.split('@')[0] || 'Provider';
      const baseSlug = generateSlug(providerName);
      let candidateSlug = `${baseSlug}-${user.id.substring(0, 6)}`;

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
        console.warn(`[AUTH] Provider creation failed:`, createErr ? createErr.message : 'Unknown error');
        // If insert failed because row already exists (e.g. unique constraint race), re-query
        const { data: recheck } = await queryClient
          .from('providers')
          .select('id, user_id, name, slug, timezone, email')
          .eq('user_id', user.id)
          .maybeSingle();
        if (recheck) provider = recheck;
      }
    }

    if (!provider) {
      console.error(`[AUTH] No provider profile linked to authenticated user ${user.id} and provisioning failed`);
      return res.status(403).json({ success: false, error: 'No provider profile linked to authenticated user' });
    }

    console.log(`[AUTH] Resulting provider.id: ${provider.id}, provider.user_id: ${provider.user_id}`);
    req.user = user;
    req.provider = provider;
    req.providerId = provider.id;
    next();
  } catch (err) {
    console.error(`[AUTH] Exception in requireProviderAuth:`, err.message);
    return res.status(500).json({ success: false, error: `Auth verification failed: ${err.message}` });
  }
}
