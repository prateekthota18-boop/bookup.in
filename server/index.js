/**
 * BookUp Backend Server Entry Point
 * Runs on port 3001 and handles Google Calendar OAuth 2.0 and API synchronization.
 */

import dns from 'dns';
import express from 'express';
import cors from 'cors';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_e) {}
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import calendarRoutes from './routes/calendar.js';
import publicBookingsRoutes from './routes/publicBookings.js';
import internalNotificationsRoutes from './routes/internalNotifications.js';
import paymentVerificationRoutes from './routes/paymentVerification.js';

const app = express();

// CORS configuration: safely allow configured frontend origins without wildcard
const allowedOrigins = (config.frontendUrl || 'http://localhost:5173')
  .split(',')
  .map(url => url.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. server-to-server, curl, health probes)
    if (!origin) return callback(null, true);

    const normalizedOrigin = origin.replace(/\/$/, '');
    if (
      allowedOrigins.includes(normalizedOrigin) ||
      (process.env.NODE_ENV !== 'production' && normalizedOrigin.startsWith('http://localhost:'))
    ) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
}));
app.use(express.json());

// Minimal root health check endpoint (for Railway / load balancers)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth/google', authRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/public', publicBookingsRoutes);
app.use('/api/public/bookings', publicBookingsRoutes);
app.use('/api/public/bookings/manage', publicBookingsRoutes);
app.use('/api/internal/notifications', internalNotificationsRoutes);
app.use('/api/public/bookings/manage', paymentVerificationRoutes);  // customer: mark-paid (token-authed)
app.use('/api/bookings', paymentVerificationRoutes);                // provider: confirm/reject (JWT-authed)

// Health check endpoint
app.get('/api/health', async (req, res) => {
  let supabaseStatus = 'unconfigured';
  let supabaseError = null;
  let serviceCheck = null;

  const key = config.supabaseServiceRoleKey || config.supabaseKey;
  if (config.supabaseUrl && key) {
    try {
      const client = createClient(config.supabaseUrl, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.from('services').select('id, name, active').limit(3);
      if (error) {
        supabaseStatus = 'error';
        supabaseError = { message: error.message, code: error.code, details: error.details, hint: error.hint };
      } else {
        supabaseStatus = 'connected';
        serviceCheck = { count: data?.length, sample: data?.map(s => s.id) };
      }
    } catch (e) {
      supabaseStatus = 'exception';
      supabaseError = e.message;
    }
  }

  res.json({
    status: 'ok',
    version: 'phase4b-diagnostic-v2',
    service: 'CalUp Backend',
    uptimeSeconds: Math.floor(process.uptime()),
    googleConfigured: config.isGoogleConfigured(),
    emailConfigured: config.isEmailConfigured(),
    resendEnvKeys: Object.keys(process.env).filter(k => /resend/i.test(k)),
    richAutomateConfigured: config.isRichAutomateConfigured(),
    supabase: {
      status: supabaseStatus,
      host: config.supabaseUrl ? new URL(config.supabaseUrl).host : null,
      keyType: config.supabaseServiceRoleKey ? 'service_role' : (config.supabaseKey ? 'anon/publishable' : 'none'),
      keyPrefix: key ? key.substring(0, 10) + '...' : null,
      error: supabaseError,
      services: serviceCheck,
    },
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`\n==================================================`);
  console.log(`🚀 CalUp Backend running on port ${config.port} (0.0.0.0)`);
  console.log(`📅 Google OAuth Configured: ${config.isGoogleConfigured() ? 'YES ✓' : 'NO (Add credentials to .env)'}`);
  console.log(`🔗 Redirect URI: ${config.googleRedirectUri}`);
  console.log(`==================================================\n`);
});

export default app;
export { app, server };

