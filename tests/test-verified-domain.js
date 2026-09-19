import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAppBaseUrl, getBookingUrl, getBookingDisplayUrl, getCustomerManagementUrl } from '../src/utils/url.js';
import { buildManagementUrl } from '../src/utils/token.js';
import { generateIcsCalendar } from '../server/utils/ics.js';
import { MockWhatsAppProvider } from '../src/services/notifications/MockWhatsAppProvider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('VERIFICATION SUITE: DOMAIN & BOOKING LINK RESOLUTION');
console.log('================================================================');

// 1. URL Helper Verification
console.log('\n--- [TEST 1] FRONTEND URL RESOLUTION UTILITY ---');
const baseUrl = getAppBaseUrl();
console.log(`  Resolved Base URL: ${baseUrl}`);
assert.strictEqual(baseUrl, 'https://calup-in.vercel.app', 'Base URL correctly defaults/resolves to https://calup-in.vercel.app');

const testSlug = 'yourslovely';
const fullBookingUrl = getBookingUrl(testSlug);
console.log(`  Full Booking URL: ${fullBookingUrl}`);
assert.strictEqual(fullBookingUrl, 'https://calup-in.vercel.app/book/yourslovely', 'Booking URL matches exact production structure');

const displayBookingUrl = getBookingDisplayUrl(testSlug);
console.log(`  Display Booking URL: ${displayBookingUrl}`);
assert.strictEqual(displayBookingUrl, 'calup-in.vercel.app/book/yourslovely', 'Display booking URL strips protocol cleanly');

const testToken = 'mgmt_token_abc123';
const customerMgmtUrl = getCustomerManagementUrl(testToken);
console.log(`  Customer Management URL: ${customerMgmtUrl}`);
assert.strictEqual(customerMgmtUrl, 'https://calup-in.vercel.app/manage/mgmt_token_abc123', 'Management URL formatted properly');

const builtMgmtUrl = buildManagementUrl(testToken);
assert.strictEqual(builtMgmtUrl, customerMgmtUrl, 'buildManagementUrl delegates to getCustomerManagementUrl');
console.log('  ✓ Frontend URL helpers verified');

// 2. ICS Calendar UID and Domain Verification
console.log('\n--- [TEST 2] ICS CALENDAR GENERATOR DOMAIN ---');
const icsOutput = generateIcsCalendar({
  serviceName: '1-on-1 Consultation',
  providerName: 'Coach Test',
  bookingDate: '2026-10-20',
  startTime: '10:00',
  duration: 60,
  bookingId: 'test-booking-id-999',
});
assert(icsOutput.includes('UID:test-booking-id-999@calup-in.vercel.app\r\n'), 'ICS UID uses @calup-in.vercel.app domain');
assert(!icsOutput.includes('@bookup.in'), 'ICS output does NOT contain @bookup.in');
console.log('  ✓ ICS calendar UID domain verified');

// 3. Mock WhatsApp Notifications
console.log('\n--- [TEST 3] MOCK WHATSAPP NOTIFICATION STRINGS ---');
const waProvider = new MockWhatsAppProvider();
const cancelMsg = waProvider.generateCancellationMessage(
  { customerName: 'Rohan', serviceName: 'Fitness Class', date: '2026-10-25' },
  { name: 'Coach Alex', slug: 'alex-fit' }
);
console.log(`  Sample cancellation notice:\n  "${cancelMsg.replace(/\n/g, ' ')}"`);
assert(cancelMsg.includes('https://calup-in.vercel.app/book/alex-fit'), 'Cancellation message embeds real booking URL');
assert(!cancelMsg.includes('bookup.in/'), 'Cancellation message does NOT reference bookup.in');
console.log('  ✓ WhatsApp templates verified');

// 4. Codebase Audit for active src/ and server/ files
console.log('\n--- [TEST 4] ACTIVE CODEBASE SEARCH AUDIT ---');
const scanDirs = ['src', 'server'];
const badOccurrences = [];

function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (/\.(jsx?|tsx?|css|html|json)$/i.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (/bookup\.in\/(book|dashboard|manage)/i.test(content) || /['"]bookup\.in['"]/i.test(content)) {
        badOccurrences.push({ file: fullPath, match: content.match(/bookup\.in[^\s'"]*/)?.[0] });
      }
    }
  }
}

for (const dir of scanDirs) {
  scanDirectory(path.join(rootDir, dir));
}

if (badOccurrences.length > 0) {
  console.error('  ❌ Found lingering wrong domain occurrences:', badOccurrences);
  process.exit(1);
} else {
  console.log('  ✓ 0 hardcoded "bookup.in" URL occurrences found across src/ and server/');
}

console.log('\n================================================================');
console.log('✅ ALL DOMAIN & LINK VERIFICATIONS PASSED SUCCESSFULLY');
console.log('================================================================\n');
