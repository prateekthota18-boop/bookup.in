/**
 * BookUp — Mock Google Calendar Provider
 * Simulates Google OAuth connect, 2-way sync, and external calendar busy intervals.
 */

import { CalendarProvider } from './CalendarProvider';

// Weekly recurring mock busy events to demo external conflicts
export const MOCK_GCAL_BUSY_EVENTS = [
  { dayOfWeek: 3, title: 'Team Meeting & Sync', start: '14:00', end: '15:00' }, // Wednesday 2-3 PM
  { dayOfWeek: 4, title: 'Client Strategy Review', start: '16:00', end: '17:00' }, // Thursday 4-5 PM
  { dayOfWeek: 5, title: 'Personal Appointment / Dentist', start: '11:30', end: '12:30' }, // Friday 11:30-12:30
];

export class MockGoogleCalendarProvider extends CalendarProvider {
  constructor(accountEmail = 'priya.sharma@gmail.com') {
    super();
    this.accountEmail = accountEmail;
  }

  async connect(email) {
    // Simulate brief network delay
    await new Promise(res => setTimeout(res, 350));
    return {
      success: true,
      email: email || this.accountEmail,
      provider: 'google',
      connectedAt: new Date().toISOString(),
    };
  }

  async disconnect() {
    await new Promise(res => setTimeout(res, 200));
    return true;
  }

  isConnected(calendarState) {
    return Boolean(calendarState?.isConnected);
  }

  /**
   * Return busy times for a specific date (YYYY-MM-DD)
   */
  async getBusyTimes(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay(); // 0 = Sunday, 1 = Monday, etc.

    const matching = MOCK_GCAL_BUSY_EVENTS.filter(e => e.dayOfWeek === day);
    return matching.map(e => ({
      title: e.title,
      start: e.start,
      end: e.end,
      source: 'Google Calendar',
    }));
  }

  async createEvent(booking) {
    return {
      success: true,
      eventId: `gcal_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      htmlLink: `https://calendar.google.com/calendar/event?eid=mock_${booking.id}`,
    };
  }
}

export const googleCalendarService = new MockGoogleCalendarProvider();
