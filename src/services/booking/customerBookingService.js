/**
 * BookUp — Customer Booking Management API Service
 * Communicates with backend /api/public/bookings/manage/* endpoints.
 */

import { dbService } from '../supabase/dbService';
import { isSupabaseConfigured } from '../supabase/supabaseClient';

export function getApiBase() {
  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '';
  if (envUrl.trim()) {
    return `${envUrl.trim().replace(/\/$/, '')}/api`;
  }
  if (typeof window !== 'undefined' && window.location?.hostname?.includes('vercel.app')) {
    return 'https://bookup-in.onrender.com/api';
  }
  return '/api';
}

export const customerBookingService = {
  /**
   * Create booking via backend (authoritative conflict checks + server-side WhatsApp confirmations)
   */
  async createBooking(bookingPayload) {
    const apiBase = getApiBase();
    try {
      const res = await fetch(`${apiBase}/public/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(bookingPayload),
      });

      const result = await res.json();
      if (res.ok && result.success) {
        return result;
      }
      if (res.status === 409 || res.status === 400) {
        throw new Error(result.error || 'Failed to create booking');
      }
      console.warn('Backend create booking returned error status, falling back to direct dbService:', result.error);
    } catch (apiErr) {
      if (apiErr.message?.includes('already booked') || apiErr.message?.includes('no longer available') || apiErr.message?.includes('conflicts')) {
        throw apiErr;
      }
      console.warn('Backend API create error, falling back to direct dbService:', apiErr.message);
    }

    // Graceful direct Supabase fallback if backend server is sleeping or unreachable
    if (isSupabaseConfigured()) {
      return dbService.createBookingAtomic(bookingPayload);
    }

    throw new Error('Booking service is temporarily unavailable');
  },

  /**
   * Fetch appointment by management token from the backend
   */
  async getBooking(token) {
    if (!token) return null;
    const apiBase = getApiBase();

    try {
      const res = await fetch(`${apiBase}/public/bookings/manage/${encodeURIComponent(token)}`, {
        headers: { Accept: 'application/json' },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.booking) {
          return data;
        }
      } else if (res.status === 404) {
        // Return null for 404 so UI can show appointment not found
        return null;
      }
    } catch (apiErr) {
      console.warn('Backend API fetch error, falling back to direct dbService:', apiErr.message);
    }

    // Graceful fallback for demo or if backend server is unreachable
    if (isSupabaseConfigured()) {
      return dbService.getBookingByManagementToken(token);
    }

    return null;
  },

  /**
   * Reschedule appointment via backend (which verifies conflicts and Google Calendar)
   */
  async rescheduleBooking(token, newDate, newTime) {
    if (!token || !newDate || !newTime) {
      throw new Error('Date and time are required for rescheduling.');
    }

    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/public/bookings/manage/${encodeURIComponent(token)}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ newDate, newTime }),
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Failed to reschedule appointment');
    }
    return result;
  },

  /**
   * Cancel appointment via backend (which checks cancellation policy window)
   */
  async cancelBooking(token) {
    if (!token) throw new Error('Management token is required');
    const apiBase = getApiBase();

    const res = await fetch(`${apiBase}/public/bookings/manage/${encodeURIComponent(token)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Failed to cancel appointment');
    }
    return result;
  },
};
