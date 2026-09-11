/**
 * BookUp Backend Server Entry Point
 * Runs on port 3001 and handles Google Calendar OAuth 2.0 and API synchronization.
 */

import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import calendarRoutes from './routes/calendar.js';

const app = express();

// Middlewares
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));
app.use(express.json());

// API Routes
app.use('/api/auth/google', authRoutes);
app.use('/api/calendar', calendarRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'BookUp Backend',
    googleConfigured: config.isGoogleConfigured(),
    timestamp: new Date().toISOString(),
  });
});

// Start Server
app.listen(config.port, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 BookUp Backend running on http://localhost:${config.port}`);
  console.log(`📅 Google OAuth Configured: ${config.isGoogleConfigured() ? 'YES ✓' : 'NO (Add credentials to .env)'}`);
  console.log(`🔗 Redirect URI: ${config.googleRedirectUri}`);
  console.log(`==================================================\n`);
});
