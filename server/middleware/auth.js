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

const serverSupabase = (config.supabaseUrl && config.supabaseKey)
  ? createClient(config.supabaseUrl, config.supabaseKey)
  : null;

function generateSlug(name) {
  return (name || 'provider')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'provider';
}

export async function requireProviderAuth(req, res, next) {
  if (!serverSupabase) {
    return res.status(500).json({ success: false, error: 'Supabase server client not configured' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required: missing Bearer token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { data: { user }, error: userError } = await serverSupabase.auth.getUser(token);
    if (userError || !user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired session' });
    }

    // Client scoped to user's Bearer token (guarantees auth.uid() is recognized by RLS)
    const userClient = createClient(config.supabaseUrl, config.supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    // 1. Authoritative resolution: providers.user_id = authenticated auth.users.id
    let { data: provider, error: _provError } = await serverSupabase
      .from('providers')
      .select('id, user_id, name, slug, timezone')
      .eq('user_id', user.id)
      .maybeSingle();

    // 2. Fallback: match by email if provider was created without user_id link
    if (!provider && user.email) {
      const { data: emailMatch } = await serverSupabase
        .from('providers')
        .select('id, user_id, name, slug, timezone')
        .eq('email', user.email.toLowerCase())
        .maybeSingle();

      if (emailMatch) {
        await (userClient || serverSupabase)
          .from('providers')
          .update({ user_id: user.id })
          .eq('id', emailMatch.id);
        provider = { ...emailMatch, user_id: user.id };
      }
    }

    // 3. Fallback: auto-provision provider record for authenticated user if not yet created via onboarding
    if (!provider) {
      const providerName = user.user_metadata?.name || user.email?.split('@')[0] || 'Provider';
      const baseSlug = generateSlug(providerName);
      const slug = `${baseSlug}-${user.id.substring(0, 6)}`;

      let newProvider = null;
      try {
        const { data: created } = await userClient
          .from('providers')
          .insert({
            user_id: user.id,
            name: providerName,
            slug,
            email: user.email || '',
            timezone: 'Asia/Kolkata',
            buffer_time: 15,
            min_notice: 2,
            max_advance_booking: 30,
          })
          .select('id, user_id, name, slug, timezone')
          .maybeSingle();

        if (created) newProvider = created;
      } catch (_e) {}

      if (!newProvider && serverSupabase) {
        const { data: adminCreated } = await serverSupabase
          .from('providers')
          .insert({
            user_id: user.id,
            name: providerName,
            slug,
            email: user.email || '',
            timezone: 'Asia/Kolkata',
            buffer_time: 15,
            min_notice: 2,
            max_advance_booking: 30,
          })
          .select('id, user_id, name, slug, timezone')
          .maybeSingle();

        if (adminCreated) newProvider = adminCreated;
      }

      if (newProvider) {
        provider = newProvider;
      }
    }

    if (!provider) {
      return res.status(403).json({ success: false, error: 'No provider profile linked to authenticated user' });
    }

    req.user = user;
    req.provider = provider;
    req.providerId = provider.id; // Bound strictly to authenticated user's provider record
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: `Auth verification failed: ${err.message}` });
  }
}
