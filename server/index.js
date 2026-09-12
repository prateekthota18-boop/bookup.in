/**
 * BookUp Backend Server Entry Point
 * Runs on port 3001 and handles Google Calendar OAuth 2.0 and API synchronization.
 */

import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import calendarRoutes from './routes/calendar.js';
import publicBookingsRoutes from './routes/publicBookings.js';

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
app.use('/api/public/bookings/manage', publicBookingsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'BookUp Backend',
    googleConfigured: config.isGoogleConfigured(),
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`\n==================================================`);
  console.log(`🚀 BookUp Backend running on port ${config.port} (0.0.0.0)`);
  console.log(`📅 Google OAuth Configured: ${config.isGoogleConfigured() ? 'YES ✓' : 'NO (Add credentials to .env)'}`);
  console.log(`🔗 Redirect URI: ${config.googleRedirectUri}`);
  console.log(`==================================================\n`);
});

export default app;
export { app, server };

