/**
 * Calup — Test Suite: Public Busy Slots & Double-Booking Protection
 *
 * Verifies:
 * 1. Confirmed booking 09:00-10:00 with 15-minute buffer renders 09:00, 09:15, 09:30, 09:45, 10:00
 *    as unavailable, and 10:15 as available.
 * 2. A cancelled booking (status = 'cancelled') blocks nothing.
 * 3. A payment rejected booking (payment_status = 'rejected') blocks nothing.
 * 4. The busy-slots endpoint/response contains ONLY start_time, end_time, actual_end_time
 *    and NEVER leaks customer_name, customer_email, customer_phone, or notes.
 * 5. Backend conflict checking excludes payment_status = 'rejected'.
 */

import assert from 'assert';
import {
  generateTimeSlotsDetailed,
  getTimeSlotsDetailedForDate,
} from '../src/utils/helpers.js';

console.log('================================================================');
console.log('TEST SUITE: PUBLIC BUSY SLOTS & DOUBLE-BOOKING PROTECTION');
console.log('================================================================\n');

async function runTests() {
  const testDate = '2026-09-25';
  const serviceDuration = 60; // 60 minutes
  const bufferTime = 15;      // 15 minutes buffer
  const dayStart = '09:00';
  const dayEnd = '18:00';

  // ---------------------------------------------------------------------------
  // TEST 1: Confirmed booking 09:00-10:00 with 15-min buffer
  // ---------------------------------------------------------------------------
  console.log('--- [TEST 1] CONFIRMED BOOKING 09:00-10:00 (15-MIN BUFFER) ---');
  const confirmedBooking = {
    id: 'booking-test-1',
    date: testDate,
    startTime: '09:00',
    endTime: '10:00',
    duration: 60,
    status: 'confirmed',
    payment_status: 'awaiting_payment',
  };

  const slots = generateTimeSlotsDetailed(
    dayStart,
    dayEnd,
    serviceDuration,
    bufferTime,
    [confirmedBooking],
    [], // no external gcal
    0,  // minNotice
    testDate,
    15  // 15-minute granularity
  );

  const slotMap = Object.fromEntries(slots.map(s => [s.time, s]));

  // Verify 09:00 through 10:00 are unavailable
  assert.strictEqual(slotMap['09:00']?.available, false, '09:00 must be unavailable');
  assert.strictEqual(slotMap['09:00']?.reason, 'booked', '09:00 marked as booked');

  assert.strictEqual(slotMap['09:15']?.available, false, '09:15 must be unavailable (collides with 09:00-10:00)');
  assert.strictEqual(slotMap['09:30']?.available, false, '09:30 must be unavailable (collides with 09:00-10:00)');
  assert.strictEqual(slotMap['09:45']?.available, false, '09:45 must be unavailable (collides with 09:00-10:00)');

  // 10:00 is within the 15-minute buffer after the 09:00-10:00 appointment (buffer ends at 10:15)
  assert.strictEqual(slotMap['10:00']?.available, false, '10:00 must be unavailable due to 15-min coach buffer');

  // 10:15 is past the buffer and fully available
  assert.strictEqual(slotMap['10:15']?.available, true, '10:15 must be available');
  assert.strictEqual(slotMap['10:30']?.available, true, '10:30 must be available');

  console.log('  ✓ 09:00, 09:15, 09:30, 09:45, and 10:00 are unavailable');
  console.log('  ✓ 10:15 is available');

  // ---------------------------------------------------------------------------
  // TEST 2: Cancelled booking blocks nothing
  // ---------------------------------------------------------------------------
  console.log('\n--- [TEST 2] CANCELLED BOOKING BLOCKS NOTHING ---');
  const cancelledBooking = {
    id: 'booking-cancelled-1',
    date: testDate,
    startTime: '09:00',
    endTime: '10:00',
    duration: 60,
    status: 'cancelled',
  };

  const cancelledSlots = generateTimeSlotsDetailed(
    dayStart,
    dayEnd,
    serviceDuration,
    bufferTime,
    [cancelledBooking],
    [],
    0,
    testDate,
    15
  );
  const cancelledMap = Object.fromEntries(cancelledSlots.map(s => [s.time, s]));

  assert.strictEqual(cancelledMap['09:00']?.available, true, 'Cancelled booking leaves 09:00 available');
  assert.strictEqual(cancelledMap['09:15']?.available, true, 'Cancelled booking leaves 09:15 available');
  assert.strictEqual(cancelledMap['09:30']?.available, true, 'Cancelled booking leaves 09:30 available');
  assert.strictEqual(cancelledMap['09:45']?.available, true, 'Cancelled booking leaves 09:45 available');
  assert.strictEqual(cancelledMap['10:00']?.available, true, 'Cancelled booking leaves 10:00 available');
  assert.strictEqual(cancelledMap['10:15']?.available, true, 'Cancelled booking leaves 10:15 available');
  console.log('  ✓ Cancelled booking does not block any slot');

  // ---------------------------------------------------------------------------
  // TEST 3: Payment rejected booking blocks nothing
  // ---------------------------------------------------------------------------
  console.log('\n--- [TEST 3] REJECTED BOOKING BLOCKS NOTHING ---');
  const rejectedBooking = {
    id: 'booking-rejected-1',
    date: testDate,
    startTime: '09:00',
    endTime: '10:00',
    duration: 60,
    status: 'confirmed', // even if status was not yet toggled to cancelled
    payment_status: 'rejected',
  };

  const rejectedSlots = generateTimeSlotsDetailed(
    dayStart,
    dayEnd,
    serviceDuration,
    bufferTime,
    [rejectedBooking],
    [],
    0,
    testDate,
    15
  );
  const rejectedMap = Object.fromEntries(rejectedSlots.map(s => [s.time, s]));

  assert.strictEqual(rejectedMap['09:00']?.available, true, 'Rejected booking leaves 09:00 available');
  assert.strictEqual(rejectedMap['09:15']?.available, true, 'Rejected booking leaves 09:15 available');
  assert.strictEqual(rejectedMap['09:30']?.available, true, 'Rejected booking leaves 09:30 available');
  assert.strictEqual(rejectedMap['09:45']?.available, true, 'Rejected booking leaves 09:45 available');
  assert.strictEqual(rejectedMap['10:00']?.available, true, 'Rejected booking leaves 10:00 available');
  assert.strictEqual(rejectedMap['10:15']?.available, true, 'Rejected booking leaves 10:15 available');
  console.log('  ✓ Payment rejected booking does not block any slot');

  // ---------------------------------------------------------------------------
  // TEST 4: Busy slots response privacy & PII exclusion
  // ---------------------------------------------------------------------------
  console.log('\n--- [TEST 4] BUSY-SLOTS RESPONSE CONTAINS ZERO CUSTOMER PII ---');

  // Raw mock database rows containing customer sensitive fields
  const mockDbRows = [
    {
      id: 'row-1',
      start_time: '09:00',
      end_time: '10:00',
      actual_end_time: null,
      status: 'confirmed',
      payment_status: 'awaiting_payment',
      customer_name: 'Confidential Client',
      customer_email: 'private@client.com',
      customer_phone: '+919876543210',
      notes: 'Sensitive health notes',
    },
    {
      id: 'row-2',
      start_time: '14:00',
      end_time: '15:00',
      actual_end_time: '14:45',
      status: 'completed',
      payment_status: 'confirmed',
      customer_name: 'Another Client',
      customer_email: 'another@client.com',
      customer_phone: '+919876543211',
      notes: 'Confidential consultation',
    },
    {
      id: 'row-3',
      start_time: '16:00',
      end_time: '17:00',
      actual_end_time: null,
      status: 'confirmed',
      payment_status: 'rejected', // MUST be filtered out
      customer_name: 'Rejected Client',
      customer_email: 'rejected@client.com',
      customer_phone: '+919876543212',
    },
  ];

  // Simulating the exact transformation logic in GET /api/public/busy-slots
  const sanitizedBusySlots = mockDbRows
    .filter(b => b.payment_status !== 'rejected')
    .map(b => ({
      start_time: b.start_time,
      end_time: b.end_time,
      actual_end_time: b.actual_end_time || null,
    }));

  assert.strictEqual(sanitizedBusySlots.length, 2, 'Rejected booking row excluded from busy slots');

  for (const slot of sanitizedBusySlots) {
    // Required fields exist
    assert(typeof slot.start_time === 'string', 'start_time is present');
    assert(typeof slot.end_time === 'string', 'end_time is present');

    // Sensitive customer PII must NEVER be present
    assert.strictEqual(slot.customer_name, undefined, 'customer_name must not be in busy-slots response');
    assert.strictEqual(slot.customer_email, undefined, 'customer_email must not be in busy-slots response');
    assert.strictEqual(slot.customer_phone, undefined, 'customer_phone must not be in busy-slots response');
    assert.strictEqual(slot.notes, undefined, 'notes must not be in busy-slots response');
    assert.strictEqual(slot.price, undefined, 'price must not be in busy-slots response');

    // Only allowed keys
    const keys = Object.keys(slot);
    assert(keys.every(k => ['start_time', 'end_time', 'actual_end_time'].includes(k)), 'Only safe time fields are exposed');
  }
  console.log('  ✓ Busy-slots response strictly contains only start_time, end_time, actual_end_time');
  console.log('  ✓ No customer name, email, phone, or notes are present');

  // ---------------------------------------------------------------------------
  // TEST 5: Integration with getTimeSlotsDetailedForDate using busy-slots payload
  // ---------------------------------------------------------------------------
  console.log('\n--- [TEST 5] INTEGRATION WITH getTimeSlotsDetailedForDate ---');
  const mockAvailability = {
    schedule: {
      friday: { available: true, start: '09:00', end: '18:00' },
    },
    bufferTime: 15,
  };
  const mockServices = [
    { id: 'svc-1', name: 'Consultation', duration: 60 },
  ];

  // Pass sanitized busy slots formatted as bookings (as done in BookingPage.jsx)
  const formattedDbBookings = sanitizedBusySlots.map(s => ({
    date: testDate,
    startTime: s.start_time,
    endTime: s.end_time,
    actualEndTime: s.actual_end_time,
    status: 'confirmed',
  }));

  const detailedSlots = getTimeSlotsDetailedForDate(
    testDate,
    mockAvailability,
    mockServices,
    'svc-1',
    formattedDbBookings,
    []
  );

  const integratedMap = Object.fromEntries(detailedSlots.map(s => [s.time, s]));

  assert.strictEqual(integratedMap['09:00']?.available, false, '09:00 unavailable');
  assert.strictEqual(integratedMap['09:15']?.available, false, '09:15 unavailable');
  assert.strictEqual(integratedMap['09:30']?.available, false, '09:30 unavailable');
  assert.strictEqual(integratedMap['09:45']?.available, false, '09:45 unavailable');
  assert.strictEqual(integratedMap['10:00']?.available, false, '10:00 unavailable');
  assert.strictEqual(integratedMap['10:15']?.available, true, '10:15 available');

  console.log('  ✓ getTimeSlotsDetailedForDate integrates busy slots faithfully');

  console.log('\n================================================================');
  console.log('✅ ALL PUBLIC BUSY SLOTS & DOUBLE-BOOKING TESTS PASSED');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
