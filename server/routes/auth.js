/**
 * BookUp Google OAuth Routes
 * /api/auth/google/*
 */

import { Router } from 'express';
import { googleCalendarService } from '../services/googleCalendar.js';
import { tokenStore } from '../services/tokenStore.js';
import { config } from '../config.js';
import { requireProviderAuth } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/auth/google/url
 * Returns authorization URL to initiate Google OAuth consent
 * Authenticated provider only: resolves provider strictly from Supabase Auth session
 */
router.get('/url', requireProviderAuth, (req, res) => {
  try {
    const providerId = req.providerId;
    const url = googleCalendarService.generateAuthUrl(providerId);
    res.json({ success: true, url });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/auth/google/callback
 * Handles Google OAuth redirect and HMAC-signed state verification
 */
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  // Handle user cancellation on Google consent screen
  if (error) {
    console.warn('Google OAuth denied or cancelled by user:', error);
    return res.redirect(`${config.frontendUrl}/dashboard/settings?gcal_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return res.redirect(`${config.frontendUrl}/dashboard/settings?gcal_error=missing_code_or_state`);
  }

  try {
    const { providerId, email } = await googleCalendarService.handleCallback(code, state);
    console.log(`✓ Google Calendar connected successfully for ${providerId} (${email})`);

    return res.redirect(
      `${config.frontendUrl}/dashboard/settings?gcal_success=true&email=${encodeURIComponent(email || '')}&providerId=${encodeURIComponent(providerId)}`
    );
  } catch (err) {
    console.error('Google OAuth callback failed:', err.message);
    return res.redirect(
      `${config.frontendUrl}/dashboard/settings?gcal_error=${encodeURIComponent(err.message)}`
    );
  }
});

/**
 * GET /api/auth/google/status
 * Check if the authenticated provider has an active Google Calendar integration
 * Authenticated provider only: resolves provider strictly from Supabase Auth session
 */
router.get('/status', requireProviderAuth, (req, res) => {
  const providerId = req.providerId;
  const status = tokenStore.getStatus(providerId);
  res.json({ success: true, ...status });
});

/**
 * POST /api/auth/google/disconnect
 * Disconnect Google Calendar and revoke tokens for the authenticated provider
 * Authenticated provider only: resolves provider strictly from Supabase Auth session
 */
router.post('/disconnect', requireProviderAuth, async (req, res) => {
  const providerId = req.providerId;
  try {
    await googleCalendarService.disconnect(providerId);
    res.json({ success: true, message: 'Google Calendar disconnected' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
