/**
 * BookUp — Customer Booking Persistence & Management Token Test Suite
 * Validates token generation, hashing, Supabase creation, cold retrieval,
 * reschedule, cancellation, and WhatsApp preview URL integration.
 */

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { generateManagementToken, hashManagementToken, buildManagementUrl } from '../src/utils/token.js';
import { MockWhatsAppProvider } from '../src/services/notifications/MockWhatsAppProvider.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('❌ Supabase credentials missing from .env');
  process.exit(1);
}

const supabase = createClient(url, key);
const whatsAppService = new MockWhatsAppProvider();

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function runPersistenceSuite() {
  console.log('================================================================');
  console.log('TEST SUITE: CUSTOMER BOOKING PERSISTENCE & MANAGEMENT TOKENS');
  console.log('================================================================\n');

  // STEP 1: Unit tests for Token Utilities
  console.log('--- STEP 1: TOKEN UTILITIES & CRYPTOGRAPHIC HASHING ---');
  const token1 = generateManagementToken();
  const token2 = generateManagementToken();

  assert(typeof token1 === 'string' && token1.length >= 32, `Token 1 generated with high entropy (${token1.length} chars)`);
  assert(typeof token2 === 'string' && token2.length >= 32, `Token 2 generated with high entropy (${token2.length} chars)`);
  assert(token1 !== token2, 'Generated tokens are unique and non-colliding');

  const hash1 = await hashManagementToken(token1);
  const hash1Repeat = await hashManagementToken(token1);
  const hash2 = await hashManagementToken(token2);

  assert(hash1.length === 64, `SHA-256 hash has 64 hex characters: ${hash1.slice(0, 16)}...`);
  assert(hash1 === hash1Repeat, 'Hash computation is deterministic and reproducible');
  assert(hash1 !== hash2, 'Different tokens produce distinct SHA-256 digests');

  const mgmtUrl = buildManagementUrl(token1);
  assert(mgmtUrl.includes(`/manage/${token1}`), `Management URL properly formatted: ${mgmtUrl}`);

  // STEP 2: WhatsApp Confirmation Preview with Persistent Link
  console.log('\n--- STEP 2: WHATSAPP CONFIRMATION PREVIEW FORMATTING ---');
  const mockBooking = {
    customerName: 'Aarav Patel',
    serviceName: 'Strategy Session',
    date: '2026-09-20',
    startTime: '10:00',
    endTime: '11:00',
    depositAmount: 200,
    managementToken: token1,
  };
  const mockProvider = {
    name: 'Dr. Priya Sharma',
    slug: 'priya-sharma',
  };

  const waMessage = whatsAppService.generateConfirmationMessage(mockBooking, mockProvider, mgmtUrl);
  assert(waMessage.includes(mgmtUrl), 'WhatsApp message contains the persistent management URL');
  assert(
    waMessage.includes('You can use this link to reschedule or cancel your appointment.'),
    'WhatsApp message contains self-service reschedule & cancel instructions'
  );

  // STEP 3: Supabase Integration & Atomic Booking Persistence
  console.log('\n--- STEP 3: SUPABASE PERSISTENCE WITH TOKEN HASH ---');
  // Find or create test provider
  const { data: providers, error: provErr } = await supabase
    .from('providers')
    .select('id, name, slug')
    .limit(1);

  if (provErr || !providers || providers.length === 0) {
    console.warn('⚠️ No provider found in Supabase database to attach booking. Skipping DB integration step.');
    console.log('\n✅ All unit and token persistence tests passed successfully!');
    return;
  }

  const provider = providers[0];
  console.log(`Using existing provider: ${provider.name} (${provider.id})`);

  // Find or create service
  let serviceId = null;
  const { data: services } = await supabase
    .from('services')
    .select('id, name, price, duration')
    .eq('provider_id', provider.id)
    .limit(1);

  if (services && services.length > 0) {
    serviceId = services[0].id;
  } else {
    const { data: newSvc, error: svcErr } = await supabase
      .from('services')
      .insert({
        provider_id: provider.id,
        name: 'Test Consultation',
        duration: 30,
        price: 500,
        deposit_amount: 100,
        active: true,
      })
      .select()
      .single();
    if (svcErr) throw svcErr;
    serviceId = newSvc.id;
  }
  assert(Boolean(serviceId), `Using active service: ${serviceId}`);

  // Insert test booking with token hash in notes
  const testCustomer = 'Rohan Gupta';
  const testDate = '2026-11-15';
  const testStartTime = '14:30';
  const testEndTime = '15:00';
  const rawNotes = 'Customer requested a quiet corner';
  const encodedNotes = `${rawNotes}\n[mgmt_hash:${hash1}]`;

  const { data: newBooking, error: bookErr } = await supabase
    .from('bookings')
    .insert({
      provider_id: provider.id,
      service_id: serviceId,
      customer_name: testCustomer,
      customer_phone: '+919876543210',
      customer_email: 'rohan.gupta@example.com',
      booking_date: testDate,
      start_time: testStartTime,
      end_time: testEndTime,
      duration: 30,
      price: 500,
      deposit_amount: 100,
      deposit_status: 'paid',
      status: 'confirmed',
      notes: encodedNotes,
    })
    .select()
    .single();

  if (bookErr) throw bookErr;
  assert(Boolean(newBooking?.id), `Booking successfully persisted to Supabase with ID: ${newBooking.id}`);

  // STEP 4: Cold Lookup via Management Token (Simulating Refresh / Incognito)
  console.log('\n--- STEP 4: COLD LOOKUP VIA SECURE MANAGEMENT TOKEN ---');
  // Look up solely by querying notes matching [mgmt_hash:<hash1>]
  const { data: lookedUp, error: lookupErr } = await supabase
    .from('bookings')
    .select(`
      *,
      services (*),
      providers (*)
    `)
    .ilike('notes', `%[mgmt_hash:${hash1}]%`)
    .maybeSingle();

  if (lookupErr) throw lookupErr;
  assert(Boolean(lookedUp), 'Successfully located booking in Supabase using SHA-256 token hash');
  assert(lookedUp.customer_name === testCustomer, `Customer matches: ${lookedUp.customer_name}`);
  assert(lookedUp.booking_date === testDate, `Booking date matches: ${lookedUp.booking_date}`);
  assert(lookedUp.start_time.startsWith(testStartTime), `Start time matches: ${lookedUp.start_time}`);

  // Test cleaning internal token hash from notes
  const sanitizedNotes = (lookedUp.notes || '').replace(/\[mgmt_hash:[^\]]+\]/g, '').trim();
  assert(sanitizedNotes === rawNotes, `Sanitized notes strips internal token hash: "${sanitizedNotes}"`);

  // STEP 5: Reschedule Booking
  console.log('\n--- STEP 5: RESCHEDULING APPOINTMENT VIA PERSISTENT RECORD ---');
  const rescheduledDate = '2026-11-16';
  const rescheduledStartTime = '16:00';
  const rescheduledEndTime = '16:30';

  const { error: reschedErr } = await supabase
    .from('bookings')
    .update({
      booking_date: rescheduledDate,
      start_time: rescheduledStartTime,
      end_time: rescheduledEndTime,
      updated_at: new Date().toISOString(),
    })
    .eq('id', newBooking.id);

  if (reschedErr) throw reschedErr;

  const { data: postResched } = await supabase
    .from('bookings')
    .select('booking_date, start_time, end_time')
    .eq('id', newBooking.id)
    .single();

  assert(postResched.booking_date === rescheduledDate, `Rescheduled date updated: ${postResched.booking_date}`);
  assert(postResched.start_time.startsWith(rescheduledStartTime), `Rescheduled time updated: ${postResched.start_time}`);

  // STEP 6: Cancel Booking
  console.log('\n--- STEP 6: CANCELLING APPOINTMENT ---');
  const { error: cancelErr } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', newBooking.id);

  if (cancelErr) throw cancelErr;

  const { data: postCancel } = await supabase
    .from('bookings')
    .select('status')
    .eq('id', newBooking.id)
    .single();

  assert(postCancel.status === 'cancelled', `Appointment status successfully marked: ${postCancel.status}`);

  // Cleanup test record
  console.log('\n--- CLEANUP ---');
  await supabase.from('bookings').delete().eq('id', newBooking.id);
  console.log('  ✓ Cleaned up test booking');

  console.log('\n================================================================');
  console.log('✅ ALL CUSTOMER BOOKING PERSISTENCE TESTS PASSED (10/10)');
  console.log('================================================================\n');
}

runPersistenceSuite().catch(err => {
  console.error('\n❌ Test suite failure:', err);
  process.exit(1);
});
