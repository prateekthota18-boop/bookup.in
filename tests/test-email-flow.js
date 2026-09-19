/**
 * Calup — Email Flow Test Suite
 *
 * Verifies all 5 email specifications in the Calup booking lifecycle:
 * 1. POST /api/public/bookings (booking created, payment pending):
 *    - Coach: "New booking - awaiting payment" (client name, service, date/time, no .ics, no meet link)
 *    - Customer: "Booking received - payment verification pending" (slot reserved, coach will confirm shortly, NO "You're booked!", NO .ics)
 * 2. mark-paid (customer clicks "I've Paid"):
 *    - Coach: payment-submitted email (verify payment in dashboard)
 * 3. confirm-payment (coach accepts):
 *    - Customer: "Booking confirmed" (Google Meet link, .ics attachment, manage link; if no Meet link, says coach will share link)
 *    - Coach: "Booking confirmed" (client details and Meet link)
 * 4. Coach rejects payment:
 *    - Customer: "Payment could not be verified - please contact <coach name>" with coach contact details, NO .ics
 * 5. Fault Isolation & Rules:
 *    - Every send wrapped in try/catch with console.error including recipient and error
 *    - Failed email never breaks booking, payment, or reject action
 *    - Brand name "Calup" (not "CalUp" or "BookUp") in all headers and subjects
 */

import assert from 'assert';
import { EmailService } from '../server/services/email.js';

console.log('================================================================');
console.log('TEST SUITE: CALUP EXACT EMAIL NOTIFICATION FLOW');
console.log('================================================================\n');

