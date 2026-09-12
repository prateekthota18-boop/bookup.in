/**
 * Test: Authenticated user with saved provider profile can initiate Google Calendar OAuth
 * Also tests backend auto-provisioning fallback for authenticated user without pre-saved profile.
 */

import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { verifyOAuthState } from '../server/utils/crypto.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Supabase credentials missing from .env');
  process.exit(1);
}

const client = createClient(url, key);

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function runTest() {
  console.log('================================================================');
  console.log('TEST SUITE: AUTHENTICATED USER → PROVIDER LINKING → GOOGLE CALENDAR');
  console.log('================================================================\n');

  const rand = Math.floor(Math.random() * 900000) + 100000;
  const email = `saved_profile_tester_${rand}@testbookup.dev`;
  const password = 'Password123!Secure';
  const name = 'Dr. Verified Profile';

  // PART A: USER WITH SAVED PROFILE (Settings → Save Profile → Connect Google Calendar)
  console.log('--- PART A: USER WITH EXPLICIT SAVED PROFILE ---');
  console.log('1. User Signup & Authentication');
  const { data: signData, error: signErr } = await client.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (signErr) throw signErr;
  const user = signData.user;
  assert(Boolean(user?.id), `Supabase Auth user created: ${user.id}`);

  let token = signData.session?.access_token;
  if (!token) {
    const { data: loginData, error: loginErr } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (loginErr) throw loginErr;
    token = loginData.session.access_token;
  }
  assert(Boolean(token), 'Acquired valid Bearer access token');

  // Authenticated user client (representing the logged-in user in browser)
  const authUserClient = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  // STEP 2: Save Profile (Settings.jsx handleSaveProfile)
  console.log('\n2. Save Profile Operation (mimicking Settings.jsx handleSaveProfile)');
  const slug = `verified-doctor-${rand}`;
  const { data: createdProvider, error: createProvErr } = await authUserClient
    .from('providers')
    .insert({
      user_id: user.id,
      name,
      business_name: 'Verified Medical Centre',
      slug,
      email,
      phone: '+91 91234 56789',
      bio: 'Board-certified specialist providing holistic consultations.',
      timezone: 'Asia/Kolkata',
    })
    .select()
    .single();

  if (createProvErr) throw createProvErr;
  assert(Boolean(createdProvider?.id), `Provider profile created with ID: ${createdProvider.id}`);
  assert(createdProvider.user_id === user.id, 'Provider user_id strictly matches authenticated user.id');
  assert(createdProvider.slug === slug, `Provider slug matches: ${slug}`);

  // Re-save (second click on Save Profile)
  const { error: updateErr } = await authUserClient
    .from('providers')
    .update({
      business_name: 'Verified Medical Centre — Updated',
    })
    .eq('id', createdProvider.id);
  assert(!updateErr, 'Provider profile updated successfully on re-save without duplicate key error');

  // Verify single provider record exists for user
  const { data: provList } = await client
    .from('providers')
    .select('id, user_id')
    .eq('user_id', user.id);
  assert(provList.length === 1, `Verified exactly 1 provider record exists for user (found ${provList.length})`);
  assert(provList[0].user_id === user.id, 'providers.user_id exactly equals auth.users.id');

  // STEP 3: Google Calendar OAuth Initiation
  console.log('\n3. Google Calendar OAuth Initiation (GET /api/auth/google/url)');
  const oauthRes = await fetch('http://localhost:3001/api/auth/google/url', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  assert(oauthRes.status === 200, `HTTP status is 200 OK (received ${oauthRes.status})`);
  const oauthBody = await oauthRes.json();
  assert(oauthBody.success === true, 'Response body success is true');
  assert(Boolean(oauthBody.url), 'Response includes generated Google OAuth URL');
  assert(oauthBody.url.includes('accounts.google.com/o/oauth2/v2/auth'), 'OAuth URL points to accounts.google.com');

  // Parse state from URL to verify HMAC and providerId binding
  const parsedUrl = new URL(oauthBody.url);
  const stateToken = parsedUrl.searchParams.get('state');
  assert(Boolean(stateToken), 'OAuth URL contains signed state parameter');

  const stateCheck = verifyOAuthState(stateToken);
  assert(stateCheck.valid === true, 'OAuth state signature verification succeeds');
  assert(stateCheck.providerId === createdProvider.id, `OAuth state is bound to the exact saved providerId (${createdProvider.id})`);

  // STEP 4: Google Calendar Status Check
  console.log('\n4. Google Calendar Status Check (GET /api/auth/google/status)');
  const statusRes = await fetch('http://localhost:3001/api/auth/google/status', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  assert(statusRes.status === 200, `Status HTTP code is 200 OK (received ${statusRes.status})`);
  const statusBody = await statusRes.json();
  assert(statusBody.success === true, 'Status response success is true');
  assert(statusBody.isConnected === false, 'Fresh provider shows isConnected: false');

  // PART B: USER WITHOUT PRE-SAVED PROFILE (Direct Connect → Backend Auto-Provisioning)
  console.log('\n--- PART B: USER WITHOUT PRE-SAVED PROFILE (AUTO-PROVISIONING) ---');
  const randB = Math.floor(Math.random() * 900000) + 100000;
  const emailB = `direct_oauth_user_${randB}@testbookup.dev`;
  const nameB = 'Direct OAuth Provider';

  const { data: signDataB, error: signErrB } = await client.auth.signUp({
    email: emailB,
    password,
    options: { data: { name: nameB } },
  });
  if (signErrB) throw signErrB;
  const userB = signDataB.user;
  let tokenB = signDataB.session?.access_token;
  if (!tokenB) {
    const { data: loginB } = await client.auth.signInWithPassword({ email: emailB, password });
    tokenB = loginB.session.access_token;
  }
  assert(Boolean(tokenB), `User B authenticated with ID: ${userB.id}`);

  // Confirm User B has NO provider row yet in Supabase
  const { data: beforeProv } = await client
    .from('providers')
    .select('id')
    .eq('user_id', userB.id);
  assert(beforeProv.length === 0, 'User B initially has 0 provider records in Supabase');

  // Call GET /api/auth/google/url without prior profile save
  console.log('Calling GET /api/auth/google/url for User B (triggering backend provisioning)...');
  const oauthResB = await fetch('http://localhost:3001/api/auth/google/url', {
    headers: {
      Authorization: `Bearer ${tokenB}`,
    },
  });

  assert(oauthResB.status === 200, `User B HTTP status is 200 OK (received ${oauthResB.status})`);
  const oauthBodyB = await oauthResB.json();
  assert(oauthBodyB.success === true, 'User B received success: true');
  assert(Boolean(oauthBodyB.url), 'User B received valid Google OAuth URL');

  // Verify exactly 1 provider record was provisioned in Supabase
  const { data: afterProv } = await client
    .from('providers')
    .select('id, user_id, slug, email')
    .eq('user_id', userB.id);
  assert(afterProv.length === 1, `Verified exactly 1 provider record was auto-provisioned for User B (found ${afterProv.length})`);
  assert(afterProv[0].user_id === userB.id, 'Auto-provisioned providers.user_id exactly equals auth.users.id');
  assert(Boolean(afterProv[0].slug), `Auto-provisioned provider slug: ${afterProv[0].slug}`);

  // Verify User B status endpoint works
  const statusResB = await fetch('http://localhost:3001/api/auth/google/status', {
    headers: {
      Authorization: `Bearer ${tokenB}`,
    },
  });
  assert(statusResB.status === 200, `User B status returns 200 OK (received ${statusResB.status})`);

  console.log('\n================================================================');
  console.log('✓ ALL ASSERTIONS PASSED: AUTHENTICATED USER PROVIDER LINKING');
  console.log('  AND GOOGLE CALENDAR OAUTH INITIATION VERIFIED COMPLETELY!');
  console.log('================================================================\n');
}

runTest().catch(err => {
  console.error('Fatal test failure:', err);
  process.exit(1);
});
