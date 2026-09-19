/**
 * Calup — Payment Verification Routes
 *
 * Endpoints for the manual "pay-the-coach-directly" flow:
 * - POST /api/public/bookings/manage/:token/mark-paid    (customer, token-authed)
 * - POST /api/bookings/:id/confirm-payment               (provider-authed)
 * - POST /api/bookings/:id/reject-payment                (provider-authed)
 *
 * Calup never touches money. Coach and customer settle payment directly (UPI).
 * Calup only tracks the verification state as metadata on top of existing
 * atomic slot reservations.
 *
 * Security:
 * - Customer endpoints authorize via cryptographic management token hash.
 * - Provider endpoints authorize via requireProviderAuth middleware (Supabase JWT).
 * - Transition guards enforce strict state machine: only allowed transitions pass.
 * - WhatsApp/Email notification failures are non-blocking (log and continue).
 */

import { Router } from 'express';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { config } from '../config.js';
import { requireProviderAuth, serviceRoleClient } from '../middleware/auth.js';
import { richAutomateService } from '../services/richAutomate.js';
import { emailService } from '../services/email.js';
import { googleCalendarService } from '../services/googleCalendar.js';
import { decryptToken } from '../utils/crypto.js';

const router = Router();

// Multer config: memory storage for screenshot uploads (max 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed.'));
    }
  },
});

