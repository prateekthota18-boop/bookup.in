/**
 * BookUp — Utility Helpers & Core Slot Engine
 */

export const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
export const DAY_LABELS = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
export const DAY_FULL_LABELS = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };

export function getDayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[d.getDay()];
}

/**
 * Convert "HH:mm" or "hh:mm AM/PM" time string to minutes from midnight
 */
export function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  if (typeof timeStr !== 'string') return Number(timeStr) || 0;

  const clean = timeStr.trim();
  const isPm = /pm/i.test(clean);
  const isAm = /am/i.test(clean);

  const match = clean.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;

  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);

  if (isPm) {
    if (h < 12) h += 12;
  } else if (isAm) {
    if (h === 12) h = 0;
  }
  return h * 60 + m;
}

/**
 * Convert minutes from midnight to "HH:mm" string
 */
export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Format "HH:mm" to 12-hour AM/PM string
 */
export function formatTimeAmPm(timeStr) {
  if (!timeStr) return '';
  if (typeof timeStr === 'string' && (timeStr.includes('AM') || timeStr.includes('PM'))) {
    return timeStr;
  }
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m || 0).padStart(2, '0')} ${ampm}`;
}

/**
 * Central Dynamic Slot Generation Engine
 *
 * Generates candidate start times stepping by fixed granularity (15 mins)
 * Validates each candidate [candStart, candEnd) against:
 *  - Confirmed and Completed bookings (accounting for actualEndTime and buffer)
 *  - External calendar busy times (e.g. Google Calendar)
 *  - Minimum notice window (for today)
 *  - Provider closing time (session must finish by day end)
 *
 * Interval overlap rule:
 * candidateStart < existingEnd AND candidateEnd > existingStart
 *
 * @returns {Array<{time: string, available: boolean, reason?: 'booked'|'unavailable'}>}
 */
export function generateTimeSlotsDetailed(
  start,
  end,
  duration,
  buffer = 0,
  existingBookings = [],
  blockedTimes = [],
  minNotice = 0,
  dateStr = null,
  granularity = 15,
  excludeBookingId = null
) {
  const slots = [];
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  const durationNum = Number(duration) || 60;
  const bufferNum = Math.max(0, Number(buffer) || 0);

  // 1. Determine minimum notice cutoff for today
  let minNoticeCutoff = -1;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  if (dateStr && dateStr === todayStr) {
    const currentMin = now.getHours() * 60 + now.getMinutes();
    const noticeMin = (Number(minNotice) || 0) * 60;
    minNoticeCutoff = currentMin + noticeMin;
  }

  // 2. Build array of all blocked intervals for this day
  const blockedIntervals = [];

  // Existing bookings
  for (const b of existingBookings) {
    // Exclude current appointment when rescheduling
    if (excludeBookingId && b.id === excludeBookingId) {
      continue;
    }
    // Cancelled and no-show bookings do not block calendar time
    if (b.status === 'cancelled' || b.status === 'late-cancellation' || b.status === 'no-show') {
      continue;
    }

    const bStart = timeToMinutes(b.startTime);
    let bEnd;

    if (b.status === 'completed' && b.actualEndTime) {
      // Early completion auto-release: use actual end time + buffer
      bEnd = timeToMinutes(b.actualEndTime);
    } else if (b.endTime) {
      bEnd = timeToMinutes(b.endTime);
    } else {
      bEnd = bStart + (Number(b.duration) || durationNum);
    }

    // Interval blocked by this existing booking (including buffer)
    blockedIntervals.push({
      id: b.id,
      start: bStart,
      end: bEnd + bufferNum,
      exactStart: bStart,
      label: b.serviceName || 'Booking',
    });
  }

  // External calendar busy times (e.g. Google Calendar events)
  for (const blk of blockedTimes) {
    const blkStart = timeToMinutes(blk.start);
    const blkEnd = timeToMinutes(blk.end);
    blockedIntervals.push({
      start: blkStart,
      end: blkEnd,
      exactStart: blkStart,
      label: blk.title || 'Busy',
    });
  }

  // 3. Step through candidate start times with fixed granularity (15 mins)
  for (let T = startMin; T < endMin; T += granularity) {
    const timeStr = minutesToTime(T);

    // If appointment duration exceeds closing time
    if (T + durationNum > endMin) {
      slots.push({ time: timeStr, available: false, reason: 'unavailable' });
      continue;
    }

    // Check minimum notice requirement
    if (minNoticeCutoff !== -1 && T < minNoticeCutoff) {
      slots.push({ time: timeStr, available: false, reason: 'unavailable' });
      continue;
    }

    // Candidate reservation interval [T, T + D + B)
    const candStart = T;
    const candEnd = T + durationNum + bufferNum;

    // Check collision with any blocked interval:
    // candidateStart < existingEnd AND candidateEnd > existingStart -> CONFLICT
    let isBlocked = false;
    let blockReason = 'unavailable';

    for (const interval of blockedIntervals) {
      if (candStart < interval.end && candEnd > interval.start) {
        isBlocked = true;
        if (interval.exactStart !== undefined && interval.exactStart === candStart) {
          blockReason = 'booked';
        } else {
          blockReason = 'unavailable';
        }
        break;
      }
    }

    if (isBlocked) {
      slots.push({ time: timeStr, available: false, reason: blockReason });
    } else {
      slots.push({ time: timeStr, available: true });
    }
  }

  return slots;
}

/**
 * Returns available start time strings ["09:00", "09:15", ...]
 */
export function generateTimeSlots(
  start,
  end,
  duration,
  buffer = 0,
  existingBookings = [],
  blockedTimes = [],
  minNotice = 0,
  dateStr = null,
  granularity = 15,
  excludeBookingId = null
) {
  const detailed = generateTimeSlotsDetailed(
    start,
    end,
    duration,
    buffer,
    existingBookings,
    blockedTimes,
    minNotice,
    dateStr,
    granularity,
    excludeBookingId
  );
  return detailed.filter(s => s.available).map(s => s.time);
}

export function isDateAvailable(dateStr, availability) {
  if (!availability) return false;
  const day = getDayOfWeek(dateStr);
  return availability.schedule?.[day]?.available || false;
}

/**
 * Live slot generator returning full status for public booking & dashboard views
 */
export function getTimeSlotsDetailedForDate(
  dateStr,
  availability,
  services,
  serviceId,
  allBookings = [],
  calendarBusyTimes = [],
  excludeBookingId = null
) {
  if (!availability || !isDateAvailable(dateStr, availability)) return [];

  const day = getDayOfWeek(dateStr);
  const daySchedule = availability.schedule?.[day];
  if (!daySchedule?.available) return [];

  const service = services.find(s => s.id === serviceId);
  if (!service) return [];

  // Filter bookings for this date
  const dayBookings = allBookings.filter(b => b.date === dateStr);

  return generateTimeSlotsDetailed(
    daySchedule.start,
    daySchedule.end,
    service.duration,
    availability.bufferTime ?? 0,
    dayBookings,
    calendarBusyTimes,
    availability.minNotice ?? 0,
    dateStr,
    15,
    excludeBookingId
  );
}

/**
 * Live available slot generator returning available time strings
 */
export function getAvailableTimeSlotsForDate(
  dateStr,
  availability,
  services,
  serviceId,
  allBookings = [],
  calendarBusyTimes = [],
  excludeBookingId = null
) {
  const detailed = getTimeSlotsDetailedForDate(
    dateStr,
    availability,
    services,
    serviceId,
    allBookings,
    calendarBusyTimes,
    excludeBookingId
  );
  return detailed.filter(s => s.available).map(s => s.time);
}

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Robust slug generator stripping leading/trailing dashes and cleaning special characters
 */
export function generateSlug(name) {
  if (!name) return 'book';
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'book';
}

export function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay(); // 0 = Sunday

  const days = [];

  // Previous month padding
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    days.push({ day: prevMonthLastDay - i, isCurrentMonth: false, date: null });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ day: d, isCurrentMonth: true, date: dateStr });
  }

  // Next month padding
  const remaining = 42 - days.length; // 6 rows × 7 days
  for (let d = 1; d <= remaining; d++) {
    days.push({ day: d, isCurrentMonth: false, date: null });
  }

  return days;
}

export function isToday(dateStr) {
  return dateStr === new Date().toISOString().split('T')[0];
}

export function isPastDate(dateStr) {
  const today = new Date().toISOString().split('T')[0];
  return dateStr < today;
}

export function isFutureDate(dateStr, maxDays = 365) {
  const today = new Date();
  const maxDate = new Date(today.getTime() + maxDays * 86400000);
  return dateStr <= maxDate.toISOString().split('T')[0];
}
