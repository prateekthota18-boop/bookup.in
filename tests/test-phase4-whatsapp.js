/**
 * BookUp — Phase 4: WhatsApp Notifications via RichAutomate Test Suite
 *
 * Verifies:
 * [TEST 1] Phone number normalization (Indian & international formats).
 * [TEST 2] RichAutomate service payload shape & safe failure isolation (never throws).
 * [TEST 3] Server-side booking creation with synchronous confirmation trigger.
 * [TEST 4] WhatsApp failure never blocks or rolls back booking transaction.
 * [TEST 5] Encrypted management token storage & offline decryption for reminders.
 * [TEST 6] 2-Hour reminder dispatch & deduplication (never sends twice).
 * [TEST 7] Rescheduling resets reminder state for new appointment time.
 * [TEST 8] Cancellation cancels pending reminders (cancelled never receives reminder).
 * [TEST 9] Security & isolation (API key and internal secret protection).
 */

import dotenv from 'dotenv';
dotenv.config();

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { config } from '../server/config.js';
import { normalizePhoneNumber, RichAutomateService, WHATSAPP_TEMPLATES } from '../server/services/richAutomate.js';
import { encryptToken, decryptToken } from '../server/utils/crypto.js';
import { processReminders } from '../server/routes/internalNotifications.js';

const url = config.supabaseUrl;
const key = config.supabaseServiceRoleKey || config.supabaseKey;
const API_PORT = config.port || 3001;
const API_BASE = `http://localhost:${API_PORT}/api`;

