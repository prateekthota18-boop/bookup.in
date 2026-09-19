/**
 * BookUp Google Calendar API Service
 * Production OAuth 2.0 client, token refresher, free/busy interval calculator,
 * and event synchronization. Uses Node native fetch and zero external client SDKs.
 */

import crypto from 'crypto';
import { config } from '../config.js';
import { tokenStore } from './tokenStore.js';
import { generateOAuthState, verifyOAuthState } from '../utils/crypto.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
].join(' ');

function getTimezoneOffsetString(dateStr, timeZone = 'Asia/Kolkata') {
  try {
    const d = new Date(`${dateStr}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(d);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    if (tzPart && tzPart.value) {
      const match = tzPart.value.match(/GMT([+-]\d{2}:\d{2})/);
      if (match) return match[1];
      if (tzPart.value === 'GMT') return '+00:00';
    }
  } catch (_e) {}
  return '+05:30';
}

export const googleCalendarService = {
  /**
   * Generate Google OAuth authorization URL
   */
  generateAuthUrl(providerId = 'provider-1') {
    if (!config.isGoogleConfigured()) {
      throw new Error('Google OAuth credentials not configured in .env (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)');
    }

    const state = generateOAuthState(providerId);
    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: config.googleRedirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  },

  /**
   * Exchange authorization code for tokens and save them
   */
  async handleCallback(code, stateToken) {
    const stateCheck = verifyOAuthState(stateToken);
    if (!stateCheck.valid) {
      throw new Error(`Security validation failed: ${stateCheck.error}`);
    }

    const providerId = stateCheck.providerId;

    // Exchange authorization code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: config.googleRedirectUri,
        grant_type: 'authorization_code',
        code,
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('Google token exchange error:', errBody);
      throw new Error('Failed to exchange authorization code with Google');
    }

    const tokenData = await tokenRes.json();
    const { access_token, refresh_token, expires_in, scope } = tokenData;

    // Fetch user profile email
    let userEmail = '';
    try {
      const userRes = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        userEmail = userData.email || '';
      }
    } catch (e) {
      console.warn('Could not fetch user email:', e.message);
    }

    // Save tokens securely
    const expiresAt = Date.now() + (expires_in || 3600) * 1000;
    await tokenStore.saveTokens(providerId, {
      email: userEmail,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt,
      scope,
    });

    return { providerId, email: userEmail };
  },

  /**
   * Return valid token details or explicit failure reason:
   * 'not_connected' | 'token_refresh_failed'
   */
  async getValidTokenDetails(providerId) {
    const tokens = await tokenStore.getDecryptedTokens(providerId);
    if (!tokens || !tokens.accessToken) {
      return {
        success: false,
        accessToken: null,
        reason: 'not_connected',
        error: `Google Calendar is not connected for provider ${providerId}`,
      };
    }

    // Check if token expires within 5 minutes
    const isExpired = Date.now() >= tokens.expiresAt - 5 * 60 * 1000;
    if (!isExpired) {
      return {
        success: true,
        accessToken: tokens.accessToken,
        reason: null,
        error: null,
      };
    }

    // Attempt token refresh
    if (!tokens.refreshToken) {
      console.warn(`[GoogleCalendarService] No refresh token available for ${providerId}. User must re-authenticate.`);
      return {
        success: false,
        accessToken: null,
        reason: 'token_refresh_failed',
        error: `Access token expired and no refresh token is stored for provider ${providerId}`,
      };
    }

    try {
      const refreshRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.googleClientId,
          client_secret: config.googleClientSecret,
          grant_type: 'refresh_token',
          refresh_token: tokens.refreshToken,
        }),
      });

      if (!refreshRes.ok) {
        const errData = await refreshRes.json().catch(() => ({}));
        const errMsg = errData.error_description || errData.error || `HTTP ${refreshRes.status}`;
        if (errData.error === 'invalid_grant') {
          console.warn(`[GoogleCalendarService] Refresh token revoked or invalid for provider ${providerId}. Disconnecting.`);
          await tokenStore.deleteTokens(providerId);
          return {
            success: false,
            accessToken: null,
            reason: 'token_refresh_failed',
            error: `Refresh token revoked or expired (invalid_grant): ${errMsg}`,
          };
        }
        return {
          success: false,
          accessToken: null,
          reason: 'token_refresh_failed',
          error: `Token refresh failed with status ${refreshRes.status}: ${errMsg}`,
        };
      }

      const refreshed = await refreshRes.json();
      const newExpiresAt = Date.now() + (refreshed.expires_in || 3600) * 1000;
      await tokenStore.updateAccessToken(providerId, refreshed.access_token, newExpiresAt);

      return {
        success: true,
        accessToken: refreshed.access_token,
        reason: null,
        error: null,
      };
    } catch (err) {
      console.error(`[GoogleCalendarService] Token refresh error for ${providerId}:`, err.message);
      return {
        success: false,
        accessToken: null,
        reason: 'token_refresh_failed',
        error: `Token refresh exception: ${err.message}`,
      };
    }
  },

  /**
   * Get valid access token, auto-refreshing if expired
   */
  async getValidAccessToken(providerId) {
    const details = await this.getValidTokenDetails(providerId);
    return details.success ? details.accessToken : null;
  },

  /**
   * Fetch busy time intervals for a given date (YYYY-MM-DD)
   * Clamped to [00:00, 23:59] in provider's timezone.
   * Exposes only start and end times to preserve customer privacy.
   */
  async getBusyIntervals(providerId, dateStr, timeZone = 'Asia/Kolkata') {
    const accessToken = await this.getValidAccessToken(providerId);
    if (!accessToken) {
      return { connected: false, busyTimes: [] };
    }

    const offset = getTimezoneOffsetString(dateStr, timeZone);
    const timeMin = `${dateStr}T00:00:00${offset}`;
    const timeMax = `${dateStr}T23:59:59${offset}`;

    try {
      const freeBusyRes = await fetch(`${CALENDAR_API_BASE}/freeBusy`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeMin,
          timeMax,
          timeZone,
          items: [{ id: 'primary' }],
        }),
      });

      if (!freeBusyRes.ok) {
        console.error('Google freeBusy error:', await freeBusyRes.text());
        return { connected: true, busyTimes: [] };
      }

      const data = await freeBusyRes.json();
      const rawBusy = data?.calendars?.primary?.busy || [];

      // Format to HH:mm in provider's timezone and clamp to [00:00, 23:59]
      const formatTime = (d) => {
        const parts = new Intl.DateTimeFormat('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone,
        }).formatToParts(d);
        const h = parts.find(p => p.type === 'hour')?.value || '00';
        const m = parts.find(p => p.type === 'minute')?.value || '00';
        return `${h}:${m}`;
      };

      const busyTimes = [];
      for (const slot of rawBusy) {
        const startDate = new Date(slot.start);
        const endDate = new Date(slot.end);

        const startDay = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(startDate);
        const endDay = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(endDate);

        let startStr = formatTime(startDate);
        let endStr = formatTime(endDate);

        if (startDay < dateStr) startStr = '00:00';
        if (endDay > dateStr) endStr = '23:59';

        if (startDay <= dateStr && endDay >= dateStr) {
          busyTimes.push({
            start: startStr,
            end: endStr,
          });
        }
      }

      return { connected: true, busyTimes };
    } catch (err) {
      console.error('Failed to query Google freeBusy:', err.message);
      return { connected: true, busyTimes: [] };
    }
  },

  /**
   * Create an appointment event in Google Calendar
   */
  async createEvent(providerId, booking, timeZone = 'Asia/Kolkata') {
    const providerIdentifier = booking.providerName || providerId || 'unknown-provider';
    const recipientIdentifier = booking.customerEmail || booking.customerName || 'unknown-recipient';

    const tokenDetails = await this.getValidTokenDetails(providerId);
    if (!tokenDetails.success || !tokenDetails.accessToken) {
      const reason = tokenDetails.reason || 'not_connected';
      console.error(`[GoogleCalendarService] Failed to create Google Calendar event. Reason: "${reason}". Provider: "${providerIdentifier}", Recipient: "${recipientIdentifier}", Error: ${tokenDetails.error || 'Google Calendar not connected or access token missing.'}`);
      return { success: false, reason, error: tokenDetails.error || 'Google Calendar not connected for provider' };
    }

    const accessToken = tokenDetails.accessToken;

    const offset = getTimezoneOffsetString(booking.date, timeZone);
    const startDateTime = `${booking.date}T${booking.startTime}:00${offset}`;
    const endDateTime = `${booking.date}T${booking.endTime}:00${offset}`;

    const summary = `${booking.serviceName} — ${booking.customerName} (Calup)`;
    const description = [
      `Calup Appointment`,
      `Service: ${booking.serviceName} (${booking.duration} mins)`,
      `Client: ${booking.customerName}`,
      `Phone: ${booking.customerPhone}`,
      booking.customerEmail ? `Email: ${booking.customerEmail}` : '',
      `Amount: ₹${booking.price}`,
      `Booking Ref: ${booking.id}`,
      booking.notes ? `Notes: ${booking.notes}` : '',
    ].filter(Boolean).join('\n');

    const attendees = [];
    if (booking.customerEmail) {
      attendees.push({ email: booking.customerEmail, displayName: booking.customerName });
    }

    try {
      const requestId = String(booking.id || crypto.randomUUID());
      const res = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events?conferenceDataVersion=1`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary,
          description,
          start: { dateTime: startDateTime, timeZone },
          end: { dateTime: endDateTime, timeZone },
          attendees,
          conferenceData: {
            createRequest: {
              requestId,
              conferenceSolutionKey: {
                type: 'hangoutsMeet',
              },
            },
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 30 },
              { method: 'email', minutes: 120 },
            ],
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[GoogleCalendarService] Google Calendar event creation API error. Reason: "api_error". Provider: "${providerIdentifier}", Recipient: "${recipientIdentifier}", Error: ${errText}`);
        return { success: false, reason: 'api_error', error: `Google Calendar API error (${res.status}): ${errText}` };
      }

      const eventData = await res.json();

      // Extract Google Meet video link from conferenceData entryPoints
      let meetLink = null;
      if (eventData?.conferenceData?.entryPoints && Array.isArray(eventData.conferenceData.entryPoints)) {
        const videoEntry = eventData.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video');
        if (videoEntry?.uri) {
          meetLink = videoEntry.uri;
        }
      }
      // Fallback if hangoutLink is present at top-level
      if (!meetLink && eventData?.hangoutLink) {
        meetLink = eventData.hangoutLink;
      }

      return {
        success: true,
        eventId: eventData.id,
        htmlLink: eventData.htmlLink,
        meetLink,
      };
    } catch (err) {
      console.error(`[GoogleCalendarService] Google Calendar event creation exception. Reason: "api_error". Provider: "${providerIdentifier}", Recipient: "${recipientIdentifier}", Error: ${err.message || err}`);
      return { success: false, reason: 'api_error', error: err.message || String(err) };
    }
  },

  /**
   * Update an existing appointment event (e.g. Reschedule)
   */
  async updateEvent(providerId, eventId, booking, timeZone = 'Asia/Kolkata') {
    if (!eventId) return { success: false, reason: 'missing_event_id' };

    const tokenDetails = await this.getValidTokenDetails(providerId);
    if (!tokenDetails.success || !tokenDetails.accessToken) {
      return { success: false, reason: tokenDetails.reason || 'not_connected', error: tokenDetails.error };
    }
    const accessToken = tokenDetails.accessToken;

    const startDateTime = `${booking.date}T${booking.startTime}:00+05:30`;
    const endDateTime = `${booking.date}T${booking.endTime}:00+05:30`;

    try {
      const res = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start: { dateTime: startDateTime, timeZone },
          end: { dateTime: endDateTime, timeZone },
        }),
      });

      if (!res.ok) {
        console.error('Failed to update Google Calendar event:', await res.text());
        return { success: false, reason: 'api_error' };
      }

      return { success: true };
    } catch (err) {
      console.error('Error updating Google Calendar event:', err.message);
      return { success: false, reason: 'api_error', error: err.message };
    }
  },

  /**
   * Delete an event upon appointment cancellation
   */
  async deleteEvent(providerId, eventId) {
    if (!eventId) return { success: false, reason: 'missing_event_id' };

    const tokenDetails = await this.getValidTokenDetails(providerId);
    if (!tokenDetails.success || !tokenDetails.accessToken) {
      return { success: false, reason: tokenDetails.reason || 'not_connected', error: tokenDetails.error };
    }
    const accessToken = tokenDetails.accessToken;

    try {
      const res = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // 204 No Content is success for DELETE
      if (res.status === 204 || res.ok) {
        return { success: true };
      }

      // If already deleted on Google Calendar (404/410), treat as success
      if (res.status === 404 || res.status === 410) {
        return { success: true };
      }

      console.error('Failed to delete Google Calendar event:', await res.text());
      return { success: false, reason: 'api_error' };
    } catch (err) {
      console.error('Error deleting Google Calendar event:', err.message);
      return { success: false, reason: 'api_error', error: err.message };
    }
  },

  /**
   * Disconnect Google account & revoke token
   */
  async disconnect(providerId) {
    const tokens = await tokenStore.getDecryptedTokens(providerId);
    if (tokens?.accessToken) {
      try {
        await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(tokens.accessToken)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
      } catch (e) {
        console.warn('Revoke error (non-fatal):', e.message);
      }
    }

    await tokenStore.deleteTokens(providerId);
    return { success: true };
  }
};
