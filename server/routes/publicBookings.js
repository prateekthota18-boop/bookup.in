/**
 * BookUp — Public Customer Booking Management API
 *
 * Secure bearer-token management route for customers:
 * - GET  /api/public/bookings/manage/:token
 * - POST /api/public/bookings/manage/:token/reschedule
 * - POST /api/public/bookings/manage/:token/cancel
 *
 * Security:
 * - Authorizes access exclusively via cryptographically secure management token hash.
 * - Does not require customer authentication or login.
 * - Never exposes auth IDs, provider user_ids, database keys, or calendar credentials.
 * - Never logs raw management tokens.
 */

import { Router } from 'express';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { googleCalendarService } from '../services/googleCalendar.js';

const router = Router();

const DAYS_LIST = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// Backend Supabase client (using service role key if available, falling back to general key)
function getSupabaseClient() {
  const key = config.supabaseServiceRoleKey || config.supabaseKey;
  if (!config.supabaseUrl || !key) return null;
  return createClient(config.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * SHA-256 hash helper for management token
 */
function hashToken(token) {
  if (!token || typeof token !== 'string') return '';
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Internal helper to lookup booking strictly by token hash
 * (with fallback to notes mgmt_hash tag for pre-migration records)
 */
async function findBookingByToken(supabase, token) {
  if (!token || typeof token !== 'string') return null;
  const tokenHash = hashToken(token);
  if (!tokenHash) return null;

  let data = null;

  // 1. Check management_token_hash column (authoritative)
  try {
    const { data: hashColMatch, error: hashErr } = await supabase
      .from('bookings')
      .select('*, services (*), providers (*)')
      .eq('management_token_hash', tokenHash)
      .maybeSingle();
    if (!hashErr && hashColMatch) data = hashColMatch;
  } catch (_e) {
    // Column may be pending migration
  }

  // 2. Backward compatibility fallback: Check notes column for [mgmt_hash:<tokenHash>]
  if (!data) {
    try {
      const { data: noteMatch, error: noteErr } = await supabase
        .from('bookings')
        .select('*, services (*), providers (*)')
        .ilike('notes', `%[mgmt_hash:${tokenHash}]%`)
        .maybeSingle();
      if (!noteErr && noteMatch) data = noteMatch;
    } catch (_e) {
      // Notes query fallback
    }
  }

  return data;
}

/**
 * GET /api/public/bookings/manage/:token
 * Validates token and returns sanitized appointment projection.
 */
router.get('/:token', async (req, res) => {
  const { token } = req.params;

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Invalid management token provided' });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database service is unavailable' });
  }

  try {
    const bookingRow = await findBookingByToken(supabase, token);
    if (!bookingRow) {
      return res.status(404).json({ success: false, error: 'Appointment not found or invalid management link' });
    }

    const providerId = bookingRow.provider_id;
    const provider = bookingRow.providers || {};
    const service = bookingRow.services || {};

    // Parallel fetch of cancellation policies, active services, and availability
    const [policyRes, servicesRes, availRes] = await Promise.allSettled([
      supabase.from('cancellation_policies').select('*').eq('provider_id', providerId).maybeSingle(),
      supabase.from('services').select('id, name, duration, price, deposit_amount').eq('provider_id', providerId).eq('active', true),
      supabase.from('availability').select('*').eq('provider_id', providerId),
    ]);

    const policy = policyRes.status === 'fulfilled' ? policyRes.value?.data : null;
    const activeServices = servicesRes.status === 'fulfilled' ? (servicesRes.value?.data || []) : [];
    const rawAvail = availRes.status === 'fulfilled' ? (availRes.value?.data || []) : [];

    // Assemble schedule object
    const schedule = {};
    DAYS_LIST.forEach(d => {
      schedule[d] = { available: d !== 'sunday', start: '09:00', end: '18:00' };
    });
    if (rawAvail && rawAvail.length > 0) {
      rawAvail.forEach(row => {
        const day = row.day_of_week?.toLowerCase();
        if (day && schedule[day]) {
          schedule[day] = {
            available: Boolean(row.active),
            start: row.start_time ? String(row.start_time).substring(0, 5) : '09:00',
            end: row.end_time ? String(row.end_time).substring(0, 5) : '18:00',
          };
        }
      });
    }

    const cleanNotes = (bookingRow.notes || '').replace(/\[mgmt_hash:[^\]]+\]/g, '').trim();
    const managementUrl = `${(config.frontendUrl || 'https://bookup-in.vercel.app').replace(/\/$/, '')}/manage/${encodeURIComponent(token)}`;

    // Return sanitized customer-facing projection (no internal keys or user IDs)
    return res.json({
      success: true,
      booking: {
        id: bookingRow.id,
        customerName: bookingRow.customer_name,
        customerPhone: bookingRow.customer_phone,
        customerWhatsApp: bookingRow.customer_whatsapp || bookingRow.customer_phone,
        customerEmail: bookingRow.customer_email || '',
        date: bookingRow.booking_date,
        startTime: String(bookingRow.start_time).substring(0, 5),
        endTime: String(bookingRow.end_time).substring(0, 5),
        duration: Number(bookingRow.duration) || 60,
        price: Number(bookingRow.price) || 0,
        depositAmount: Number(bookingRow.deposit_amount) || 0,
        depositStatus: bookingRow.deposit_status || 'paid',
        status: bookingRow.status,
        notes: cleanNotes,
        managementUrl,
        mode: 'In-person / Online',
      },
      provider: {
        id: provider.id,
        name: provider.name || 'Provider',
        businessName: provider.business_name || '',
        slug: provider.slug || 'provider',
        timezone: provider.timezone || 'Asia/Kolkata',
        bufferTime: provider.buffer_time ?? 15,
        minNotice: provider.min_notice ?? 2,
        maxAdvanceBooking: provider.max_advance_booking ?? 30,
      },
      service: {
        id: service.id,
        name: service.name || 'Session',
        duration: Number(service.duration) || 60,
        price: Number(service.price) || 0,
        depositAmount: Number(service.deposit_amount) || 0,
      },
      cancellationPolicy: {
        cancellationWindow: policy?.cancellation_window ?? 12,
        lateCancellationFee: Number(policy?.fee ?? 200),
        policyText: policy?.policy_text || '',
      },
      availability: {
        schedule,
        bufferTime: provider.buffer_time ?? 15,
        minNotice: provider.min_notice ?? 2,
        maxAdvanceBooking: provider.max_advance_booking ?? 30,
      },
      services: activeServices.map(s => ({
        id: s.id,
        name: s.name,
        duration: Number(s.duration) || 60,
        price: Number(s.price) || 0,
        depositAmount: Number(s.deposit_amount) || 0,
      })),
      isManageable: bookingRow.status === 'confirmed',
    });
  } catch (err) {
    console.error('Error fetching customer booking by token:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to retrieve booking information' });
  }
});

