/**
 * BookUp — Real Google Calendar Provider
 * Communicates with backend endpoints (/api/auth/google/*, /api/calendar/*)
 * to perform real OAuth 2.0 connection, fetch live busy intervals, and sync booking events.
 */

import { CalendarProvider } from './CalendarProvider';
import { supabase } from '../supabase/supabaseClient';

async function getAuthHeader() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
  } catch (err) {
    console.warn('Could not retrieve Supabase session token:', err);
  }
  return {};
}

function getApiBase() {
  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '';
  if (envUrl.trim()) {
    return `${envUrl.trim().replace(/\/$/, '')}/api`;
  }
  // Production fallback for Vercel deployment if VITE_API_URL was omitted at build time
  if (typeof window !== 'undefined' && window.location?.hostname?.includes('vercel.app')) {
    return 'https://bookup-in.onrender.com/api';
  }
  return '/api';
}

export class RealGoogleCalendarProvider extends CalendarProvider {
  constructor(apiBase) {
    super();
    this._customApiBase = apiBase;
  }

  get apiBase() {
    return this._customApiBase || getApiBase();
  }

  /**
   * Get connection status for the authenticated provider
   */
  async getStatus(_providerId) {
    try {
      const authHeaders = await getAuthHeader();
      const res = await fetch(`${this.apiBase}/auth/google/status`, {
        headers: { ...authHeaders },
      });
      if (!res.ok) return { isConnected: false, email: null };
      const data = await res.json();
      return {
        isConnected: Boolean(data.isConnected),
        email: data.email || null,
        connectedAt: data.connectedAt || null,
      };
    } catch (err) {
      console.warn('Could not fetch Google Calendar status from server:', err.message);
      return { isConnected: false, email: null };
    }
  }

  /**
   * Initiate Google OAuth flow:
   * Fetches authorization URL from backend and redirects the user
   */
  async connect(_options = {}) {
    const authHeaders = await getAuthHeader();
    const res = await fetch(`${this.apiBase}/auth/google/url`, {
      headers: { ...authHeaders },
    });
    const data = await res.json();

    if (!data.success || !data.url) {
      throw new Error(data.error || 'Failed to generate Google OAuth URL. Please ensure credentials are in .env');
    }

    // Redirect current window to Google's consent screen
    window.location.href = data.url;
    return { redirecting: true };
  }

  /**
   * Disconnect Google Calendar and revoke tokens
   */
  async disconnect(_providerId) {
    const authHeaders = await getAuthHeader();
    const res = await fetch(`${this.apiBase}/auth/google/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
    });

    const data = await res.json();
    return Boolean(data.success);
  }

  /**
   * Check if connected
   * @param {Object} calendarState
   */
  isConnected(calendarState) {
    return Boolean(calendarState?.isConnected);
  }

  /**
   * Fetch busy time intervals for a given date (YYYY-MM-DD)
   * Queries Google Calendar freebusy via backend for public booking slot filtering
   * @param {string} dateStr 'YYYY-MM-DD'
   * @param {string} providerId
   * @param {string} timeZone
   */
  async getBusyTimes(dateStr, providerId, timeZone = 'Asia/Kolkata') {
    if (!dateStr || !providerId) return [];

    try {
      const res = await fetch(`${this.apiBase}/calendar/busy?providerId=${encodeURIComponent(providerId)}&date=${encodeURIComponent(dateStr)}&timeZone=${encodeURIComponent(timeZone)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.busyTimes) ? data.busyTimes : [];
    } catch (err) {
      console.warn('Error fetching Google Calendar busy times:', err.message);
      return [];
    }
  }

  /**
   * Create an event for a confirmed booking
   * @param {Object} booking
   * @param {string} providerId
   * @param {string} timeZone
   */
  async createEvent(booking, providerId, timeZone = 'Asia/Kolkata') {
    if (!providerId || !booking) return { success: false, reason: 'missing_params' };

    try {
      const res = await fetch(`${this.apiBase}/calendar/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, booking, timeZone }),
      });

      const data = await res.json();
      return {
        success: Boolean(data.success),
        eventId: data.eventId || null,
        htmlLink: data.htmlLink || null,
        duplicatePrevented: Boolean(data.duplicatePrevented),
      };
    } catch (err) {
      console.error('Failed to sync event to Google Calendar:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Update an existing event (e.g. Reschedule)
   * @param {string} eventId
   * @param {Object} booking
   * @param {string} providerId
   */
  async updateEvent(eventId, booking, providerId = 'provider-1') {
    if (!eventId) return { success: false };

    try {
      const res = await fetch(`${this.apiBase}/calendar/events/${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, booking }),
      });

      const data = await res.json();
      return { success: Boolean(data.success) };
    } catch (err) {
      console.error('Failed to update Google Calendar event:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Delete event upon cancellation
   * @param {string} eventId
   * @param {string} providerId
   */
  async deleteEvent(eventId, providerId = 'provider-1') {
    if (!eventId) return { success: false };

    try {
      const res = await fetch(`${this.apiBase}/calendar/events/${encodeURIComponent(eventId)}?providerId=${encodeURIComponent(providerId)}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      return { success: Boolean(data.success) };
    } catch (err) {
      console.error('Failed to delete Google Calendar event:', err.message);
      return { success: false, error: err.message };
    }
  }
}

export const realGoogleCalendarService = new RealGoogleCalendarProvider();
