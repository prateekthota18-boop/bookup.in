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
    try {
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
    } catch (apiErr) {
      // If network failure and Supabase configured, attempt fallback
      if (isSupabaseConfigured() && !apiErr.message.includes('cannot be rescheduled')) {
        const [h, m] = newTime.split(':').map(Number);
        const endMinutes = h * 60 + m + 60; // default duration
        const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
        await dbService.rescheduleBooking(token, newDate, newTime, endTime);
        return { success: true };
      }
      throw apiErr;
    }
  },

  /**
   * Cancel appointment via backend (which checks cancellation policy window)
   */
  async cancelBooking(token) {
    if (!token) throw new Error('Management token is required');
    const apiBase = getApiBase();

    try {
      const res = await fetch(`${apiBase}/public/bookings/manage/${encodeURIComponent(token)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to cancel appointment');
      }
      return result;
    } catch (apiErr) {
      if (isSupabaseConfigured()) {
        await dbService.updateBookingStatus(token, 'cancelled');
        return { success: true, status: 'cancelled' };
      }
      throw apiErr;
    }
  },
};
