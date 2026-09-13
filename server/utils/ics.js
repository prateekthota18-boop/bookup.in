/**
 * BookUp — RFC 5545 iCalendar (.ics) Generator
 * Generates standard VCALENDAR / VEVENT blocks for customer appointment confirmations.
 * No external dependencies required.
 */

import crypto from 'crypto';

/**
 * Escapes text according to RFC 5545 Section 3.3.11
 */
function escapeIcsText(str = '') {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

/**
 * Formats a Date object to UTC iCalendar format: YYYYMMDDTHHmmssZ
 */
function formatUtcIcs(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * Determines timezone offset string (e.g. +05:30) for a given timezone
 */
function getTimezoneOffsetString(dateStr, timeZone = 'Asia/Kolkata') {
  try {
    const d = new Date(`${dateStr}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(d);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    if (tzPart?.value) {
      const match = tzPart.value.match(/GMT([+-]\d{2}:\d{2})/);
      if (match) return match[1];
      if (tzPart.value === 'GMT') return '+00:00';
    }
  } catch (_e) {}
  return '+05:30';
}

/**
 * Folds lines to max 75 octets according to RFC 5545 Section 3.1
 */
function foldLine(line) {
  if (line.length <= 75) return line;
  const chunks = [];
  chunks.push(line.slice(0, 75));
  let remaining = line.slice(75);
  while (remaining.length > 74) {
    chunks.push(' ' + remaining.slice(0, 74));
    remaining = remaining.slice(74);
  }
  if (remaining.length > 0) {
    chunks.push(' ' + remaining);
  }
  return chunks.join('\r\n');
}

/**
 * Generates an RFC 5545 .ics calendar invite string
 *
 * @param {Object} params
 * @param {string} params.serviceName - Name of the service
 * @param {string} params.providerName - Coach / Provider name
 * @param {string} params.bookingDate - YYYY-MM-DD
 * @param {string} params.startTime - HH:mm
 * @param {number} params.duration - Duration in minutes
 * @param {string} [params.meetLink] - Google Meet video call URL
 * @param {string} [params.managementUrl] - Customer manage appointment link
 * @param {string} [params.bookingId] - Booking reference UUID or ID
 * @param {string} [params.timeZone] - Timezone identifier (default: Asia/Kolkata)
 * @returns {string} Standard .ics file content with CRLF line endings
 */
export function generateIcsCalendar({
  serviceName,
  providerName,
  bookingDate,
  startTime,
  duration = 60,
  meetLink = '',
  managementUrl = '',
  bookingId = '',
  timeZone = 'Asia/Kolkata',
}) {
  const cleanStartTime = startTime.length === 5 ? startTime : startTime.slice(0, 5);
  const offset = getTimezoneOffsetString(bookingDate, timeZone);
  const startIso = `${bookingDate}T${cleanStartTime}:00${offset}`;
  const startDate = new Date(startIso);

  const durationMinutes = Number(duration) || 60;
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  const now = new Date();
  const dtStamp = formatUtcIcs(now);
  const dtStart = formatUtcIcs(startDate);
  const dtEnd = formatUtcIcs(endDate);

  const uid = bookingId ? `${bookingId}@bookup.in` : `${crypto.randomUUID()}@bookup.in`;
  const summary = `${serviceName} with ${providerName}`;

  const descriptionLines = [
    `Appointment: ${serviceName}`,
    `Coach / Provider: ${providerName}`,
    `Duration: ${durationMinutes} minutes`,
    meetLink ? `Google Meet Link: ${meetLink}` : 'Video Link: Will be provided before session',
    managementUrl ? `Manage Appointment: ${managementUrl}` : '',
  ].filter(Boolean).join('\n');

  const location = meetLink || 'Google Meet';

  const rawLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BookUp//Appointment Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(descriptionLines)}`,
    `LOCATION:${escapeIcsText(location)}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return rawLines.map(foldLine).join('\r\n') + '\r\n';
}
