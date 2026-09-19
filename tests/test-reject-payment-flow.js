/**
 * Test Reject Payment Flow End-to-End
 */
import assert from 'assert';
import { dbService } from '../src/services/supabase/dbService.js';
import { generateTimeSlotsDetailed } from '../src/utils/helpers.js';

async function runTests() {
  console.log('================================================================');
  console.log('TEST SUITE: REJECT PAYMENT FRONTEND & BACKEND INTEGRATION');
  console.log('================================================================');

  // Test 1: dbService.rejectPayment exists and returns expected response in mock/demo mode
  console.log('\n--- [TEST 1] dbService.rejectPayment API Signature & Mock Response ---');
  assert.strictEqual(typeof dbService.rejectPayment, 'function', 'dbService.rejectPayment is a function');
  
  // Calling without reason should succeed (reason is optional)
  const resNoReason = await dbService.rejectPayment('booking-123');
  assert.strictEqual(resNoReason.success, true, 'rejectPayment succeeds with no reason');
  assert.strictEqual(resNoReason.booking.paymentStatus, 'rejected', 'status is rejected');
  assert.strictEqual(resNoReason.booking.status, 'cancelled', 'booking is cancelled');
  console.log('  ✓ dbService.rejectPayment succeeds when reason is omitted');

  // Calling with reason should succeed
  const resWithReason = await dbService.rejectPayment('booking-123', 'UPI reference invalid');
  assert.strictEqual(resWithReason.success, true, 'rejectPayment succeeds with reason');
  console.log('  ✓ dbService.rejectPayment succeeds when reason is provided');

  // Test 2: Slot Availability When Booking is Rejected
  console.log('\n--- [TEST 2] Slot Availability When Payment is Rejected ---');

  // 1. When booking is pending verification (slot is occupied/blocked)
  const bookingsPending = [
    {
      id: 'b-1',
      serviceId: 'svc-1',
      date: '2026-11-20',
      startTime: '10:00',
      endTime: '11:00',
      status: 'confirmed',
      paymentStatus: 'verification_pending',
    },
  ];
  const slotsPending = generateTimeSlotsDetailed('09:00', '17:00', 60, 0, bookingsPending, [], 0, '2026-11-20');
  const slot10Pending = slotsPending.find(s => s.time === '10:00');
  assert.strictEqual(slot10Pending.available, false, '10:00 slot is unavailable when booking is pending');
  console.log('  ✓ Slot 10:00 is blocked when booking is active');

  // 2. When booking payment is rejected (status: 'cancelled', paymentStatus: 'rejected')
  const bookingsRejected = [
    {
      id: 'b-1',
      serviceId: 'svc-1',
      date: '2026-11-20',
      startTime: '10:00',
      endTime: '11:00',
      status: 'cancelled',
      paymentStatus: 'rejected',
    },
  ];
  const slotsRejected = generateTimeSlotsDetailed('09:00', '17:00', 60, 0, bookingsRejected, [], 0, '2026-11-20');
  const slot10Rejected = slotsRejected.find(s => s.time === '10:00');
  assert.strictEqual(slot10Rejected.available, true, '10:00 slot is available again when payment is rejected');
  console.log('  ✓ Slot 10:00 is available again when booking payment is rejected');

  console.log('\n================================================================');
  console.log('✅ ALL REJECT PAYMENT FLOW INTEGRATION TESTS PASSED');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('Test failure:', err);
  process.exit(1);
});
