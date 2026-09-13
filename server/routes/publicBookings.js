/**
 * BookUp — Public Customer Booking Management & Booking Creation API (Phase 4)
 *
 * Public Customer Endpoints:
 * - POST /api/public/bookings                         (Create booking + synchronous WhatsApp notifications)
 * - POST /api/public/bookings/create                  (Alias for booking creation)
 * - GET  /api/public/bookings/manage/:token           (Retrieve appointment by secure token)
 * - POST /api/public/bookings/manage/:token/reschedule (Reschedule appointment + reset reminder)
 * - POST /api/public/bookings/manage/:token/cancel    (Cancel appointment)
 *
 * Security:
 * - Authorizes access exclusively via cryptographically secure management token hash.
 * - Does not require customer authentication or login.
 * - Never exposes auth IDs, provider user_ids, database keys, or calendar credentials.
 * - Never logs raw management tokens.
 * - Dual persistence support: stores management_token_hash / management_token_encrypted
 *   in dedicated columns when available, with notes fallback for pre-migration safety.
 * - WhatsApp failures are safely caught and NEVER alter or roll back the booking.
 */

import { Router } from 'express';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { encryptToken, decryptToken } from '../utils/crypto.js';
import { googleCalendarService } from '../services/googleCalendar.js';
import { richAutomateService } from '../services/richAutomate.js';
import { emailService } from '../services/email.js';

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
export function hashToken(token) {
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
 * POST /api/public/bookings (or /api/public/bookings/create)
 * Authoritative booking creation with conflict detection and synchronous WhatsApp notifications.
 */
async function handleCreateBooking(req, res) {
  const {
    providerId,
    serviceId,
    customerName,
    customerEmail,
    customerPhone,
    customerWhatsApp,
    bookingDate,
    startTime,
    notes = '',
    managementToken: providedToken,
  } = req.body;

  if (!providerId || !serviceId || !customerName || !customerPhone || !bookingDate || !startTime) {
    return res.status(400).json({
      success: false,
      error: 'Missing required booking fields (providerId, serviceId, customerName, customerPhone, bookingDate, startTime)',
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || !/^\d{2}:\d{2}$/.test(startTime)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid date (YYYY-MM-DD) or time (HH:mm) format',
    });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database service is unavailable' });
  }

  try {
    // 1. Fetch Authoritative Service Details
    const { data: service, error: svcErr } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .eq('provider_id', providerId)
      .eq('active', true)
      .single();

    if (svcErr || !service) {
      console.error('[PublicBookings] Service verification failed:', {
        serviceId,
        providerId,
        svcErr: svcErr ? { message: svcErr.message, code: svcErr.code, details: svcErr.details, hint: svcErr.hint } : null,
        serviceFound: Boolean(service),
      });
      return res.status(400).json({
        success: false,
        error: svcErr ? `Database error during service lookup: ${svcErr.message}` : 'Invalid or inactive service',
        dbError: svcErr?.message,
        dbCode: svcErr?.code,
        dbDetails: svcErr?.details,
      });
    }

    // 2. Fetch Authoritative Provider Details
    const { data: provider, error: provErr } = await supabase
      .from('providers')
      .select('*')
      .eq('id', providerId)
      .single();

    if (provErr || !provider) {
      console.error('[PublicBookings] Provider verification failed:', {
        providerId,
        provErr: provErr ? { message: provErr.message, code: provErr.code, details: provErr.details } : null,
        providerFound: Boolean(provider),
      });
      return res.status(400).json({
        success: false,
        error: provErr ? `Database error during provider lookup: ${provErr.message}` : 'Provider not found',
        dbError: provErr?.message,
        dbCode: provErr?.code,
        dbDetails: provErr?.details,
      });
    }

    const duration = Number(service.duration) || 60;
    const buffer = provider.buffer_time ?? 15;

    const [h, m] = startTime.split(':').map(Number);
    const startMin = h * 60 + m;
    const endMin = startMin + duration;
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

    const candStart = startMin;
    const candEnd = endMin + buffer;

    // 3. Authoritative Overlap Conflict Check
    let existingBookings = [];
    try {
      const { data: ebData, error: ebErr } = await supabase
        .from('bookings')
        .select('id, start_time, end_time, actual_end_time, status')
        .eq('provider_id', providerId)
        .eq('booking_date', bookingDate)
        .in('status', ['confirmed', 'completed']);

      if (!ebErr && Array.isArray(ebData)) {
        existingBookings = ebData;
      } else if (ebErr) {
        console.warn('[PublicBookings] Direct bookings table select restricted, trying get_provider_busy_slots RPC:', ebErr.message);
      }
    } catch (_e) {}

    // Fallback to security-definer RPC function if direct SELECT on bookings is restricted for anon
    if (!existingBookings || existingBookings.length === 0) {
      try {
        const { data: rpcSlots, error: rpcErr } = await supabase.rpc('get_provider_busy_slots', {
          p_provider_id: providerId,
          p_booking_date: bookingDate,
        });
        if (!rpcErr && Array.isArray(rpcSlots)) {
          existingBookings = rpcSlots;
        }
      } catch (_rpcErr) {}
    }

    const conflict = existingBookings.some(eb => {
      const ebStart = eb.start_time ? Number(eb.start_time.split(':')[0]) * 60 + Number(eb.start_time.split(':')[1]) : 0;
      const ebEndRaw = eb.actual_end_time || eb.end_time;
      const ebEnd = ebEndRaw ? Number(ebEndRaw.split(':')[0]) * 60 + Number(ebEndRaw.split(':')[1]) : ebStart + 60;
      const ebEndWithBuf = ebEnd + buffer;
      return candStart < ebEndWithBuf && candEnd > ebStart;
    });

    if (conflict) {
      return res.status(409).json({
        success: false,
        error: 'This slot is no longer available. Please select another time.',
      });
    }

    // 4. Google Calendar busy intervals conflict check
    try {
      const tz = provider.timezone || 'Asia/Kolkata';
      const gcalBusy = await googleCalendarService.getBusyIntervals(providerId, bookingDate, tz);
      if (gcalBusy?.connected && Array.isArray(gcalBusy.busyTimes) && gcalBusy.busyTimes.length > 0) {
        const conflictsWithGcal = gcalBusy.busyTimes.some(b => {
          const bStart = Number(b.start.split(':')[0]) * 60 + Number(b.start.split(':')[1]);
          const bEnd = Number(b.end.split(':')[0]) * 60 + Number(b.end.split(':')[1]);
          return startMin < bEnd && endMin > bStart;
        });

        if (conflictsWithGcal) {
          return res.status(409).json({
            success: false,
            error: 'Selected time slot conflicts with provider calendar.',
          });
        }
      }
    } catch (_gcalErr) {
      // Non-blocking fallback if calendar provider service is unreachable
    }

    // 5. Generate or use management token
    const rawToken = (providedToken && typeof providedToken === 'string' && providedToken.trim().length >= 16)
      ? providedToken.trim()
      : crypto.randomBytes(24).toString('hex');
    const tokenHash = hashToken(rawToken);
    const tokenEncrypted = encryptToken(rawToken);

    // 6. Upsert Customer Record
    let customerId = null;
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', customerPhone.trim())
      .maybeSingle();

    if (existingCustomer?.id) {
      customerId = existingCustomer.id;
      try {
        await supabase
          .from('customers')
          .update({
            name: customerName.trim(),
            email: customerEmail?.trim() || '',
            whatsapp: (customerWhatsApp || customerPhone).trim(),
          })
          .eq('id', customerId);
      } catch (_e) {}
    } else {
      const { data: newCustomer, error: custErr } = await supabase
        .from('customers')
        .insert({
          name: customerName.trim(),
          email: customerEmail?.trim() || '',
          phone: customerPhone.trim(),
          whatsapp: (customerWhatsApp || customerPhone).trim(),
        })
        .select('id')
        .single();
      if (!custErr && newCustomer) {
        customerId = newCustomer.id;
      }
    }

    // 7. Assemble insert payload with dual persistence (columns + notes fallback)
    const baseNotes = notes ? notes.trim() : '';
    const encodedNotes = `${baseNotes}\n[mgmt_hash:${tokenHash}]\n[mgmt_enc:${tokenEncrypted}]`.trim();

    const insertPayload = {
      provider_id: providerId,
      service_id: service.id,
      customer_id: customerId,
      customer_name: customerName.trim(),
      customer_email: customerEmail?.trim() || '',
      customer_phone: customerPhone.trim(),
      customer_whatsapp: (customerWhatsApp || customerPhone).trim(),
      booking_date: bookingDate,
      start_time: startTime,
      end_time: endTime,
      duration,
      price: Number(service.price) || 0,
      deposit_amount: Number(service.deposit_amount) || 0,
      deposit_status: 'na',
      status: 'confirmed',
      notes: encodedNotes,
    };

    // Attempt insert with migration columns first
    let newBooking = null;
    let insertErr = null;

    try {
      const fullPayload = {
        ...insertPayload,
        management_token_hash: tokenHash,
        management_token_encrypted: tokenEncrypted,
      };
      const res = await supabase.from('bookings').insert(fullPayload).select().single();
      newBooking = res.data;
      insertErr = res.error;
    } catch (err) {
      insertErr = err;
    }

    // If column doesn't exist yet (pre-migration), fall back to insert without columns
    if (insertErr || !newBooking) {
      const fallbackRes = await supabase.from('bookings').insert(insertPayload).select().single();
      if (fallbackRes.error || !fallbackRes.data) {
        throw new Error(fallbackRes.error?.message || insertErr?.message || 'Failed to insert booking');
      }
      newBooking = fallbackRes.data;
    }

    // 7b. SYNCHRONOUS GOOGLE MEET LINK & CALENDAR EVENT GENERATION
    // Synchronously generate calendar event + Google Meet link before confirmation emails are sent.
    let meetLink = null;
    let googleEventId = null;

    try {
      const gcalBooking = {
        id: newBooking.id,
        date: bookingDate,
        startTime,
        endTime,
        duration,
        serviceName: service.name,
        customerName: insertPayload.customer_name,
        customerEmail: insertPayload.customer_email,
        customerPhone: insertPayload.customer_phone,
        price: insertPayload.price,
        depositStatus: insertPayload.deposit_status,
        notes,
      };

      const gcalRes = await googleCalendarService.createEvent(
        providerId,
        gcalBooking,
        provider.timezone || 'Asia/Kolkata'
      );

      if (gcalRes?.success && gcalRes.eventId) {
        googleEventId = gcalRes.eventId;
        meetLink = gcalRes.meetLink || null;

        // Persist meet_link to database
        if (meetLink) {
          try {
            await supabase.from('bookings').update({ meet_link: meetLink }).eq('id', newBooking.id);
          } catch (_dbErr) {
            console.warn('[PublicBookings] Failed to persist meet_link:', _dbErr.message);
          }
        }

        // Persist google_event_id if column exists
        if (googleEventId) {
          try {
            await supabase.from('bookings').update({ google_event_id: googleEventId }).eq('id', newBooking.id);
          } catch (_e) {
            // Non-fatal if google_event_id column is pending migration
          }
        }
      }
    } catch (gcalErr) {
      // Non-blocking: Meet link generation failure must NEVER cancel, block, or roll back a booking
      console.warn('[PublicBookings] Google Calendar/Meet link generation non-blocking error:', gcalErr.message);
    }

    // 8. SYNCHRONOUS SERVER-SIDE EMAIL NOTIFICATIONS (PRIMARY CHANNEL - Phase 4b)
    const frontendBase = (config.frontendUrl || 'https://bookup-in.vercel.app').replace(/\/$/, '');
    const managementUrl = `${frontendBase}/manage/${encodeURIComponent(rawToken)}`;

    let customerEmailMsgId = null;
    let customerEmailError = null;
    let providerEmailMsgId = null;
    let providerEmailError = null;

    try {
      const [customerEmailSend, providerEmailSend] = await Promise.allSettled([
        insertPayload.customer_email
          ? emailService.sendCustomerConfirmationEmail({
              to: insertPayload.customer_email,
              customerName: insertPayload.customer_name,
              serviceName: service.name,
              providerName: provider.name || provider.business_name || 'Coach',
              bookingDate,
              startTime,
              duration,
              meetLink,
              managementUrl,
              bookingId: newBooking.id,
              timeZone: provider.timezone || 'Asia/Kolkata',
            })
          : Promise.resolve({ success: false, skipped: true, error: 'Customer email not provided' }),
        provider.email
          ? emailService.sendProviderNotificationEmail({
              to: provider.email,
              providerName: provider.name || provider.business_name || 'Coach',
              customerName: insertPayload.customer_name,
              customerEmail: insertPayload.customer_email,
              customerPhone: insertPayload.customer_phone,
              serviceName: service.name,
              bookingDate,
              startTime,
              duration,
              meetLink,
            })
          : Promise.resolve({ success: false, skipped: true, error: 'Provider email not configured' }),
      ]);

      if (customerEmailSend.status === 'fulfilled' && customerEmailSend.value?.success) {
        customerEmailMsgId = customerEmailSend.value.messageId || null;
      } else if (customerEmailSend.status === 'fulfilled') {
        customerEmailError = customerEmailSend.value?.error || null;
      } else {
        customerEmailError = customerEmailSend.reason?.message || 'Customer confirmation email dispatch failed';
      }

      if (providerEmailSend.status === 'fulfilled' && providerEmailSend.value?.success) {
        providerEmailMsgId = providerEmailSend.value.messageId || null;
      } else if (providerEmailSend.status === 'fulfilled' && !providerEmailSend.value?.skipped) {
        providerEmailError = providerEmailSend.value?.error || null;
      }

      // Record email dispatch results in Supabase
      const emailUpdateData = {};
      if (customerEmailMsgId) {
        emailUpdateData.customer_confirmation_email_sent_at = new Date().toISOString();
        emailUpdateData.customer_confirmation_email_msg_id = customerEmailMsgId;
      } else if (customerEmailError) {
        emailUpdateData.customer_confirmation_email_error = customerEmailError;
      }

      if (providerEmailMsgId) {
        emailUpdateData.provider_notification_email_sent_at = new Date().toISOString();
        emailUpdateData.provider_notification_email_msg_id = providerEmailMsgId;
      } else if (providerEmailError) {
        emailUpdateData.provider_notification_email_error = providerEmailError;
      }

      if (Object.keys(emailUpdateData).length > 0) {
        try {
          await supabase.from('bookings').update(emailUpdateData).eq('id', newBooking.id);
        } catch (_e) {}
      }
    } catch (emailDispatchErr) {
      // Non-blocking: an email send failure must NEVER cancel, block, or roll back a booking
      console.warn('[PublicBookings] Email notification dispatch non-blocking error:', emailDispatchErr.message);
    }

    // 8b. WHATSAPP NOTIFICATIONS (RichAutomate - Phase 4)
    // Preserved and callable; deferred as primary channel until dedicated sender number is available.
    // To re-enable WhatsApp as secondary or parallel channel, uncomment the dispatch below:
    /*
    try {
      await Promise.allSettled([
        richAutomateService.sendCustomerConfirmation({
          phone: insertPayload.customer_whatsapp,
          customerName: insertPayload.customer_name,
          serviceName: service.name,
          providerName: provider.name || provider.business_name || 'Provider',
          bookingDate,
          startTime,
          duration,
          managementUrl,
        }),
        (provider.phone || provider.whatsapp)
          ? richAutomateService.sendProviderNotification({
              phone: provider.whatsapp || provider.phone,
              customerName: insertPayload.customer_name,
              serviceName: service.name,
              bookingDate,
              startTime,
              duration,
            })
          : Promise.resolve({ success: false, skipped: true }),
      ]);
    } catch (_waErr) {}
    */

    return res.status(201).json({
      success: true,
      bookingId: newBooking.id,
      endTime,
      price: service.price,
      depositAmount: service.deposit_amount || 0,
      managementToken: rawToken,
      managementUrl,
      meetLink: meetLink || null,
      email: {
        customerSent: Boolean(customerEmailMsgId),
        customerMessageId: customerEmailMsgId,
        customerError: customerEmailError,
        providerSent: Boolean(providerEmailMsgId),
        providerMessageId: providerEmailMsgId,
        providerError: providerEmailError,
      },
      whatsapp: {
        customerSent: false,
        skipped: true,
        channel: 'email_primary',
      },
    });
  } catch (err) {
    console.error('Error in handleCreateBooking:', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal booking creation error' });
  }
}

// Register creation routes
router.post('/', handleCreateBooking);
router.post('/create', handleCreateBooking);

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

    const cleanNotes = (bookingRow.notes || '')
      .replace(/\[mgmt_hash:[^\]]+\]/g, '')
      .replace(/\[mgmt_enc:[^\]]+\]/g, '')
      .trim();
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
        depositStatus: bookingRow.deposit_status || 'na',
        status: bookingRow.status,
        notes: cleanNotes,
        managementUrl,
        meetLink: bookingRow.meet_link || null,
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
 * Automatically resets reminder state so the 2-hour reminder will fire relative to NEW time.
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

    // 3. Persist update in Supabase (resetting reminder tracking fields)
    const updatePayload = {
      booking_date: newDate,
      start_time: newTime,
      end_time: newEndTime,
      updated_at: new Date().toISOString(),
    };

    // Attempt to reset reminder tracking columns if they exist
    const fullUpdatePayload = {
      ...updatePayload,
      reminder_sent_at: null,
      reminder_msg_id: null,
      reminder_error: null,
    };

    const { error: fullUpdateErr } = await supabase
      .from('bookings')
      .update(fullUpdatePayload)
      .eq('id', booking.id);

    if (fullUpdateErr) {
      // Fallback if columns pending migration: update base fields and reset reminder tag in notes
      const cleanedNotes = (booking.notes || '').replace(/\[rem_sent:[^\]]+\]/g, '').trim();
      const { error: baseUpdateErr } = await supabase
        .from('bookings')
        .update({
          ...updatePayload,
          notes: cleanedNotes,
        })
        .eq('id', booking.id);

      if (baseUpdateErr) throw baseUpdateErr;
    }

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
      message: 'Appointment cancelled successfully.',
    });
  } catch (err) {
    console.error('Error cancelling booking:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to cancel appointment. Please try again.' });
  }
});

export default router;