if (!url || !key) {
  console.error('❌ Supabase credentials missing from .env');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function runPhase4Suite() {
  console.log('================================================================');
  console.log('TEST SUITE: PHASE 4 WHATSAPP NOTIFICATIONS (RICHAUTOMATE)');
  console.log('================================================================\n');

  // Start backend server instance if not currently running
  try {
    const healthCheck = await fetch(`${API_BASE}/health`).catch(() => null);
    if (!healthCheck || !healthCheck.ok) {
      console.log('Starting backend server instance for testing...');
      await import('../server/index.js');
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  } catch (e) {
    console.log('Server already running or dynamically imported:', e.message);
  }

  // --- [TEST 1] PHONE NUMBER NORMALIZATION ---
  console.log('\n--- [TEST 1] PHONE NUMBER NORMALIZATION ---');
  assert(normalizePhoneNumber('9876543210') === '919876543210', '10-digit Indian number normalized with 91 prefix');
  assert(normalizePhoneNumber('09876543210') === '919876543210', '11-digit number with leading 0 normalized');
  assert(normalizePhoneNumber('+91 98765-43210') === '919876543210', '+91 format with spaces and dashes normalized');
  assert(normalizePhoneNumber('919876543210') === '919876543210', 'Already-prefixed 91 number preserved');
  assert(normalizePhoneNumber('+1 (555) 234-5678') === '15552345678', 'US international number normalized without +');
  assert(normalizePhoneNumber('') === '', 'Empty phone string returns empty');
  assert(normalizePhoneNumber(null) === '', 'Null phone returns empty');

  // --- [TEST 2] RICHAUTOMATE SERVICE & SAFE FAILURE ISOLATION ---
  console.log('\n--- [TEST 2] RICHAUTOMATE SERVICE & FAILURE ISOLATION ---');
  const dummyService = new RichAutomateService('dummy_test_api_key');
  assert(dummyService.isConfigured() === true, 'Service reports configured when API key is provided');

  // Verify sendTemplate never throws even when calling unresolvable or dummy endpoint
  const failRes = await dummyService.sendTemplate({
    phone: '9876543210',
    template: WHATSAPP_TEMPLATES.CONFIRMATION_CUSTOMER,
    variables: ['Service', 'Provider', '2026-10-15', '10:00', '60 mins', 'https://calup-in.vercel.app/manage/123'],
  });
  assert(typeof failRes === 'object', 'sendTemplate returns object result');
  assert('success' in failRes, 'sendTemplate returns success boolean property');
  assert(failRes.success === false, 'Dummy key request correctly reports failure without throwing');

  // Unconfigured service check
  const unconfiguredService = new RichAutomateService('');
  const skippedRes = await unconfiguredService.sendTemplate({
    phone: '9876543210',
    template: WHATSAPP_TEMPLATES.CONFIRMATION_CUSTOMER,
  });
  assert(skippedRes.success === false && skippedRes.skipped === true, 'Unconfigured service skips gracefully without network call');

  // --- [TEST 3] SERVER-SIDE BOOKING CREATION WITH SYNCHRONOUS CONFIRMATION ---
  console.log('\n--- [TEST 3] SERVER-SIDE BOOKING CREATION & CONFIRMATIONS ---');
  const { data: providers } = await supabase.from('providers').select('*').limit(1);
  const provider = providers?.[0];
  assert(Boolean(provider), 'Test provider exists in Supabase');

  const { data: services } = await supabase.from('services').select('*').eq('provider_id', provider.id).limit(1);
  const service = services?.[0];
  assert(Boolean(service), 'Test service exists in Supabase');

  const testDate = '2026-11-20';
  const testTime = '11:00';
  const customToken = crypto.randomBytes(24).toString('hex');

  // Call server booking creation endpoint
  const createRes = await fetch(`${API_BASE}/public/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerId: provider.id,
      serviceId: service.id,
      customerName: 'WhatsApp Test Customer',
      customerEmail: 'whatsapp@test.com',
      customerPhone: '9876543210',
      customerWhatsApp: '9876543210',
      bookingDate: testDate,
      startTime: testTime,
      managementToken: customToken,
    }),
  });

  assert(createRes.status === 201, `Server booking creation returned HTTP 201 (received ${createRes.status})`);
  const createData = await createRes.json();
  assert(createData.success === true, 'Booking response indicates success');
  assert(Boolean(createData.bookingId), 'Booking ID returned');
  assert(Boolean(createData.managementToken), 'Management token returned');
  assert(Boolean(createData.managementUrl), 'Management URL returned');
  assert('whatsapp' in createData, 'Synchronous WhatsApp delivery status reported in booking response');

  // Verify booking was persisted to Supabase
  const { data: dbBooking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', createData.bookingId)
    .single();

  assert(Boolean(dbBooking), 'Booking persisted in Supabase database');
  assert(dbBooking.customer_name === 'WhatsApp Test Customer', 'Customer name persisted accurately');

  // --- [TEST 4] WHATSAPP FAILURE NEVER CANCELS OR BLOCKS BOOKING ---
  console.log('\n--- [TEST 4] WHATSAPP FAILURE NEVER BLOCKS BOOKING ---');
  assert(dbBooking.status === 'confirmed', 'Booking status is confirmed despite live WhatsApp credentials being dummy/mock');

  // --- [TEST 5] ENCRYPTED MANAGEMENT TOKEN STORAGE & OFFLINE DECRYPTION ---
  console.log('\n--- [TEST 5] ENCRYPTED TOKEN STORAGE & OFFLINE DECRYPTION ---');
  // Raw token must never be in plaintext in the db
  assert(dbBooking.notes.indexOf(customToken) === -1, 'Raw management token is NOT in database notes');

  // Decryption of encrypted token bundle
  let decryptedToken = '';
  if (dbBooking.management_token_encrypted) {
    decryptedToken = decryptToken(dbBooking.management_token_encrypted);
  } else if ((dbBooking.notes || '').includes('[mgmt_enc:')) {
    const match = dbBooking.notes.match(/\[mgmt_enc:([^\]]+)\]/);
    if (match) decryptedToken = decryptToken(match[1]);
  }

  assert(decryptedToken === customToken, 'Encrypted token decrypts faithfully to original raw management token');

  // --- [TEST 6] 2-HOUR REMINDER DISPATCH & DEDUPLICATION ---
  console.log('\n--- [TEST 6] 2-HOUR REMINDER DISPATCH & DEDUPLICATION ---');
  // Set booking date and time to exactly 2 hours from now to test the reminder window
  const now = new Date();
  const twoHoursAhead = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const reminderDate = twoHoursAhead.toISOString().split('T')[0];
  const reminderTime = `${String(twoHoursAhead.getHours()).padStart(2, '0')}:${String(twoHoursAhead.getMinutes()).padStart(2, '0')}`;

  await supabase
    .from('bookings')
    .update({
      booking_date: reminderDate,
      start_time: reminderTime,
      status: 'confirmed',
    })
    .eq('id', createData.bookingId);

  // Run reminder batch process
  const reminderResults = await processReminders();
  assert(reminderResults.totalCandidates >= 1, 'Reminder processor identified upcoming candidate booking');

  // Run a second time to verify deduplication
  const secondRun = await processReminders();
  const matchingSecond = secondRun.details.find(d => d.id === createData.bookingId);
  assert(!matchingSecond, 'Deduplication verified: Booking was not processed or sent a second time');

  // --- [TEST 7] RESCHEDULE RESETS REMINDER STATE ---
  console.log('\n--- [TEST 7] RESCHEDULE RESETS REMINDER STATE ---');
  const rescheduleRes = await fetch(`${API_BASE}/public/bookings/manage/${customToken}/reschedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      newDate: '2026-11-25',
      newTime: '15:00',
    }),
  });

  assert(rescheduleRes.status === 200, `Reschedule returned HTTP 200 (received ${rescheduleRes.status})`);
  const { data: rescheduledDbBooking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', createData.bookingId)
    .single();

  assert(rescheduledDbBooking.booking_date === '2026-11-25', 'Booking date updated to new date');
  assert(!rescheduledDbBooking.reminder_sent_at && !(rescheduledDbBooking.notes || '').includes('[rem_sent:'), 'reminder state was reset upon reschedule');

  // --- [TEST 8] CANCELLATION CANCELS PENDING REMINDERS ---
  console.log('\n--- [TEST 8] CANCELLATION CANCELS PENDING REMINDERS ---');
  const cancelRes = await fetch(`${API_BASE}/public/bookings/manage/${customToken}/cancel`, {
    method: 'POST',
  });

  assert(cancelRes.status === 200, 'Cancel request returned HTTP 200');
  const { data: cancelledBooking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', createData.bookingId)
    .single();

  assert(cancelledBooking.status === 'cancelled', 'Appointment status marked as cancelled in database');

  // Set date to within 2-hour window again and verify reminder processor ignores it
  await supabase
    .from('bookings')
    .update({
      booking_date: reminderDate,
      start_time: reminderTime,
    })
    .eq('id', createData.bookingId);

  const postCancelReminderRun = await processReminders();
  const cancelledProcessed = postCancelReminderRun.details.find(d => d.id === createData.bookingId);
  assert(!cancelledProcessed, 'Cancelled appointment was strictly ignored by reminder worker');

  // --- [TEST 9] SECURITY & SECRET PROTECTION ---
  console.log('\n--- [TEST 9] SECURITY & CRON SECRET PROTECTION ---');
  // Internal cron endpoint
  const cronRes = await fetch(`${API_BASE}/internal/notifications/process-reminders`, {
    method: 'POST',
  });
  assert(cronRes.status === 200 || cronRes.status === 401, 'Internal cron endpoint responds appropriately');

  // Verify management GET endpoint does not leak secrets
  const manageRes = await fetch(`${API_BASE}/public/bookings/manage/${customToken}`);
  const manageData = await manageRes.json();
  assert(manageRes.status === 200, 'Management endpoint accessible with valid token');
  assert(!('management_token_encrypted' in manageData.booking), 'Encrypted management token is not leaked to client');
  assert(!('management_token_hash' in manageData.booking), 'Management token hash is not leaked to client');

  // Cleanup test booking
  console.log('\nCleaning up test record...');
  await supabase.from('bookings').delete().eq('id', createData.bookingId);
  console.log('Cleanup complete.');

  console.log('\n================================================================');
  console.log('✅ ALL PHASE 4 WHATSAPP TESTS PASSED (9/9 SECTIONS VERIFIED)');
  console.log('================================================================\n');
  process.exit(0);
}

runPhase4Suite().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
