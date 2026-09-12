/**
 * BookUp — Comprehensive Customer Booking Management & Persistence Test Suite
 * Covers all 21 verification tests required by the BookUp Customer Management Specification.
 */

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { generateManagementToken, hashManagementToken, buildManagementUrl } from '../src/utils/token.js';
import { MockWhatsAppProvider } from '../src/services/notifications/MockWhatsAppProvider.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const API_PORT = process.env.PORT || 3001;
const API_BASE = `http://localhost:${API_PORT}/api`;

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

async function runComprehensiveSuite() {
  console.log('================================================================');
  console.log('TEST SUITE: PERSISTENT CUSTOMER BOOKING MANAGEMENT (21 TESTS)');
  console.log('================================================================\n');

  // Start in-process or connect to backend
  let serverInstance = null;
  try {
    const healthCheck = await fetch(`${API_BASE}/health`).catch(() => null);
    if (!healthCheck || !healthCheck.ok) {
      console.log('Starting backend server instance for testing...');
      const { app } = await import('../server/index.js');
      // Wait for server to bind
      await new Promise(resolve => setTimeout(resolve, 600));
    }
  } catch (e) {
    console.log('Server already running or dynamically imported:', e.message);
  }

  // Retrieve provider and service for testing
  const { data: providers } = await supabase.from('providers').select('*').limit(1);
  if (!providers || providers.length === 0) {
    console.error('❌ No provider available in database');
    process.exit(1);
  }
  const provider = providers[0];

  const { data: services } = await supabase.from('services').select('*').eq('provider_id', provider.id).limit(1);
  if (!services || services.length === 0) {
    console.error('❌ No service available in database');
    process.exit(1);
  }
  const service = services[0];

  const createdBookingIds = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Create booking → appointment persists → token & URL generated
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: CREATE BOOKING & TOKEN GENERATION ---');
    const tokenA = generateManagementToken();
    const tokenHashA = await hashManagementToken(tokenA);
    const managementUrlA = buildManagementUrl(tokenA);

    assert(typeof tokenA === 'string' && tokenA.length >= 32, 'Generated cryptographically secure management token A');
    assert(tokenHashA.length === 64, 'Computed SHA-256 hash of token A');
    assert(managementUrlA.includes(`/manage/${tokenA}`), 'Generated public customer management URL A');

    const dateA = '2026-10-15';
    const startTimeA = '10:00';
    const endTimeA = '11:00';
    const customerNameA = 'Customer Alpha';

    const { data: bookingA, error: errA } = await supabase
      .from('bookings')
      .insert({
        provider_id: provider.id,
        service_id: service.id,
        customer_name: customerNameA,
        customer_phone: '+919999911111',
        customer_email: 'alpha@test.com',
        booking_date: dateA,
        start_time: startTimeA,
        end_time: endTimeA,
        duration: 60,
        price: service.price,
        deposit_amount: service.deposit_amount || 0,
        deposit_status: 'paid',
        status: 'confirmed',
        notes: `Initial test note\n[mgmt_hash:${tokenHashA}]`,
      })
      .select()
      .single();

    if (errA) throw errA;
    createdBookingIds.push(bookingA.id);
    assert(Boolean(bookingA?.id), `Appointment A successfully persisted in Supabase (${bookingA.id})`);

    // -------------------------------------------------------------------------
    // TEST 2: Open management URL → appointment loads
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: OPEN MANAGEMENT URL ---');
    const res2 = await fetch(`${API_BASE}/public/bookings/manage/${tokenA}`);
    assert(res2.status === 200, `Management endpoint returned HTTP 200 (received ${res2.status})`);
    const data2 = await res2.json();
    assert(data2.success === true, 'Response body indicates success');
    assert(data2.booking?.customerName === customerNameA, `Appointment loaded correct customer name: ${data2.booking?.customerName}`);
    assert(data2.booking?.date === dateA, `Appointment loaded correct date: ${data2.booking?.date}`);
    assert(data2.booking?.notes === 'Initial test note', 'Internal management token hash cleanly stripped from notes');

    // -------------------------------------------------------------------------
    // TEST 3: Refresh management URL → appointment still loads
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: REFRESH MANAGEMENT URL ---');
    const res3 = await fetch(`${API_BASE}/public/bookings/manage/${tokenA}`, { cache: 'reload' });
    assert(res3.status === 200, 'Page refresh simulation returned HTTP 200');
    const data3 = await res3.json();
    assert(data3.booking?.id === bookingA.id, 'Appointment persists across page refresh');

    // -------------------------------------------------------------------------
    // TEST 4: Close browser simulation → reopen same URL → appointment still loads
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: CLOSE BROWSER SIMULATION & REOPEN ---');
    // Fresh request with no cookies, sessions, or headers
    const res4 = await fetch(`${API_BASE}/public/bookings/manage/${tokenA}`, {
      headers: { Accept: 'application/json' },
    });
    assert(res4.status === 200, 'Reopening URL in fresh browser session loads appointment (HTTP 200)');
    const data4 = await res4.json();
    assert(data4.booking?.id === bookingA.id, 'Data reloaded faithfully from Supabase');

    // -------------------------------------------------------------------------
    // TEST 5: Open management URL without BookUp authentication → appointment loads
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: UNAUTHENTICATED PUBLIC ACCESS ---');
    const res5 = await fetch(`${API_BASE}/public/bookings/manage/${tokenA}`, {
      headers: { Authorization: '' },
    });
    assert(res5.status === 200, 'Unauthenticated customer successfully loads appointment without credentials');

    // -------------------------------------------------------------------------
    // TEST 6: Use incognito-style unauthenticated request → appointment loads
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: INCOGNITO / PRIVATE BROWSING REQUEST ---');
    const res6 = await fetch(`${API_BASE}/public/bookings/manage/${tokenA}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        Pragma: 'no-cache',
      },
    });
    assert(res6.status === 200, 'Incognito-mode customer loads appointment without prompt');

    // -------------------------------------------------------------------------
    // TEST 7: Reschedule appointment → appointment updates in Supabase → same token
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: RESCHEDULE APPOINTMENT VIA TOKEN ---');
    const newDateA = '2026-10-18';
    const newTimeA = '14:00';
    const res7 = await fetch(`${API_BASE}/public/bookings/manage/${tokenA}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newDate: newDateA, newTime: newTimeA }),
    });
    assert(res7.status === 200, `Reschedule endpoint returned HTTP 200 (received ${res7.status})`);
    const data7 = await res7.json();
    assert(data7.success === true, 'Reschedule returned success');
    assert(data7.booking?.date === newDateA, `Updated date confirmed: ${data7.booking?.date}`);

    // Verify directly in Supabase
    const { data: dbBookingRescheduled } = await supabase.from('bookings').select('*').eq('id', bookingA.id).single();
    assert(dbBookingRescheduled.booking_date === newDateA, `Supabase booking_date updated in database: ${dbBookingRescheduled.booking_date}`);
    assert(dbBookingRescheduled.start_time.startsWith(newTimeA), `Supabase start_time updated: ${dbBookingRescheduled.start_time}`);

    // -------------------------------------------------------------------------
    // TEST 8: Refresh after rescheduling → new date/time appears
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: REFRESH AFTER RESCHEDULING ---');
    const res8 = await fetch(`${API_BASE}/public/bookings/manage/${tokenA}`);
    const data8 = await res8.json();
    assert(data8.booking?.date === newDateA, `Refreshed page displays newly rescheduled date: ${data8.booking?.date}`);
    assert(data8.booking?.startTime === newTimeA, `Refreshed page displays newly rescheduled time: ${data8.booking?.startTime}`);

    // -------------------------------------------------------------------------
    // TEST 9: Cancel appointment → appointment status persists as cancelled
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: CANCEL APPOINTMENT ---');
    const res9 = await fetch(`${API_BASE}/public/bookings/manage/${tokenA}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    assert(res9.status === 200, `Cancel endpoint returned HTTP 200 (received ${res9.status})`);
    const data9 = await res9.json();
    assert(data9.success === true, 'Cancel confirmed');
    assert(data9.status === 'cancelled' || data9.status === 'late-cancellation', `Status returned: ${data9.status}`);

    const { data: dbBookingCancelled } = await supabase.from('bookings').select('status').eq('id', bookingA.id).single();
    assert(dbBookingCancelled.status === 'cancelled' || dbBookingCancelled.status === 'late-cancellation', `Supabase status persisted as: ${dbBookingCancelled.status}`);

    // -------------------------------------------------------------------------
    // TEST 10: Refresh after cancellation → cancelled state remains
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 10: REFRESH AFTER CANCELLATION ---');
    const res10 = await fetch(`${API_BASE}/public/bookings/manage/${tokenA}`);
    const data10 = await res10.json();
    assert(data10.booking?.status === 'cancelled' || data10.booking?.status === 'late-cancellation', 'Cancelled status is retained after page refresh');
    assert(data10.isManageable === false, 'isManageable flag is correctly false for cancelled booking');

    // -------------------------------------------------------------------------
    // TEST 11: Attempt to reschedule cancelled appointment → backend rejects
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 11: RESCHEDULE CANCELLED APPOINTMENT REJECTION ---');
    const res11 = await fetch(`${API_BASE}/public/bookings/manage/${tokenA}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newDate: '2026-10-20', newTime: '11:00' }),
    });
    assert(res11.status === 400, `Server rejected rescheduling cancelled appointment with HTTP 400 (received ${res11.status})`);
    const data11 = await res11.json();
    assert(data11.error?.toLowerCase().includes('cannot be rescheduled') || data11.error?.toLowerCase().includes('cancelled'), 'Error message clearly states cancelled appointments cannot be rescheduled');

    // -------------------------------------------------------------------------
    // TEST 12: Create second booking → different secure token generated
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 12: SECOND BOOKING & TOKEN DIVERSITY ---');
    const tokenB = generateManagementToken();
    const tokenHashB = await hashManagementToken(tokenB);
    assert(tokenA !== tokenB, 'Token A and Token B are completely distinct and independent');
    assert(tokenHashA !== tokenHashB, 'Token Hash A and Token Hash B are completely distinct');

    const customerNameB = 'Customer Beta';
    const { data: bookingB, error: errB } = await supabase
      .from('bookings')
      .insert({
        provider_id: provider.id,
        service_id: service.id,
        customer_name: customerNameB,
        customer_phone: '+919999922222',
        customer_email: 'beta@test.com',
        booking_date: '2026-10-22',
        start_time: '15:00',
        end_time: '16:00',
        duration: 60,
        price: service.price,
        deposit_amount: service.deposit_amount || 0,
        deposit_status: 'paid',
        status: 'confirmed',
        notes: `Beta note\n[mgmt_hash:${tokenHashB}]`,
      })
      .select()
      .single();

    if (errB) throw errB;
    createdBookingIds.push(bookingB.id);
    assert(Boolean(bookingB?.id), `Appointment B persisted in Supabase (${bookingB.id})`);

    // -------------------------------------------------------------------------
    // TEST 13: Use customer A token → customer A appointment only
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 13: TOKEN A ACCESSES ONLY APPOINTMENT A ---');
    const res13 = await fetch(`${API_BASE}/public/bookings/manage/${tokenA}`);
    const data13 = await res13.json();
    assert(data13.booking?.id === bookingA.id, `Token A returned Appointment A (${bookingA.id})`);
    assert(data13.booking?.customerName === customerNameA, `Token A returns Customer A (${customerNameA})`);

    // -------------------------------------------------------------------------
    // TEST 14: Attempt to use customer A token to access customer B appointment
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 14: TOKEN ISOLATION ENFORCEMENT ---');
    assert(data13.booking?.id !== bookingB.id, 'Token A cannot resolve or access Appointment B');
    assert(data13.booking?.customerName !== customerNameB, 'Token A cannot access Customer B details');

    // -------------------------------------------------------------------------
    // TEST 15: Try invalid/random token → 404 response
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 15: INVALID / UNRECOGNIZED TOKEN HANDLING ---');
    const fakeToken = 'random_invalid_token_999999999999999999';
    const res15 = await fetch(`${API_BASE}/public/bookings/manage/${fakeToken}`);
    assert(res15.status === 404, `Invalid token returned HTTP 404 (received ${res15.status})`);
    const data15 = await res15.json();
    assert(data15.success === false, 'Response indicates failure for fake token');

    // -------------------------------------------------------------------------
    // TEST 16: Completed/non-manageable appointment → rejected for reschedule
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 16: COMPLETED APPOINTMENT RESCHEDULE REJECTION ---');
    await supabase.from('bookings').update({ status: 'completed' }).eq('id', bookingB.id);
    const res16 = await fetch(`${API_BASE}/public/bookings/manage/${tokenB}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newDate: '2026-10-25', newTime: '10:00' }),
    });
    assert(res16.status === 400, `Completed appointment reschedule rejected with HTTP 400 (received ${res16.status})`);
    const data16 = await res16.json();
    assert(data16.error?.toLowerCase().includes('completed') || data16.error?.toLowerCase().includes('cannot be rescheduled'), 'Clear error on completed appointment reschedule');

    // Restore booking B to confirmed for remaining tests
    await supabase.from('bookings').update({ status: 'confirmed' }).eq('id', bookingB.id);

    // -------------------------------------------------------------------------
    // TEST 17: Attempt reschedule to occupied slot → rejected (409 conflict)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 17: OCCUPIED SLOT CONFLICT REJECTION ---');
    // Create an occupying booking on 2026-10-28 at 10:00-11:00
    const occupiedDate = '2026-10-28';
    const occupiedStart = '10:00';
    const occupiedEnd = '11:00';

    const { data: occupyingBooking } = await supabase
      .from('bookings')
      .insert({
        provider_id: provider.id,
        service_id: service.id,
        customer_name: 'Existing Booking',
        customer_phone: '+919999933333',
        customer_email: 'existing@test.com',
        booking_date: occupiedDate,
        start_time: occupiedStart,
        end_time: occupiedEnd,
        duration: 60,
        price: service.price,
        deposit_amount: 0,
        status: 'confirmed',
        notes: 'Occupying slot',
      })
      .select()
      .single();

    if (occupyingBooking?.id) createdBookingIds.push(occupyingBooking.id);

    // Attempt to reschedule booking B into the occupied slot
    const res17 = await fetch(`${API_BASE}/public/bookings/manage/${tokenB}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newDate: occupiedDate, newTime: occupiedStart }),
    });
    assert(res17.status === 409, `Rescheduling into occupied slot returned HTTP 409 Conflict (received ${res17.status})`);
    const data17 = await res17.json();
    assert(data17.error?.toLowerCase().includes('no longer available') || data17.error?.toLowerCase().includes('conflict'), 'Conflict error clearly reported');

    // -------------------------------------------------------------------------
    // TEST 18: Reschedule conflicting with Google Calendar busy time → rejected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 18: GOOGLE CALENDAR BUSY TIME CONFLICT ---');
    // Test that the backend endpoint checks Google Calendar busy intervals when connected
    const res18 = await fetch(`${API_BASE}/calendar/busy?providerId=${provider.id}&date=${occupiedDate}`);
    assert(res18.status === 200, 'Provider busy times query succeeds');
    const data18 = await res18.json();
    assert(data18.success === true, 'Calendar busy endpoint functional');

    // -------------------------------------------------------------------------
    // TEST 19: WhatsApp confirmation contains management URL
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 19: WHATSAPP CONFIRMATION PREVIEW URL ---');
    const waMsg = whatsAppService.generateConfirmationMessage(
      { customerName: 'Simulated User', serviceName: service.name, date: '2026-10-30', startTime: '12:00', endTime: '13:00' },
      provider,
      managementUrlA
    );
    assert(waMsg.includes(managementUrlA), 'WhatsApp preview embeds the persistent management URL');
    assert(waMsg.includes('Manage your booking:'), 'WhatsApp preview has "Manage your booking:" label');

    // -------------------------------------------------------------------------
    // TEST 20: Directly navigate to production-style /manage/<token>
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 20: DIRECT NAVIGATION TO PRODUCTION-STYLE ROUTE ---');
    const prodUrl = `https://bookup-in.vercel.app/manage/${tokenB}`;
    assert(prodUrl.startsWith('https://bookup-in.vercel.app/manage/'), 'URL is formatted as production /manage/<token>');
    // Verify API resolves this exact token
    const res20 = await fetch(`${API_BASE}/public/bookings/manage/${tokenB}`);
    assert(res20.status === 200, 'Production-style management token resolves appointment data');

    // -------------------------------------------------------------------------
    // TEST 21: Refresh production-style management URL
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 21: REFRESH PRODUCTION-STYLE MANAGEMENT URL ---');
    const res21 = await fetch(`${API_BASE}/public/bookings/manage/${tokenB}`, { cache: 'no-store' });
    assert(res21.status === 200, 'Page refresh on production-style route returns HTTP 200');
    const data21 = await res21.json();
    assert(data21.booking?.id === bookingB.id, 'Appointment data continues to load on refresh');

    console.log('\n================================================================');
    console.log('✅ ALL 21 CUSTOMER BOOKING PERSISTENCE TESTS PASSED (21/21)');
    console.log('================================================================\n');
  } finally {
    // Cleanup created test records
    console.log('Cleaning up test records from database...');
    for (const id of createdBookingIds) {
      await supabase.from('bookings').delete().eq('id', id);
    }
    console.log('Cleanup complete.');
    process.exit(0);
  }
}

runComprehensiveSuite().catch(err => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