// Backend Supabase client (service_role for bypassing RLS)
function getSupabaseClient() {
  if (serviceRoleClient) return serviceRoleClient;
  const key = config.supabaseServiceRoleKey || config.supabaseKey;
  if (!config.supabaseUrl || !key) return null;
  return createClient(config.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * SHA-256 hash helper for management token (reused from publicBookings.js pattern)
 */
function hashToken(token) {
  if (!token || typeof token !== 'string') return '';
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Internal helper to lookup booking by management token hash
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

  // 2. Backward compatibility fallback: notes column
  if (!data) {
    try {
      const { data: noteMatch, error: noteErr } = await supabase
        .from('bookings')
        .select('*, services (*), providers (*)')
        .ilike('notes', `%[mgmt_hash:${tokenHash}]%`)
        .maybeSingle();
      if (!noteErr && noteMatch) data = noteMatch;
    } catch (_e) {}
  }

  return data;
}

// =============================================================================
// CUSTOMER ENDPOINT: Mark Paid
// POST /api/public/bookings/manage/:token/mark-paid
// =============================================================================

router.post('/:token/mark-paid', upload.single('screenshot'), async (req, res) => {
  const { token } = req.params;

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Invalid management token' });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database service unavailable' });
  }

  try {
    const booking = await findBookingByToken(supabase, token);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Appointment not found or invalid management link' });
    }

    // Guard: only allowed from 'awaiting_payment'
    if (booking.payment_status !== 'awaiting_payment') {
      return res.status(400).json({
        success: false,
        error: `Payment cannot be marked as paid. Current payment status: ${booking.payment_status}`,
        currentPaymentStatus: booking.payment_status,
      });
    }

    // Handle optional screenshot upload to Supabase Storage
    let screenshotUrl = null;
    if (req.file) {
      try {
        const fileExt = req.file.mimetype === 'image/png' ? 'png'
          : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
        const fileName = `${booking.id}-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('payment-screenshots')
          .upload(fileName, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false,
          });

        if (uploadError) {
          console.warn('[PaymentVerification] Screenshot upload warning:', uploadError.message);
        } else {
          // For private buckets, generate a signed URL (valid for 7 days)
          const { data: signedData } = await supabase.storage
            .from('payment-screenshots')
            .createSignedUrl(fileName, 7 * 24 * 60 * 60);

          screenshotUrl = signedData?.signedUrl || null;

          // Also store the raw path for later re-signing by provider
          if (!screenshotUrl) {
            screenshotUrl = `payment-screenshots/${fileName}`;
          }
        }
      } catch (uploadErr) {
        console.warn('[PaymentVerification] Screenshot upload non-blocking error:', uploadErr.message);
      }
    }

    // Update booking
    const updatePayload = {
      payment_status: 'verification_pending',
      payment_marked_paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (screenshotUrl) {
      updatePayload.payment_screenshot_url = screenshotUrl;
    }

    const { error: updateErr } = await supabase
      .from('bookings')
      .update(updatePayload)
      .eq('id', booking.id);

    if (updateErr) {
      console.error('[PaymentVerification] Failed to update payment status:', updateErr);
      throw updateErr;
    }

    console.log(`[PaymentVerification] Booking ${booking.id} marked as paid by customer`);

    // Dispatch email notification to coach/owner with payment screenshot details (non-blocking)
    const providerEmail = booking.providers?.email || booking.provider_email;
    const providerName = booking.providers?.name || booking.providers?.business_name || 'Coach';
    const serviceName = booking.services?.name || booking.service_name || 'Session';
    const amount = booking.price || booking.services?.price || 0;
    const frontendBase = (config.frontendUrl || 'https://calup-in.vercel.app').replace(/\/$/, '');
    const dashboardUrl = `${frontendBase}/dashboard/appointments`;

    if (providerEmail) {
      emailService.sendPaymentSubmittedEmailToProvider({
        to: providerEmail,
        providerName,
        customerName: booking.customer_name,
        customerEmail: booking.customer_email,
        customerPhone: booking.customer_phone,
        serviceName,
        bookingDate: booking.booking_date,
        startTime: booking.start_time,
        amount,
        screenshotUrl,
        dashboardUrl,
      }).then((emailRes) => {
        if (!emailRes?.success && !emailRes?.skipped) {
          console.error(`[PaymentVerification] Failed to send payment submitted email. Provider: "${providerName}", Recipient: "${providerEmail}", Error: ${emailRes?.error || 'Unknown error'}`);
        }
      }).catch(mailErr => {
        console.error(`[PaymentVerification] Payment submitted email threw exception. Provider: "${providerName}", Recipient: "${providerEmail}", Error: ${mailErr.message || mailErr}`);
      });
    }

    return res.json({
      success: true,
      message: 'Payment marked as paid. Awaiting coach verification.',
      booking: {
        id: booking.id,
        paymentStatus: 'verification_pending',
        paymentMarkedPaidAt: updatePayload.payment_marked_paid_at,
        paymentScreenshotUrl: screenshotUrl,
      },
    });
  } catch (err) {
    console.error('[PaymentVerification] Error in mark-paid:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to update payment status. Please try again.' });
  }
});

// =============================================================================
// PROVIDER ENDPOINT: Confirm Payment
// POST /api/bookings/:id/confirm-payment
// =============================================================================

router.post('/:id/confirm-payment', requireProviderAuth, async (req, res) => {
  const { id: bookingId } = req.params;
  const providerId = req.providerId;

  if (!bookingId) {
    return res.status(400).json({ success: false, error: 'Booking ID is required' });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database service unavailable' });
  }

  try {
    // Fetch booking by ID — use select('*') without joins to avoid FK lookup failures
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();

    if (fetchErr) {
      console.error('[PaymentVerification] confirm-payment fetch error:', fetchErr.message, fetchErr.code);
    }

    if (!booking) {
      console.warn(`[PaymentVerification] confirm-payment: no booking found for id=${bookingId}`);
      return res.status(404).json({
        success: false,
        error: 'Booking not found or invalid booking reference.',
      });
    }

    // Guard: only allowed from 'verification_pending'
    if (booking.payment_status !== 'verification_pending') {
      return res.status(400).json({
        success: false,
        error: `Payment cannot be confirmed. Current payment status: ${booking.payment_status}`,
        currentPaymentStatus: booking.payment_status,
      });
    }

    // Update payment status
    const { error: updateErr } = await supabase
      .from('bookings')
      .update({
        payment_status: 'confirmed',
        payment_confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updateErr) {
      console.error('[PaymentVerification] Failed to confirm payment:', updateErr);
      throw updateErr;
    }

    console.log(`[PaymentVerification] Booking ${bookingId} payment confirmed by provider ${providerId}`);

    // Fetch related provider/service data for notifications (non-blocking, separate query)
    let provider = {};
    let service = {};
    try {
      const { data: enriched } = await supabase
        .from('bookings')
        .select('services (name), providers (name, business_name, phone, whatsapp, email, timezone)')
        .eq('id', bookingId)
        .maybeSingle();
      if (enriched) {
        provider = enriched.providers || {};
        service = enriched.services || {};
      }
    } catch (_e) {
      console.warn('[PaymentVerification] Non-blocking: could not enrich booking with provider/service data');
    }

    const providerName = provider.name || provider.business_name || 'Coach';
    const serviceName = service.name || 'Session';
    let meetLink = booking.meet_link || null;
    let googleEventId = booking.google_event_id || null;

    // 1. Google Calendar Event Creation: Create event if not already created
    if (!googleEventId) {
      try {
        const [startH, startM] = (booking.start_time || '00:00').split(':').map(Number);
        const durationMins = Number(booking.duration) || 60;
        const totalMins = (startH || 0) * 60 + (startM || 0) + durationMins;
        const calcEndH = String(Math.floor(totalMins / 60) % 24).padStart(2, '0');
        const calcEndM = String(totalMins % 60).padStart(2, '0');
        const endTime = booking.end_time || `${calcEndH}:${calcEndM}`;

        const gcalBooking = {
          id: booking.id,
          date: booking.booking_date,
          startTime: booking.start_time,
          endTime,
          duration: durationMins,
          serviceName,
          customerName: booking.customer_name || 'Client',
          customerEmail: booking.customer_email || '',
          customerPhone: booking.customer_phone || '',
          price: booking.price || 0,
          notes: booking.notes || '',
        };

        const gcalProviderId = booking.provider_id || req.providerId || providerId;
        const gcalRes = await googleCalendarService.createEvent(
          gcalProviderId,
          gcalBooking,
          provider.timezone || 'Asia/Kolkata'
        );

        if (gcalRes?.success && gcalRes.eventId) {
          googleEventId = gcalRes.eventId;
          meetLink = gcalRes.meetLink || meetLink;

          const calUpdate = { google_event_id: googleEventId };
          if (meetLink) calUpdate.meet_link = meetLink;
          try {
            await supabase.from('bookings').update(calUpdate).eq('id', bookingId);
          } catch (_e) {
            console.warn('[PaymentVerification] Could not persist google_event_id/meet_link to bookings:', _e.message);
          }
          console.log(`[PaymentVerification] Google Calendar event created successfully with Google Meet link. Provider: "${providerName}" (${gcalProviderId}), Event ID: ${googleEventId}, Meet Link: ${meetLink || 'none'}`);
        } else {
          const reason = gcalRes?.reason || 'api_error';
          console.error(`[PaymentVerification] Google Calendar event creation failed. Reason: "${reason}". Provider: "${providerName}" (${gcalProviderId}), Recipient: "${booking.customer_name}" (${booking.customer_email || 'no email'}), Details: ${gcalRes?.error || 'Unknown calendar error'}`);
        }
      } catch (gcalErr) {
        console.error(`[PaymentVerification] Google Calendar event creation exception. Reason: "api_error". Provider: "${providerName}" (${providerId}), Recipient: "${booking.customer_name}" (${booking.customer_email || 'no email'}), Error: ${gcalErr.message || gcalErr}`);
      }
    }

    // 2. Decrypt management token if available to construct customer management URL
    const frontendBase = (config.frontendUrl || 'https://calup-in.vercel.app').replace(/\/$/, '');
    let managementUrl = '';
    if (booking.management_token_encrypted) {
      try {
        const rawToken = decryptToken(booking.management_token_encrypted);
        if (rawToken) {
          managementUrl = `${frontendBase}/manage/${encodeURIComponent(rawToken)}`;
        }
      } catch (_decErr) {
        // Non-blocking fallback
      }
    }

    // 3. Non-blocking WhatsApp confirmation notification to customer
    const waRecipient = booking.customer_whatsapp || booking.customer_phone;
    try {
      if (waRecipient) {
        const waRes = await richAutomateService.sendCustomerConfirmation({
          phone: waRecipient,
          customerName: booking.customer_name || 'Valued Customer',
          serviceName,
          providerName,
          bookingDate: booking.booking_date,
          startTime: booking.start_time,
          duration: booking.duration,
          managementUrl,
        });
        if (!waRes?.success && !waRes?.skipped) {
          console.error(`[PaymentVerification] WhatsApp confirmation notification failed. Provider: "${providerName}", Recipient: "${waRecipient}", Error: ${waRes?.error || 'Unknown error'}`);
        }
      }
    } catch (waErr) {
      console.error(`[PaymentVerification] WhatsApp confirmation notification exception. Provider: "${providerName}", Recipient: "${waRecipient}", Error: ${waErr.message || waErr}`);
    }

    // 4. Non-blocking email confirmation notification to customer (with .ics attachment and Meet link)
    try {
      if (booking.customer_email) {
        const emailRes = await emailService.sendCustomerConfirmationEmail({
          to: booking.customer_email,
          customerName: booking.customer_name || 'Valued Customer',
          serviceName,
          providerName,
          bookingDate: booking.booking_date,
          startTime: booking.start_time,
          duration: booking.duration,
          meetLink: meetLink || booking.meet_link || null,
          managementUrl,
          bookingId: booking.id,
          timeZone: provider.timezone || 'Asia/Kolkata',
        });

        if (!emailRes?.success && !emailRes?.skipped) {
          console.error(`[PaymentVerification] Customer confirmation email failed. Provider: "${providerName}", Recipient: "${booking.customer_email}", Error: ${emailRes?.error || 'Unknown email failure'}`);
        } else if (emailRes?.success) {
          // Record sent timestamp
          try {
            await supabase.from('bookings').update({
              customer_confirmation_email_sent_at: new Date().toISOString(),
              customer_confirmation_email_msg_id: emailRes.messageId || null,
            }).eq('id', bookingId);
          } catch (_e) {}
        }
      }
    } catch (emailErr) {
      console.error(`[PaymentVerification] Customer confirmation email exception. Provider: "${providerName}", Recipient: "${booking.customer_email}", Error: ${emailErr.message || emailErr}`);
    }

    // 5. Non-blocking email confirmation notification to coach (with client details and Meet link)
    // Recipient hierarchy: provider.email -> booking.providers?.email -> req.provider?.email -> req.user?.email (auth fallback)
    const effectiveCoachProviderId = booking.provider_id || req.providerId || provider.id || 'unknown-provider';
    let coachEmail = provider.email || booking.providers?.email || req.provider?.email || req.user?.email;

    if (!coachEmail && supabase) {
      try {
        const { data: directProv } = await supabase
          .from('providers')
          .select('email, user_id')
          .eq('id', effectiveCoachProviderId)
          .maybeSingle();
        if (directProv?.email) {
          coachEmail = directProv.email;
        } else if (directProv?.user_id && supabase.auth?.admin?.getUserById) {
          const { data: authUser } = await supabase.auth.admin.getUserById(directProv.user_id);
          if (authUser?.user?.email) {
            coachEmail = authUser.user.email;
          }
        }
      } catch (_lookupErr) {}
    }

    if (!coachEmail) {
      console.error(`[PaymentVerification] Coach confirmation email recipient missing. Cannot send confirmation to coach. Provider ID: "${effectiveCoachProviderId}"`);
    } else {
      try {
        const coachEmailRes = await emailService.sendCoachBookingConfirmedEmail({
          to: coachEmail,
          providerName,
          customerName: booking.customer_name || 'Client',
          customerEmail: booking.customer_email || '',
          customerPhone: booking.customer_phone || '',
          serviceName,
          bookingDate: booking.booking_date,
          startTime: booking.start_time,
          duration: booking.duration,
          meetLink: meetLink || booking.meet_link || null,
        });

        if (!coachEmailRes?.success && !coachEmailRes?.skipped) {
          console.error(`[PaymentVerification] Coach confirmation email failed. Provider: "${providerName}", Recipient: "${coachEmail}", Error: ${coachEmailRes?.error || 'Unknown email failure'}`);
        }
      } catch (coachEmailErr) {
        console.error(`[PaymentVerification] Coach confirmation email exception. Provider: "${providerName}", Recipient: "${coachEmail}", Error: ${coachEmailErr.message || coachEmailErr}`);
      }
    }

    return res.json({
      success: true,
      message: 'Payment confirmed successfully.',
      booking: {
        id: bookingId,
        paymentStatus: 'confirmed',
        paymentConfirmedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[PaymentVerification] Error in confirm-payment:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to confirm payment. Please try again.' });
  }
});

// =============================================================================
// PROVIDER ENDPOINT: Reject Payment
// POST /api/bookings/:id/reject-payment
// =============================================================================

router.post('/:id/reject-payment', requireProviderAuth, async (req, res) => {
  const { id: bookingId } = req.params;
  const providerId = req.providerId;
  const { reason } = req.body || {};

  if (!bookingId) {
    return res.status(400).json({ success: false, error: 'Booking ID is required' });
  }

  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';

  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database service unavailable' });
  }

  try {
    // Fetch booking by ID — use select('*') without joins to avoid FK lookup failures
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();

    if (fetchErr) {
      console.error('[PaymentVerification] reject-payment fetch error:', fetchErr.message, fetchErr.code);
    }

    if (!booking) {
      console.warn(`[PaymentVerification] reject-payment: no booking found for id=${bookingId}`);
      return res.status(404).json({
        success: false,
        error: 'Booking not found or invalid booking reference.',
      });
    }

    // Guard: allowed from 'verification_pending' or 'awaiting_payment'
    if (!['verification_pending', 'awaiting_payment'].includes(booking.payment_status)) {
      return res.status(400).json({
        success: false,
        error: `Payment cannot be rejected. Current payment status: ${booking.payment_status}`,
        currentPaymentStatus: booking.payment_status,
      });
    }

    // Free the slot by cancelling the booking (same mechanism as existing cancellation)
    // AND set the payment rejection fields — single atomic update
    const { error: updateErr } = await supabase
      .from('bookings')
      .update({
        payment_status: 'rejected',
        payment_rejected_at: new Date().toISOString(),
        payment_rejected_reason: trimmedReason || null,
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updateErr) {
      console.error('[PaymentVerification] Failed to reject payment:', updateErr);
      throw updateErr;
    }

    console.log(`[PaymentVerification] Booking ${bookingId} payment rejected by provider ${providerId}. Reason: "${trimmedReason}". Slot freed.`);

    // Fetch related provider/service data for rejection notification (non-blocking)
    let provider = {};
    let service = {};
    try {
      const { data: enriched } = await supabase
        .from('bookings')
        .select('services (name), providers (name, business_name, phone, whatsapp, email)')
        .eq('id', bookingId)
        .maybeSingle();
      if (enriched) {
        provider = enriched.providers || {};
        service = enriched.services || {};
      }
    } catch (_e) {
      console.warn('[PaymentVerification] Non-blocking: could not enrich booking for reject-payment');
    }

    const providerName = provider.name || provider.business_name || 'Coach';
    const serviceName = service.name || booking.service_name || 'Session';

    // Delete Google Calendar event if one exists
    if (booking.google_event_id) {
      try {
        await googleCalendarService.deleteEvent(booking.provider_id || providerId, booking.google_event_id);
      } catch (delErr) {
        console.warn('[PaymentVerification] Non-blocking: calendar delete event warning upon rejection:', delErr.message);
      }
    }

    // Send customer rejection email
    if (booking.customer_email) {
      try {
        const rejectEmailRes = await emailService.sendPaymentRejectedEmailToCustomer({
          to: booking.customer_email,
          customerName: booking.customer_name || 'Valued Customer',
          serviceName,
          providerName,
          bookingDate: booking.booking_date,
          startTime: booking.start_time,
          providerEmail: provider.email || '',
          providerPhone: provider.phone || '',
          providerWhatsApp: provider.whatsapp || provider.phone || '',
          reason: trimmedReason,
        });

        if (!rejectEmailRes?.success && !rejectEmailRes?.skipped) {
          console.error(`[PaymentVerification] Payment rejection email failed. Provider: "${providerName}", Recipient: "${booking.customer_email}", Error: ${rejectEmailRes?.error || 'Unknown email failure'}`);
        }
      } catch (emailErr) {
        console.error(`[PaymentVerification] Payment rejection email exception. Provider: "${providerName}", Recipient: "${booking.customer_email}", Error: ${emailErr.message || emailErr}`);
      }
    }

    return res.json({
      success: true,
      message: 'Payment rejected. Booking has been cancelled and the time slot is now available.',
      booking: {
        id: bookingId,
        paymentStatus: 'rejected',
        paymentRejectedAt: new Date().toISOString(),
        paymentRejectedReason: trimmedReason || null,
        status: 'cancelled',
      },
    });
  } catch (err) {
    console.error('[PaymentVerification] Error in reject-payment:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to reject payment. Please try again.' });
  }
});

export default router;
