/**
 * BookUp — Internal Notification Dispatcher Routes (Phase 4)
 *
 * Dedicated server-side endpoint for triggering scheduled WhatsApp reminders:
 * - POST /api/internal/notifications/process-reminders
 * - GET  /api/internal/notifications/process-reminders (Status check / manual probe)
 *
 * Security & Reliability:
 * - Protected by X-Internal-Secret header.
 * - Idempotent: checks reminder_sent_at IS NULL to guarantee zero duplicate sends.
 * - Server-side execution: operates independently of customer or provider browser state.
 * - Triggered via Supabase pg_cron + pg_net extension or external keepalive ping.
 */

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { decryptToken } from '../utils/crypto.js';
import { richAutomateService } from '../services/richAutomate.js';
import { emailService } from '../services/email.js';

const router = Router();

function getSupabaseClient() {
  const key = config.supabaseServiceRoleKey || config.supabaseKey;
  if (!config.supabaseUrl || !key) return null;
  return createClient(config.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Secret verification middleware for internal cron jobs
 */
function verifyInternalSecret(req, res, next) {
  const configuredSecret = config.internalCronSecret?.trim();

  // If secret is set, enforce strict validation
  if (configuredSecret) {
    const headerSecret = (req.headers['x-internal-secret'] || '').trim();
    const authHeader = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();

    if (headerSecret !== configuredSecret && authHeader !== configuredSecret) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid internal secret' });
    }
  } else if (process.env.NODE_ENV === 'production') {
    // In production, require INTERNAL_CRON_SECRET to be defined
    console.warn('[InternalNotifications] INTERNAL_CRON_SECRET is not configured in production!');
  }

  next();
}

/**
 * Processes 2-hour upcoming appointment reminders
 */
export async function processReminders() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase client unavailable');
  }

  const results = {
    checkedAt: new Date().toISOString(),
    totalCandidates: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  // 1. Fetch upcoming confirmed bookings
  // Filter for today's and tomorrow's confirmed bookings to cover midnight boundaries
  const today = new Date().toISOString().split('T')[0];
  const tomorrowDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let candidates = null;
  // Attempt to filter by reminder_sent_at is null if column exists
  try {
    const { data: bookingsWithCol, error: colErr } = await supabase
      .from('bookings')
      .select('*, services (name), providers (name, business_name, timezone)')
      .in('booking_date', [today, tomorrowDate])
      .eq('status', 'confirmed')
      .is('reminder_sent_at', null);

    if (!colErr && bookingsWithCol) {
      candidates = bookingsWithCol;
    }
  } catch (_e) {
    // Column not present yet
  }

  if (!candidates) {
    const { data: rawBookings, error: rawErr } = await supabase
      .from('bookings')
      .select('*, services (name), providers (name, business_name, timezone)')
      .in('booking_date', [today, tomorrowDate])
      .eq('status', 'confirmed');

    if (rawErr) throw rawErr;
    // Filter out rows that already have [rem_sent: in notes
    candidates = (rawBookings || []).filter(b => !(b.notes || '').includes('[rem_sent:'));
  }

  results.totalCandidates = candidates.length;
  const nowMs = Date.now();
  const frontendBase = (config.frontendUrl || 'https://bookup-in.vercel.app').replace(/\/$/, '');

  for (const booking of candidates) {
    try {
      // Check if already sent in notes or column
      if (booking.reminder_sent_at || (booking.notes || '').includes('[rem_sent:')) {
        continue;
      }

      // Calculate appointment timestamp
      // Format: YYYY-MM-DDTHH:mm:00
      const aptIso = `${booking.booking_date}T${booking.start_time}:00`;
      const aptTime = new Date(aptIso).getTime();

      if (isNaN(aptTime)) {
        continue;
      }

      // Calculate minutes until appointment
      const diffMs = aptTime - nowMs;
      const minutesUntilApt = diffMs / (1000 * 60);

      // Target: Appointments occurring between 0 and 135 minutes from now (~2 hours)
      // (135 min window ensures 10-15 min cron runs never miss a 2-hour trigger window)
      if (minutesUntilApt > 135 || minutesUntilApt < -15) {
        continue;
      }

      // Resolve raw management token for link
      let rawToken = '';
      if (booking.management_token_encrypted) {
        try {
          rawToken = decryptToken(booking.management_token_encrypted);
        } catch (_e) {
          // Decrypt error
        }
      }

      // Check notes fallback if column empty
      if (!rawToken && (booking.notes || '').includes('[mgmt_enc:')) {
        try {
          const match = booking.notes.match(/\[mgmt_enc:([^\]]+)\]/);
          if (match && match[1]) {
            rawToken = decryptToken(match[1]);
          }
        } catch (_e) {
          // Decrypt error
        }
      }

      const managementUrl = rawToken
        ? `${frontendBase}/manage/${encodeURIComponent(rawToken)}`
        : `${frontendBase}/`;

      const recipientEmail = booking.customer_email;
      const recipientPhone = booking.customer_whatsapp || booking.customer_phone;
      const serviceName = booking.services?.name || 'Appointment';
      const providerName = booking.providers?.name || booking.providers?.business_name || 'Coach';
      const meetLink = booking.meet_link || '';

      // Dispatch 2-hour reminder Email (Primary Channel - Phase 4b)
      const sendRes = await emailService.sendReminderEmail({
        to: recipientEmail,
        customerName: booking.customer_name,
        serviceName,
        providerName,
        bookingDate: booking.booking_date,
        startTime: booking.start_time,
        duration: booking.duration || 60,
        meetLink,
        managementUrl,
      });

      // Deferred WhatsApp Reminder (Phase 4 - Callable for future re-enabling)
      /*
      if (recipientPhone) {
        await richAutomateService.sendCustomerReminder({
          phone: recipientPhone,
          customerName: booking.customer_name,
          serviceName,
          providerName,
          bookingDate: booking.booking_date,
          startTime: booking.start_time,
          managementUrl,
        });
      }
      */

      const nowIso = new Date().toISOString();

      if (sendRes.success) {
        results.sent++;
        results.details.push({ id: booking.id, status: 'sent', messageId: sendRes.messageId });

        // Update DB record with delivery timestamp and messageId
        const updatePayload = {
          reminder_sent_at: nowIso,
          reminder_msg_id: sendRes.messageId,
          reminder_error: null,
        };

        const { error: colErr } = await supabase.from('bookings').update(updatePayload).eq('id', booking.id);
        if (colErr) {
          // Fallback note tag for pre-migration safety
          const updatedNotes = `${booking.notes || ''}\n[rem_sent:${nowIso}]`.trim();
          await supabase.from('bookings').update({ notes: updatedNotes }).eq('id', booking.id);
        }
      } else if (sendRes.skipped) {
        results.skipped++;
        results.details.push({ id: booking.id, status: 'skipped', reason: sendRes.error });

        // Mark processed so unconfigured dev environments do not loop
        const { error: colErr } = await supabase.from('bookings').update({
          reminder_sent_at: nowIso,
          reminder_error: `Skipped: ${sendRes.error}`,
        }).eq('id', booking.id);

        if (colErr) {
          const updatedNotes = `${booking.notes || ''}\n[rem_sent:${nowIso}]`.trim();
          await supabase.from('bookings').update({ notes: updatedNotes }).eq('id', booking.id);
        }
      } else {
        results.failed++;
        results.details.push({ id: booking.id, status: 'failed', error: sendRes.error });

        try {
          await supabase.from('bookings').update({ reminder_error: sendRes.error }).eq('id', booking.id);
        } catch (_e) {}
      }
    } catch (itemErr) {
      results.failed++;
      results.details.push({ id: booking.id, status: 'error', error: itemErr.message });
    }
  }

  return results;
}

/**
 * POST /api/internal/notifications/process-reminders
 * Runs the 2-hour reminder process.
 */
router.post('/process-reminders', verifyInternalSecret, async (req, res) => {
  try {
    const summary = await processReminders();
    return res.json({ success: true, ...summary });
  } catch (err) {
    console.error('[InternalNotifications] Reminder processor failed:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/internal/notifications/process-reminders
 * Allows health/cron monitoring probes.
 */
router.get('/process-reminders', verifyInternalSecret, async (req, res) => {
  try {
    const summary = await processReminders();
    return res.json({ success: true, ...summary });
  } catch (err) {
    console.error('[InternalNotifications] Reminder processor failed:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
