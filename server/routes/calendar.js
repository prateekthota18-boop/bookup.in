/**
 * BookUp Google Calendar Sync Routes
 * /api/calendar/*
 */

import { Router } from 'express';
import { googleCalendarService } from '../services/googleCalendar.js';

const router = Router();

/**
 * GET /api/calendar/busy
 * Fetch busy time intervals for a provider on a specific date (YYYY-MM-DD)
 * Used by public booking flow and dashboard rescheduling engine.
 */
router.get('/busy', async (req, res) => {
  const { providerId = 'provider-1', date, timeZone = 'Asia/Kolkata' } = req.query;

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
 * Create an event on the provider's Google Calendar for a confirmed booking
 */
router.post('/events', async (req, res) => {
  const { providerId = 'provider-1', booking, timeZone = 'Asia/Kolkata' } = req.body;

  if (!booking || !booking.date || !booking.startTime || !booking.endTime) {
    return res.status(400).json({ success: false, error: 'Complete booking object is required' });
  }

  try {
    const result = await googleCalendarService.createEvent(providerId, booking, timeZone);
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