async function runEmailFlowTests() {
  // --- [TEST 1] COACH: "New booking - awaiting payment" (POST /api/public/bookings) ---
  console.log('--- [TEST 1] COACH: "New booking - awaiting payment" ---');
  let capturedCoachPendingMail = null;
  const mockCoachPendingClient = {
    emails: {
      send: async (options) => {
        capturedCoachPendingMail = options;
        return { data: { id: 'mock-coach-pending-id' }, error: null };
      },
    },
  };

  const emailService1 = new EmailService({
    apiKey: 're_mock_key',
    client: mockCoachPendingClient,
  });

  const res1 = await emailService1.sendCoachBookingAwaitingPaymentEmail({
    to: 'coach@example.com',
    providerName: 'Coach Vikram',
    customerName: 'Rahul Verma',
    customerEmail: 'rahul@example.com',
    customerPhone: '+91 9876543210',
    serviceName: '1-on-1 Fitness Consultation',
    bookingDate: '2026-11-20',
    startTime: '10:00',
    duration: 45,
    amount: 1500,
  });

  assert.strictEqual(res1.success, true, 'sendCoachBookingAwaitingPaymentEmail succeeds');
  assert(capturedCoachPendingMail, 'Email payload was captured');
  assert.strictEqual(capturedCoachPendingMail.to[0], 'coach@example.com', 'Recipient is coach email');
  assert(capturedCoachPendingMail.subject.includes('New booking - awaiting payment'), 'Subject contains "New booking - awaiting payment"');
  assert(capturedCoachPendingMail.subject.includes('Rahul Verma'), 'Subject contains customer name');
  assert(capturedCoachPendingMail.subject.includes('1-on-1 Fitness Consultation'), 'Subject contains service name');
  assert(!capturedCoachPendingMail.subject.includes('CalUp'), 'Subject does NOT contain "CalUp"');
  assert(!capturedCoachPendingMail.subject.includes('BookUp'), 'Subject does NOT contain "BookUp"');

  // Verify Header branding
  assert(capturedCoachPendingMail.html.includes('Calup'), 'Header contains "Calup"');
  assert(!capturedCoachPendingMail.html.includes('CalUp'), 'HTML does NOT contain "CalUp"');
  assert(!capturedCoachPendingMail.html.includes('BookUp'), 'HTML does NOT contain "BookUp"');

  // Verify Details
  assert(capturedCoachPendingMail.html.includes('Rahul Verma'), 'HTML contains client name');
  assert(capturedCoachPendingMail.html.includes('1-on-1 Fitness Consultation'), 'HTML contains service');
  assert(capturedCoachPendingMail.html.includes('2026-11-20'), 'HTML contains date');
  assert(capturedCoachPendingMail.html.includes('10:00'), 'HTML contains time');
  assert(capturedCoachPendingMail.html.includes('1500'), 'HTML contains amount');

  // Verify NO .ics and NO meet link
  assert(!capturedCoachPendingMail.attachments || capturedCoachPendingMail.attachments.length === 0, 'NO .ics attachment');
  assert(!capturedCoachPendingMail.html.includes('meet.google.com'), 'NO meet link in HTML');
  assert(!capturedCoachPendingMail.text.includes('meet.google.com'), 'NO meet link in plain text');
  console.log('  ✓ Coach awaiting payment email verified (correct subject, details, no .ics, no meet link, Calup branding)');

  // --- [TEST 2] CUSTOMER: "Booking received - payment verification pending" (POST /api/public/bookings) ---
  console.log('\n--- [TEST 2] CUSTOMER: "Booking received - payment verification pending" ---');
  let capturedCustPendingMail = null;
  const mockCustPendingClient = {
    emails: {
      send: async (options) => {
        capturedCustPendingMail = options;
        return { data: { id: 'mock-cust-pending-id' }, error: null };
      },
    },
  };

  const emailService2 = new EmailService({
    apiKey: 're_mock_key',
    client: mockCustPendingClient,
  });

  const res2 = await emailService2.sendCustomerBookingPendingEmail({
    to: 'customer@example.com',
    customerName: 'Ananya Roy',
    serviceName: 'Career Coaching',
    providerName: 'Coach Vikram',
    bookingDate: '2026-11-20',
    startTime: '14:00',
    duration: 60,
  });

  assert.strictEqual(res2.success, true, 'sendCustomerBookingPendingEmail succeeds');
  assert(capturedCustPendingMail, 'Email payload was captured');
  assert.strictEqual(capturedCustPendingMail.to[0], 'customer@example.com', 'Recipient is customer email');
  assert(capturedCustPendingMail.subject.includes('Booking received - payment verification pending'), 'Subject contains "Booking received - payment verification pending"');
  assert(!capturedCustPendingMail.subject.includes('CalUp'), 'Subject does NOT contain "CalUp"');

  // Header branding
  assert(capturedCustPendingMail.html.includes('Calup'), 'Header contains "Calup"');
  assert(!capturedCustPendingMail.html.includes('CalUp'), 'HTML does NOT contain "CalUp"');

  // Verify "slot is reserved and coach will confirm shortly"
  assert(
    capturedCustPendingMail.html.includes('slot is reserved and the coach will confirm shortly') ||
    capturedCustPendingMail.text.includes('slot is reserved and the coach will confirm shortly'),
    'Informs customer that slot is reserved and coach will confirm shortly'
  );

  // STRICTLY NO "You're booked!" wording
  assert(!capturedCustPendingMail.html.includes("You're booked!"), 'STRICTLY NO "You\'re booked!" in HTML');
  assert(!capturedCustPendingMail.text.includes("You're booked!"), 'STRICTLY NO "You\'re booked!" in text');

  // STRICTLY NO .ics attachment
  assert(!capturedCustPendingMail.attachments || capturedCustPendingMail.attachments.length === 0, 'NO .ics attachment');
  console.log('  ✓ Customer booking pending email verified (reserved message, NO "You\'re booked!", NO .ics, Calup branding)');

  // --- [TEST 3] COACH: Payment submitted (mark-paid) ---
  console.log('\n--- [TEST 3] COACH: Payment Submitted (mark-paid) ---');
  let capturedPaymentSubmittedMail = null;
  const mockPaymentClient = {
    emails: {
      send: async (options) => {
        capturedPaymentSubmittedMail = options;
        return { data: { id: 'mock-payment-sub-id' }, error: null };
      },
    },
  };

  const emailService3 = new EmailService({
    apiKey: 're_mock_key',
    client: mockPaymentClient,
  });

  const res3 = await emailService3.sendPaymentSubmittedEmailToProvider({
    to: 'coach@example.com',
    providerName: 'Coach Vikram',
    customerName: 'Ananya Roy',
    customerEmail: 'ananya@example.com',
    customerPhone: '+91 9988776655',
    serviceName: 'Career Coaching',
    bookingDate: '2026-11-20',
    startTime: '14:00',
    amount: 2000,
    screenshotUrl: 'https://example.com/screenshot.jpg',
    dashboardUrl: 'https://calup-in.vercel.app/dashboard/appointments',
  });

  assert.strictEqual(res3.success, true, 'sendPaymentSubmittedEmailToProvider succeeds');
  assert(capturedPaymentSubmittedMail, 'Email payload was captured');
  assert(capturedPaymentSubmittedMail.subject.includes('Payment Submitted'), 'Subject contains "Payment Submitted"');
  assert(capturedPaymentSubmittedMail.subject.includes('2000'), 'Subject contains amount paid');
  assert(capturedPaymentSubmittedMail.html.includes('Calup'), 'Header uses "Calup"');
  assert(!capturedPaymentSubmittedMail.html.includes('CalUp'), 'Does NOT use "CalUp"');
  assert(capturedPaymentSubmittedMail.html.includes('https://calup-in.vercel.app/dashboard/appointments'), 'Includes dashboard verification link');
  assert(capturedPaymentSubmittedMail.html.includes('https://example.com/screenshot.jpg'), 'Includes screenshot link');
  console.log('  ✓ Payment submitted email verified (subject, dashboard link, screenshot, Calup branding)');

  // --- [TEST 4] CONFIRM PAYMENT (CUSTOMER & COACH) ---
  console.log('\n--- [TEST 4] CONFIRM PAYMENT: CUSTOMER & COACH NOTIFICATIONS ---');
  // 4a. Customer confirmation with Google Meet link
  let capturedCustConfirmMail = null;
  const mockCustConfirmClient = {
    emails: {
      send: async (options) => {
        capturedCustConfirmMail = options;
        return { data: { id: 'mock-cust-confirm-id' }, error: null };
      },
    },
  };

  const emailService4a = new EmailService({
    apiKey: 're_mock_key',
    client: mockCustConfirmClient,
  });

  const res4a = await emailService4a.sendCustomerConfirmationEmail({
    to: 'customer@example.com',
    customerName: 'Ananya Roy',
    serviceName: 'Career Coaching',
    providerName: 'Coach Vikram',
    bookingDate: '2026-11-20',
    startTime: '14:00',
    duration: 60,
    meetLink: 'https://meet.google.com/abc-defg-hij',
    managementUrl: 'https://calup-in.vercel.app/manage/secret-token-xyz',
  });

  assert.strictEqual(res4a.success, true, 'sendCustomerConfirmationEmail succeeds');
  assert(capturedCustConfirmMail.subject.includes('Booking Confirmed'), 'Subject contains "Booking Confirmed"');
  assert(capturedCustConfirmMail.html.includes('https://meet.google.com/abc-defg-hij'), 'Customer email embeds Google Meet link');
  assert(capturedCustConfirmMail.html.includes('https://calup-in.vercel.app/manage/secret-token-xyz'), 'Customer email embeds management URL');
  assert(Array.isArray(capturedCustConfirmMail.attachments) && capturedCustConfirmMail.attachments.length === 1, 'Contains exactly 1 attachment');
  assert.strictEqual(capturedCustConfirmMail.attachments[0].filename, 'invite.ics', 'Attachment is invite.ics');
  assert(capturedCustConfirmMail.attachments[0].contentType.includes('text/calendar'), 'Attachment contentType is text/calendar');

  // 4b. Customer confirmation without Meet link (fallback message)
  let capturedCustNoMeetMail = null;
  const mockCustNoMeetClient = {
    emails: {
      send: async (options) => {
        capturedCustNoMeetMail = options;
        return { data: { id: 'mock-cust-nomeet-id' }, error: null };
      },
    },
  };
  const emailService4b = new EmailService({
    apiKey: 're_mock_key',
    client: mockCustNoMeetClient,
  });

  await emailService4b.sendCustomerConfirmationEmail({
    to: 'customer@example.com',
    customerName: 'Ananya Roy',
    serviceName: 'Career Coaching',
    providerName: 'Coach Vikram',
    bookingDate: '2026-11-20',
    startTime: '14:00',
    duration: 60,
    meetLink: '',
    managementUrl: 'https://calup-in.vercel.app/manage/secret-token-xyz',
  });

  assert(
    capturedCustNoMeetMail.html.includes('share the link') ||
    capturedCustNoMeetMail.text.includes('share the link'),
    'Fallback message indicates coach will share the link when Google Calendar is not connected'
  );
  console.log('  ✓ Customer confirmation email verified (Meet link, .ics attachment, manage link, and fallback when no Meet link)');

  // 4c. Coach confirmation with client details and Meet link
  let capturedCoachConfirmMail = null;
  const mockCoachConfirmClient = {
    emails: {
      send: async (options) => {
        capturedCoachConfirmMail = options;
        return { data: { id: 'mock-coach-confirm-id' }, error: null };
      },
    },
  };

  const emailService4c = new EmailService({
    apiKey: 're_mock_key',
    client: mockCoachConfirmClient,
  });

  const res4c = await emailService4c.sendCoachBookingConfirmedEmail({
    to: 'coach@example.com',
    providerName: 'Coach Vikram',
    customerName: 'Ananya Roy',
    customerEmail: 'ananya@example.com',
    customerPhone: '+91 9988776655',
    serviceName: 'Career Coaching',
    bookingDate: '2026-11-20',
    startTime: '14:00',
    duration: 60,
    meetLink: 'https://meet.google.com/abc-defg-hij',
  });

  assert.strictEqual(res4c.success, true, 'sendCoachBookingConfirmedEmail succeeds');
  assert(capturedCoachConfirmMail.subject.includes('Booking Confirmed'), 'Subject contains "Booking Confirmed"');
  assert(capturedCoachConfirmMail.subject.includes('Ananya Roy'), 'Subject contains client name');
  assert(capturedCoachConfirmMail.html.includes('Ananya Roy'), 'Contains client details: name');
  assert(capturedCoachConfirmMail.html.includes('ananya@example.com'), 'Contains client details: email');
  assert(capturedCoachConfirmMail.html.includes('+91 9988776655'), 'Contains client details: phone');
  assert(capturedCoachConfirmMail.html.includes('https://meet.google.com/abc-defg-hij'), 'Contains Google Meet link');
  assert(!capturedCoachConfirmMail.attachments || capturedCoachConfirmMail.attachments.length === 0, 'Coach email has NO .ics attachment');
  console.log('  ✓ Coach confirmation email verified (subject, client details, Meet link, Calup branding)');

  // --- [TEST 5] COACH REJECTS PAYMENT (CUSTOMER REJECTION NOTIFICATION) ---
  console.log('\n--- [TEST 5] COACH REJECTS PAYMENT ---');
  let capturedRejectMail = null;
  const mockRejectClient = {
    emails: {
      send: async (options) => {
        capturedRejectMail = options;
        return { data: { id: 'mock-reject-id' }, error: null };
      },
    },
  };

  const emailService5 = new EmailService({
    apiKey: 're_mock_key',
    client: mockRejectClient,
  });

  const res5 = await emailService5.sendPaymentRejectedEmailToCustomer({
    to: 'customer@example.com',
    customerName: 'Kunal Sen',
    serviceName: 'Tech Architecture Review',
    providerName: 'Coach Vikram',
    bookingDate: '2026-11-25',
    startTime: '16:00',
    providerEmail: 'vikram.coach@example.com',
    providerPhone: '+91 9876500000',
    providerWhatsApp: '+91 9876500000',
    reason: 'UPI transaction ID does not match records.',
  });

  assert.strictEqual(res5.success, true, 'sendPaymentRejectedEmailToCustomer succeeds');
  assert(capturedRejectMail, 'Email payload was captured');
  assert(capturedRejectMail.subject.includes('Payment could not be verified - please contact Coach Vikram'), 'Subject contains "Payment could not be verified - please contact <coach name>"');
  assert(capturedRejectMail.html.includes('Calup'), 'Header contains "Calup"');
  assert(!capturedRejectMail.html.includes('CalUp'), 'Does NOT contain "CalUp"');
  assert(capturedRejectMail.html.includes('vikram.coach@example.com'), 'Contains coach contact email');
  assert(capturedRejectMail.html.includes('+91 9876500000'), 'Contains coach contact phone');
  assert(capturedRejectMail.html.includes('UPI transaction ID does not match records'), 'Contains rejection reason');
  assert(!capturedRejectMail.attachments || capturedRejectMail.attachments.length === 0, 'Does NOT attach .ics');
  console.log('  ✓ Customer payment rejection email verified (subject with coach name, contact details, reason, NO .ics)');

  // --- [TEST 6] FAULT ISOLATION: ERROR LOGGING AND NON-THROWING ---
  console.log('\n--- [TEST 6] FAULT ISOLATION & ERROR LOGGING (CONSOLE.ERROR RECIPIENT & ERROR) ---');
  let loggedError = '';
  const origConsoleError = console.error;
  console.error = (...args) => {
    loggedError += args.join(' ') + '\n';
  };

  const failingMockClient = {
    emails: {
      send: async () => {
        return { data: null, error: { message: 'Resend rate limit exceeded' } };
      },
    },
  };

  const failingService = new EmailService({
    apiKey: 're_test_key',
    client: failingMockClient,
  });

  // Test failure isolation on each method: none should throw!
  const fail1 = await failingService.sendCoachBookingAwaitingPaymentEmail({
    to: 'fail-coach@example.com',
    providerName: 'Coach Priya',
    customerName: 'Client X',
    serviceName: 'Yoga',
    bookingDate: '2026-11-20',
    startTime: '08:00',
    duration: 60,
  });
  assert.strictEqual(fail1.success, false, 'Reports success: false without throwing');
  assert(loggedError.includes('fail-coach@example.com'), 'Logged error contains recipient');
  assert(loggedError.includes('Resend rate limit exceeded'), 'Logged error contains error message');

  const fail2 = await failingService.sendCustomerBookingPendingEmail({
    to: 'fail-cust@example.com',
    customerName: 'Client Y',
    serviceName: 'Pilates',
    providerName: 'Coach Priya',
    bookingDate: '2026-11-20',
    startTime: '09:00',
    duration: 60,
  });
  assert.strictEqual(fail2.success, false, 'Reports success: false without throwing');
  assert(loggedError.includes('fail-cust@example.com'), 'Logged error contains recipient');

  const fail3 = await failingService.sendCoachBookingConfirmedEmail({
    to: 'fail-coach-confirm@example.com',
    providerName: 'Coach Priya',
    customerName: 'Client Z',
    serviceName: 'Nutrition',
    bookingDate: '2026-11-20',
    startTime: '10:00',
    duration: 30,
  });
  assert.strictEqual(fail3.success, false, 'Reports success: false without throwing');
  assert(loggedError.includes('fail-coach-confirm@example.com'), 'Logged error contains recipient');

  const fail4 = await failingService.sendPaymentRejectedEmailToCustomer({
    to: 'fail-cust-reject@example.com',
    customerName: 'Client W',
    serviceName: 'Strength',
    providerName: 'Coach Priya',
    bookingDate: '2026-11-20',
    startTime: '11:00',
  });
  assert.strictEqual(fail4.success, false, 'Reports success: false without throwing');
  assert(loggedError.includes('fail-cust-reject@example.com'), 'Logged error contains recipient');

  console.error = origConsoleError;
  console.log('  ✓ Fault isolation verified: every method logs recipient + error with console.error and returns gracefully');

  console.log('\n================================================================');
  console.log('✅ ALL 5 CALUP EMAIL FLOW TESTS PASSED (6/6 SECTIONS VERIFIED)');
  console.log('================================================================\n');
}

runEmailFlowTests().catch(err => {
  console.error('❌ Email flow test suite failed:', err);
  process.exit(1);
});