/**
 * POST /api/public/bookings/manage/:token/reschedule
 * Reschedules appointment after authoritative server-side slot and conflict verification.
 */
router.post('/:token/reschedule', async (req, res) => {
  const { token } = req.params;
  const { newDate, newTime } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, error: 'Invalid management token' });
  }

  if (!newDate || !newTime || !/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !/^\d{2}:\d{2}$/.test(newTime)) {
    return res.status(400).json({ success: false, error: 'Valid newDate (YYYY-MM-DD) and newTime (HH:mm) are required' });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database service unavailable' });
  }

  try {
    const booking = await findBookingByToken(supabase, token);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }

    // Restriction: Cancelled or completed bookings cannot be rescheduled
    if (booking.status === 'cancelled' || booking.status === 'late-cancellation') {
      return res.status(400).json({ success: false, error: 'Cancelled appointments cannot be rescheduled.' });
    }
    if (booking.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Completed appointments cannot be rescheduled.' });
    }

    const providerId = booking.provider_id;
    const duration = Number(booking.duration) || 60;
    const provider = booking.providers || {};
    const buffer = provider.buffer_time ?? 15;

    const [h, m] = newTime.split(':').map(Number);
    const startMin = h * 60 + m;
    const endMin = startMin + duration;
    const newEndTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

    // 1. Authoritative overlap conflict check against other confirmed bookings
    const { data: existingBookings, error: ebErr } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, actual_end_time, status')
      .eq('provider_id', providerId)
      .eq('booking_date', newDate)
      .neq('id', booking.id)
      .in('status', ['confirmed', 'completed']);

    if (ebErr) throw ebErr;

    const candStart = startMin;
    const candEnd = endMin + buffer;

    const hasConflict = existingBookings?.some(eb => {
      const ebStart = eb.start_time ? Number(eb.start_time.split(':')[0]) * 60 + Number(eb.start_time.split(':')[1]) : 0;
      const ebEndRaw = eb.actual_end_time || eb.end_time;
      const ebEnd = ebEndRaw ? Number(ebEndRaw.split(':')[0]) * 60 + Number(ebEndRaw.split(':')[1]) : ebStart + 60;
      const ebEndWithBuf = ebEnd + buffer;
      return candStart < ebEndWithBuf && candEnd > ebStart;
    });

    if (hasConflict) {
      return res.status(409).json({ success: false, error: 'Selected time slot is no longer available. Please select another slot.' });
    }

    // 2. Google Calendar busy intervals check when connected
    try {
      const tz = provider.timezone || 'Asia/Kolkata';
      const gcalBusy = await googleCalendarService.getBusyIntervals(providerId, newDate, tz);
      if (gcalBusy?.connected && Array.isArray(gcalBusy.busyTimes) && gcalBusy.busyTimes.length > 0) {
        const conflictsWithGcal = gcalBusy.busyTimes.some(b => {
          const bStart = Number(b.start.split(':')[0]) * 60 + Number(b.start.split(':')[1]);
          const bEnd = Number(b.end.split(':')[0]) * 60 + Number(b.end.split(':')[1]);
          return startMin < bEnd && endMin > bStart;
        });

        if (conflictsWithGcal) {
          return res.status(409).json({ success: false, error: 'Selected time slot conflicts with provider calendar.' });
        }
      }
    } catch (_gcalErr) {
      // Non-blocking fallback if calendar provider service is unreachable
    }

    // 3. Persist update in Supabase (preserving exact same management token / hash)
    const { error: updateErr } = await supabase
      .from('bookings')
      .update({
        booking_date: newDate,
        start_time: newTime,
        end_time: newEndTime,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id);

    if (updateErr) throw updateErr;

    return res.json({
      success: true,
      message: 'Appointment rescheduled successfully.',
      booking: {
        id: booking.id,
        date: newDate,
        startTime: newTime,
        endTime: newEndTime,
        duration,
        status: booking.status,
      },
    });
  } catch (err) {
    console.error('Error rescheduling booking:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to reschedule appointment. Please try again.' });
  }
});

