import { Router } from 'express';
import { googleCalendarService } from '../services/googleCalendar.js';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

const router = Router();

const serverSupabase = (config.supabaseUrl && config.supabaseKey)
  ? createClient(config.supabaseUrl, config.supabaseKey)
  : null;

// In-process deduplication cache fallback (bookingId -> eventId)
const eventDeduplicationCache = new Map();

/**
 * GET /api/calendar/busy
 * Fetch busy time intervals for a provider on a specific date (YYYY-MM-DD)
 * Public endpoint used by /book/:slug and dashboard availability.
 * Returns only { connected, busyTimes: [{ start, end }] } with zero private event information.
 */
router.get('/busy', async (req, res) => {
  const { providerId, date, timeZone = 'Asia/Kolkata' } = req.query;

  if (!providerId) {
    return res.status(400).json({ success: false, error: 'providerId parameter is required' });
  }

  if (!date) {
    return res.status(400).json({ success: false, error: 'date parameter is required (YYYY-MM-DD)' });
  }

  try {
    const result = await googleCalendarService.getBusyIntervals(providerId, date, timeZone);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error fetching calendar busy intervals:', err.message);
    res.status(500).json({ success: false, error: err.message, busyTimes: [] });
  }
});

/**
 * POST /api/calendar/events
 * Create an event on the provider's Google Calendar for a confirmed booking.
 * Idempotent with persistent database deduplication.
 */
router.post('/events', async (req, res) => {
  const { providerId, booking, timeZone = 'Asia/Kolkata' } = req.body;

  if (!providerId) {
    return res.status(400).json({ success: false, error: 'providerId is required' });
  }

  if (!booking || !booking.id || !booking.date || !booking.startTime || !booking.endTime) {
    return res.status(400).json({ success: false, error: 'Complete booking object with id, date, startTime, and endTime is required' });
  }

  // 1. Check if booking payload already has event ID (client-side deduplication)
  if (booking.googleEventId || booking.google_event_id) {
    return res.json({
      success: true,
      eventId: booking.googleEventId || booking.google_event_id,
      duplicatePrevented: true,
    });
  }

  // 2. Check in-process deduplication cache
  if (eventDeduplicationCache.has(booking.id)) {
    return res.json({
      success: true,
      eventId: eventDeduplicationCache.get(booking.id),
      duplicatePrevented: true,
    });
  }

  // 3. Check Supabase database for existing event ID & provider ownership
  if (serverSupabase && booking.id && !booking.id.startsWith('booking-')) {
    try {
      const { data: existingBooking } = await serverSupabase
        .from('bookings')
        .select('id, provider_id, google_event_id')
        .eq('id', booking.id)
        .maybeSingle();

      if (existingBooking) {
        // Multi-tenant check: providerId must match booking's provider_id
        if (existingBooking.provider_id && existingBooking.provider_id !== providerId) {
          return res.status(403).json({ success: false, error: 'Provider ID mismatch for this booking' });
        }

        if (existingBooking.google_event_id) {
          eventDeduplicationCache.set(booking.id, existingBooking.google_event_id);
          return res.json({
            success: true,
            eventId: existingBooking.google_event_id,
            duplicatePrevented: true,
          });
        }
      }
    } catch (dbErr) {
      console.warn('DB check before event creation failed (non-fatal):', dbErr.message);
    }
  }

  // 4. Create event on Google Calendar
  try {
    const result = await googleCalendarService.createEvent(providerId, booking, timeZone);

    if (result.success && result.eventId) {
      eventDeduplicationCache.set(booking.id, result.eventId);

      // Persist google_event_id to database if real booking
      if (serverSupabase && booking.id && !booking.id.startsWith('booking-')) {
        serverSupabase
          .from('bookings')
          .update({ google_event_id: result.eventId })
          .eq('id', booking.id)
          .then(({ error }) => {
            if (error) console.warn('Could not persist google_event_id to Supabase (column may be pending):', error.message);
          })
          .catch(e => console.warn('Supabase update error (non-fatal):', e.message));
      }
    }

    res.json(result);
  } catch (err) {
    console.error('Error creating Google Calendar event:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/calendar/events/:eventId
 * Update event on Google Calendar (e.g. Reschedule)
 */
router.patch('/events/:eventId', async (req, res) => {
  const { eventId } = req.params;
  const { providerId = 'provider-1', booking, timeZone = 'Asia/Kolkata' } = req.body;

  if (!eventId || !booking) {
    return res.status(400).json({ success: false, error: 'eventId and booking details required' });
  }

  try {
    const result = await googleCalendarService.updateEvent(providerId, eventId, booking, timeZone);
    res.json(result);
  } catch (err) {
    console.error('Error updating Google Calendar event:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/calendar/events/:eventId
 * Delete event from Google Calendar (e.g. Cancellation)
 */
router.delete('/events/:eventId', async (req, res) => {
  const { eventId } = req.params;
  const { providerId = 'provider-1' } = req.query;

  if (!eventId) {
    return res.status(400).json({ success: false, error: 'eventId parameter is required' });
  }

  try {
    const result = await googleCalendarService.deleteEvent(providerId, eventId);
    res.json(result);
  } catch (err) {
    console.error('Error deleting Google Calendar event:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
