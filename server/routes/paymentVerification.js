/**
 * BookUp — Payment Verification Routes
 *
 * Endpoints for the manual "pay-the-coach-directly" flow:
 * - POST /api/public/bookings/manage/:token/mark-paid    (customer, token-authed)
 * - POST /api/bookings/:id/confirm-payment               (provider-authed)
 * - POST /api/bookings/:id/reject-payment                (provider-authed)
 *
 * BookUp never touches money. Coach and customer settle payment directly (UPI).
 * BookUp only tracks the verification state as metadata on top of existing
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
    const frontendBase = (config.frontendUrl || 'https://bookup-in.vercel.app').replace(/\/$/, '');
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
      }).catch(mailErr => {
        console.warn('[PaymentVerification] Non-blocking provider payment email warning:', mailErr.message);
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
    // Fetch booking by ID
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('*, services (name), providers (name, business_name, phone, whatsapp, email, timezone)')
      .eq('id', bookingId)
      .maybeSingle();

    if (fetchErr || !booking) {
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

    // Non-blocking WhatsApp confirmation notification to customer
    const provider = booking.providers || {};
    const service = booking.services || {};

    try {
      if (booking.customer_whatsapp || booking.customer_phone) {
        await richAutomateService.sendCustomerConfirmation({
          phone: booking.customer_whatsapp || booking.customer_phone,
          customerName: booking.customer_name || 'Valued Customer',
          serviceName: service.name || 'Session',
          providerName: provider.name || provider.business_name || 'Coach',
          bookingDate: booking.booking_date,
          startTime: booking.start_time,
          duration: booking.duration,
          managementUrl: '',
        });
      }
    } catch (waErr) {
      // WhatsApp failure must not fail this request
      console.warn('[PaymentVerification] WhatsApp notification non-blocking error:', waErr.message);
    }

    // Non-blocking email confirmation notification to customer
    try {
      if (booking.customer_email) {
        const frontendBase = (config.frontendUrl || 'https://bookup-in.vercel.app').replace(/\/$/, '');
        await emailService.sendCustomerConfirmationEmail({
          to: booking.customer_email,
          customerName: booking.customer_name || 'Valued Customer',
          serviceName: service.name || 'Session',
          providerName: provider.name || provider.business_name || 'Coach',
          bookingDate: booking.booking_date,
          startTime: booking.start_time,
          duration: booking.duration,
          meetLink: booking.meet_link || null,
          managementUrl: '',
          bookingId: booking.id,
          timeZone: provider.timezone || 'Asia/Kolkata',
        });
      }
    } catch (emailErr) {
      // Email failure must not fail this request
      console.warn('[PaymentVerification] Email notification non-blocking error:', emailErr.message);
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

  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'A reason for rejection is required.' });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database service unavailable' });
  }

  try {
    // Fetch booking by ID
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('*, services (name), providers (name, business_name)')
      .eq('id', bookingId)
      .maybeSingle();

    if (fetchErr || !booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found or invalid booking reference.',
      });
    }

    // Guard: only allowed from 'verification_pending'
    if (booking.payment_status !== 'verification_pending') {
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
        payment_rejected_reason: reason.trim(),
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updateErr) {
      console.error('[PaymentVerification] Failed to reject payment:', updateErr);
      throw updateErr;
    }

    console.log(`[PaymentVerification] Booking ${bookingId} payment rejected by provider ${providerId}. Reason: ${reason.trim()}. Slot freed.`);

    return res.json({
      success: true,
      message: 'Payment rejected. Booking has been cancelled and the time slot is now available.',
      booking: {
        id: bookingId,
        paymentStatus: 'rejected',
        paymentRejectedAt: new Date().toISOString(),
        paymentRejectedReason: reason.trim(),
        status: 'cancelled',
      },
    });
  } catch (err) {
    console.error('[PaymentVerification] Error in reject-payment:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to reject payment. Please try again.' });
  }
});

export default router;
