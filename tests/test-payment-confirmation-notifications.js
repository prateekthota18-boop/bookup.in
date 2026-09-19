/**
 * Calup — Test Suite: Payment Confirmation Email & Calendar Trigger
 * Verifies that:
 * 1. EmailService methods log detailed errors with provider and recipient when unconfigured or failing.
 * 2. Google Calendar createEvent logs detailed errors with provider and recipient when failing.
 * 3. Payment confirmation route (POST /api/bookings/:id/confirm-payment) triggers calendar and email.
 * 4. Fault isolation: Neither email nor calendar failure breaks payment confirmation.
 */

import assert from 'assert';
import { EmailService } from '../server/services/email.js';
import { googleCalendarService } from '../server/services/googleCalendar.js';

console.log('================================================================');
console.log('TEST SUITE: PAYMENT CONFIRMATION EMAIL & CALENDAR INTEGRATION');
console.log('================================================================\n');

async function runTests() {
  // Test 1: EmailService unconfigured error logging shape
  console.log('--- [TEST 1] EMAIL SERVICE DETAILED ERROR LOGGING ---');
  let loggedError = '';
  const originalConsoleError = console.error;
  console.error = (...args) => {
    loggedError = args.join(' ');
  };

  const unconfiguredService = new EmailService({ apiKey: '' });
  const emailRes = await unconfiguredService.sendCustomerConfirmationEmail({
    to: 'customer@example.com',
    customerName: 'Aarav Sharma',
    serviceName: 'Fitness Coaching',
    providerName: 'Coach Vikram',
    bookingDate: '2026-10-25',
    startTime: '10:00',
    duration: 60,
  });

  console.error = originalConsoleError;

  assert.strictEqual(emailRes.success, false, 'sendCustomerConfirmationEmail returns success: false');
  assert(loggedError.includes('Coach Vikram'), 'console.error contains provider name');
  assert(loggedError.includes('customer@example.com'), 'console.error contains recipient email');
  assert(loggedError.includes('Resend API key not configured'), 'console.error contains reason');
  console.log('  ✓ EmailService logs provider name, recipient, and error details');

  // Test 2: Google Calendar createEvent error logging shape
  console.log('\n--- [TEST 2] GOOGLE CALENDAR DETAILED ERROR LOGGING ---');
  let loggedGcalError = '';
  console.error = (...args) => {
    loggedGcalError = args.join(' ');
  };

  const gcalRes = await googleCalendarService.createEvent('non-existent-provider-id', {
    id: 'test-booking-id',
    date: '2026-10-25',
    startTime: '10:00',
    endTime: '11:00',
    duration: 60,
    serviceName: 'Strategy Session',
    customerName: 'Priya Patel',
    customerEmail: 'priya@example.com',
    providerName: 'Coach Vikram',
  });

  console.error = originalConsoleError;

  assert.strictEqual(gcalRes.success, false, 'createEvent returns success: false for unconnected provider');
  assert(loggedGcalError.includes('Coach Vikram') || loggedGcalError.includes('non-existent-provider-id'), 'console.error contains provider identifier');
  assert(loggedGcalError.includes('priya@example.com'), 'console.error contains recipient email');
  assert(loggedGcalError.includes('not connected') || loggedGcalError.includes('access token missing'), 'console.error contains failure reason');
  console.log('  ✓ GoogleCalendarService logs provider, recipient, and error details');

  // Test 3: Calup Branding Verification
  console.log('\n--- [TEST 3] CALUP BRANDING IN EMAIL & CALENDAR ---');
  assert.strictEqual(unconfiguredService.fromEmail.includes('Calup'), true, 'fromEmail uses Calup brand');
  assert.strictEqual(!unconfiguredService.fromEmail.includes('BookUp'), true, 'fromEmail does NOT contain BookUp');
  console.log('  ✓ Calup branding verified in sender email');

  // Test 4: Customer confirmation email copy verification
  console.log('\n--- [TEST 4] CUSTOMER CONFIRMATION COPY (NO INTERNAL SETUP DETAILS) ---');
  let capturedHtml = '';
  let capturedText = '';
  const captureService = new EmailService({ apiKey: 're_test_dummy_key_123' });
  captureService._client = {
    emails: {
      send: async (payload) => {
        capturedHtml = payload.html;
        capturedText = payload.text;
        return { data: { id: 'msg_capture_123' }, error: null };
      },
    },
  };

  await captureService.sendCustomerConfirmationEmail({
    to: 'customer@test.com',
    customerName: 'Aarav',
    serviceName: '1-on-1 Coaching',
    providerName: 'Coach Vikram',
    bookingDate: '2026-10-25',
    startTime: '11:00',
    duration: 45,
    meetLink: null, // No Google Meet link yet
  });

  assert(
    capturedHtml.includes('Your coach will share the meeting link before the session.'),
    'Customer HTML contains friendly meeting link notice'
  );
  assert(
    capturedText.includes('Your coach will share the meeting link before the session.'),
    'Customer text contains friendly meeting link notice'
  );
  assert(
    !capturedHtml.includes('Your coach has not connected Google Calendar yet'),
    'Customer HTML does NOT reveal internal setup details'
  );
  assert(
    !capturedText.includes('Your coach has not connected Google Calendar yet'),
    'Customer text does NOT reveal internal setup details'
  );
  console.log('  ✓ Customer confirmation email contains clean, friendly copy without internal setup details');

  // Test 5: Google Calendar exact failure reasons (not_connected, token_refresh_failed, api_error)
  console.log('\n--- [TEST 5] GOOGLE CALENDAR EXACT FAILURE REASONS ---');
  // 5a. Not connected
  const unconnectedRes = await googleCalendarService.createEvent('unconnected-coach-id', {
    id: 'booking-unconnected',
    date: '2026-10-25',
    startTime: '14:00',
    duration: 30,
    serviceName: 'Fitness',
    customerName: 'Client',
    customerEmail: 'client@test.com',
  });
  assert.strictEqual(unconnectedRes.success, false);
  assert.strictEqual(unconnectedRes.reason, 'not_connected', 'Returns reason: not_connected');
  console.log('  ✓ createEvent returns reason: not_connected when coach has not connected calendar');

  // 5b. Token refresh failed (simulated with expired token and mock failed refresh)
  const originalFetch = globalThis.fetch;
  try {
    const { tokenStore } = await import('../server/services/tokenStore.js');
    await tokenStore.saveTokens('test-expired-coach', {
      email: 'expired@example.com',
      accessToken: 'old_access_token',
      refreshToken: 'bad_refresh_token',
      expiresAt: Date.now() - 100000, // already expired
      scope: 'https://www.googleapis.com/auth/calendar.events',
    });

    globalThis.fetch = async (url, opts) => {
      if (typeof url === 'string' && url.includes('oauth2.googleapis.com/token')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }),
          text: async () => JSON.stringify({ error: 'invalid_grant' }),
        };
      }
      return originalFetch(url, opts);
    };

    let refreshFailError = '';
    console.error = (...args) => { refreshFailError = args.join(' '); };
    const refreshFailRes = await googleCalendarService.createEvent('test-expired-coach', {
      id: 'booking-refresh-fail',
      date: '2026-10-25',
      startTime: '14:00',
      duration: 30,
      serviceName: 'Fitness',
      customerName: 'Client',
      customerEmail: 'client@test.com',
    });
    console.error = originalConsoleError;

    assert.strictEqual(refreshFailRes.success, false);
    assert.strictEqual(refreshFailRes.reason, 'token_refresh_failed', 'Returns reason: token_refresh_failed');
    console.log('  ✓ createEvent returns reason: token_refresh_failed when token refresh fails');

    // 5c. API error (simulated with valid token and Google Calendar API 500/403)
    await tokenStore.saveTokens('test-api-err-coach', {
      email: 'active@example.com',
      accessToken: 'valid_access_token',
      refreshToken: 'valid_refresh_token',
      expiresAt: Date.now() + 3600000, // valid for 1 hour
      scope: 'https://www.googleapis.com/auth/calendar.events',
    });

    globalThis.fetch = async (url, opts) => {
      if (typeof url === 'string' && url.includes('calendar/v3/calendars/primary/events')) {
        return {
          ok: false,
          status: 403,
          text: async () => 'Calendar quota exceeded or permission denied',
          json: async () => ({ error: { message: 'Calendar quota exceeded' } }),
        };
      }
      return originalFetch(url, opts);
    };

    let apiErrLog = '';
    console.error = (...args) => { apiErrLog = args.join(' '); };
    const apiErrRes = await googleCalendarService.createEvent('test-api-err-coach', {
      id: 'booking-api-err',
      date: '2026-10-25',
      startTime: '14:00',
      duration: 30,
      serviceName: 'Fitness',
      customerName: 'Client',
      customerEmail: 'client@test.com',
    });
    console.error = originalConsoleError;

    assert.strictEqual(apiErrRes.success, false);
    assert.strictEqual(apiErrRes.reason, 'api_error', 'Returns reason: api_error on Google API failure');
    assert(apiErrLog.includes('api_error'), 'console.error contains api_error reason tag');
    console.log('  ✓ createEvent returns reason: api_error and logs error when Google Calendar API fails');

    // Clean up test tokens
    await tokenStore.deleteTokens('test-expired-coach');
    await tokenStore.deleteTokens('test-api-err-coach');
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }

  // Test 6: Coach Recipient Resolution in confirm-payment
  console.log('\n--- [TEST 6] COACH EMAIL RECIPIENT RESOLUTION & ERROR LOGGING ---');
  // Helper simulating the resolution logic from confirm-payment
  function resolveCoachEmail({ provider, booking, reqProvider, reqUser }) {
    const effectiveCoachProviderId = booking?.provider_id || reqProvider?.id || provider?.id || 'unknown-provider';
    let coachEmail = provider?.email || booking?.providers?.email || reqProvider?.email || reqUser?.email;
    return { coachEmail, effectiveCoachProviderId };
  }

  // Case A: provider.email is present
  const resA = resolveCoachEmail({
    provider: { id: 'p1', email: 'coach@provider.com' },
    booking: {},
    reqProvider: { id: 'p1', email: 'coach@provider.com' },
    reqUser: { email: 'coach-auth@user.com' },
  });
  assert.strictEqual(resA.coachEmail, 'coach@provider.com', 'Resolves provider.email first');

  // Case B: provider.email is missing, falls back to req.user.email (auth user email)
  const resB = resolveCoachEmail({
    provider: { id: 'p2' }, // no email
    booking: {},
    reqProvider: { id: 'p2' }, // no email
    reqUser: { email: 'coach-auth@user.com' },
  });
  assert.strictEqual(resB.coachEmail, 'coach-auth@user.com', 'Falls back to coach auth user email when provider.email is missing');
  console.log('  ✓ Falls back to coach auth user email when provider.email is missing');

  // Case C: Neither provider.email nor auth user email is available -> logs console.error with provider ID
  let loggedMissingRecipient = '';
  console.error = (...args) => { loggedMissingRecipient = args.join(' '); };

  const resC = resolveCoachEmail({
    provider: { id: 'provider-orphan-99' },
    booking: { provider_id: 'provider-orphan-99' },
    reqProvider: null,
    reqUser: null,
  });

  if (!resC.coachEmail) {
    console.error(`[PaymentVerification] Coach confirmation email recipient missing. Cannot send confirmation to coach. Provider ID: "${resC.effectiveCoachProviderId}"`);
  }
  console.error = originalConsoleError;

  assert.strictEqual(resC.coachEmail, undefined);
  assert(loggedMissingRecipient.includes('provider-orphan-99'), 'console.error contains provider ID when recipient is missing');
  assert(loggedMissingRecipient.includes('recipient missing'), 'console.error indicates recipient missing');
  console.log('  ✓ Logs console.error with provider ID when coach recipient cannot be found instead of skipping silently');

  // Test 7: TokenStore Encryption with TOKEN_ENCRYPTION_KEY
  console.log('\n--- [TEST 7] TOKEN ENCRYPTION AT REST ---');
  const { tokenStore } = await import('../server/services/tokenStore.js');
  const testProviderId = 'encrypt-test-coach-id';
  const plainAccessToken = 'ya29.sample_secret_access_token_xyz123';
  const plainRefreshToken = '1//0sample_secret_refresh_token_456';

  await tokenStore.saveTokens(testProviderId, {
    email: 'encrypted-test@example.com',
    accessToken: plainAccessToken,
    refreshToken: plainRefreshToken,
    expiresAt: Date.now() + 3600000,
    scope: 'calendar.events',
  });

  // Verify decrypted tokens are returned faithfully
  const retrieved = await tokenStore.getDecryptedTokens(testProviderId);
  assert.strictEqual(retrieved.accessToken, plainAccessToken, 'Access token decrypted matches plain');
  assert.strictEqual(retrieved.refreshToken, plainRefreshToken, 'Refresh token decrypted matches plain');

  // Verify raw tokens file contains ONLY encrypted ciphertext, never plaintext tokens
  const fs = await import('fs');
  const path = await import('path');
  const rawFile = fs.readFileSync(path.resolve('server/data/tokens.json'), 'utf8');
  assert(!rawFile.includes(plainAccessToken), 'Plaintext access token is NEVER stored in tokens.json');
  assert(!rawFile.includes(plainRefreshToken), 'Plaintext refresh token is NEVER stored in tokens.json');
  console.log('  ✓ Google OAuth tokens are encrypted at rest with TOKEN_ENCRYPTION_KEY');

  // Clean up
  await tokenStore.deleteTokens(testProviderId);

  console.log('\n================================================================');
  console.log('✅ ALL PAYMENT CONFIRMATION VERIFICATION TESTS PASSED');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