/**
 * POST /api/public/bookings/manage/:token/cancel
 * Evaluates policy window, updates appointment to cancelled / late-cancellation.
 */
router.post('/:token/cancel', async (req, res) => {
  const { token } = req.params;

  if (!token) {
    return res.status(400).json({ success: false, error: 'Invalid management token' });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database service unavailable' });
  }

  try {
    const booking = await findBookingByToken(supabase, token);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }

    // If already cancelled, return state idempotently
    if (booking.status === 'cancelled' || booking.status === 'late-cancellation') {
      return res.json({
        success: true,
        alreadyCancelled: true,
        status: booking.status,
      });
    }

    // Evaluate policy window
    const { data: policy } = await supabase
      .from('cancellation_policies')
      .select('cancellation_window, fee')
      .eq('provider_id', booking.provider_id)
      .maybeSingle();

    const cancellationWindow = policy?.cancellation_window ?? 12;
    let isWithinFreeWindow = true;

    try {
      const aptTime = new Date(`${booking.booking_date}T${booking.start_time}`).getTime();
      const hoursNotice = (aptTime - Date.now()) / (1000 * 60 * 60);
      isWithinFreeWindow = hoursNotice >= cancellationWindow;
    } catch (_e) {
      isWithinFreeWindow = true;
    }

    const newStatus = isWithinFreeWindow ? 'cancelled' : 'late-cancellation';

    const { error: updateErr } = await supabase
      .from('bookings')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id);

    if (updateErr) throw updateErr;

    return res.json({
      success: true,
      status: newStatus,
      isWithinFreeWindow,
      depositAmount: Number(booking.deposit_amount) || 0,
      message: isWithinFreeWindow
        ? 'Appointment cancelled within free cancellation period. Deposit will be refunded.'
        : 'Appointment cancelled within late-cancellation window. Deposit forfeited according to policy.',
    });
  } catch (err) {
    console.error('Error cancelling booking:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to cancel appointment. Please try again.' });
  }
});

export default router;
