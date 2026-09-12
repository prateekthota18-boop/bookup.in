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

    // Authoritative resolution: providers.user_id = authenticated auth.users.id
    const { data: provider, error: provError } = await serverSupabase
      .from('providers')
      .select('id, user_id, name, slug, timezone')
      .eq('user_id', user.id)
      .single();

    if (provError || !provider) {
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
