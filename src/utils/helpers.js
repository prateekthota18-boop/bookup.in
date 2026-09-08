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
 * Convert "HH:mm" time string to minutes from midnight
 */
export function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
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
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Rebuilt Dynamic Slot Generation Engine
 * 
 * Generates candidate start times stepping by fixed granularity (15 mins)
 * Validates each candidate [T, T + D + B) against:
 *  - Confirmed and Completed bookings (accounting for actualEndTime and buffer)
 *  - External calendar busy times (e.g. Google Calendar)
 *  - Minimum notice window (for today)
 *  - Provider closing time (session must finish by day end)
 * 
 * @param {string} start "HH:mm" Day opening time
 * @param {string} end "HH:mm" Day closing time
 * @param {number} duration Service duration in minutes (D)
 * @param {number} buffer Buffer time in minutes (B)
 * @param {Array} existingBookings Bookings on this date
 * @param {Array} blockedTimes External or provider busy intervals [{ start: 'HH:mm', end: 'HH:mm' }]
 * @param {number} minNotice Minimum notice in hours
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {number} granularity Stepping granularity in minutes (default 15)
 * @returns {Array<string>} Array of available start times ["09:00", "09:15", ...]
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
  granularity = 15
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
      start: bStart,
      end: bEnd + bufferNum,
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
      label: blk.title || 'Busy',
    });
  }

  // 3. Step through candidate start times with fixed granularity (15 mins)
  for (let T = startMin; T + durationNum <= endMin; T += granularity) {
    // Check minimum notice requirement
    if (minNoticeCutoff !== -1 && T < minNoticeCutoff) {
      continue;
    }

    // Candidate reservation interval [T, T + D + B)
    const candStart = T;
    const candEnd = T + durationNum + bufferNum;

    // Check collision with any blocked interval
    // Two intervals [A1, A2) and [B1, B2) overlap iff max(A1, B1) < min(A2, B2)
    let hasConflict = false;
    for (const interval of blockedIntervals) {
      if (Math.max(candStart, interval.start) < Math.min(candEnd, interval.end)) {
        hasConflict = true;
        break;
      }
    }

    if (!hasConflict) {
      slots.push(minutesToTime(T));
    }
  }

  return slots;
}

export function isDateAvailable(dateStr, availability) {
  if (!availability) return false;
  const day = getDayOfWeek(dateStr);
  return availability.schedule?.[day]?.available || false;
}

/**
 * Live slot generator for public booking & calendar views
 */
export function getAvailableTimeSlotsForDate(
  dateStr,
  availability,
  services,
  serviceId,
  allBookings = [],
  calendarBusyTimes = []
) {
  if (!availability || !isDateAvailable(dateStr, availability)) return [];

  const day = getDayOfWeek(dateStr);
  const daySchedule = availability.schedule[day];
  if (!daySchedule?.available) return [];

  const service = services.find(s => s.id === serviceId);
  if (!service) return [];

  // Filter bookings for this date (confirmed or completed)
  const dayBookings = allBookings.filter(b => b.date === dateStr);

  return generateTimeSlots(
    daySchedule.start,
    daySchedule.end,
    service.duration,
    availability.bufferTime ?? 0,
    dayBookings,
    calendarBusyTimes,
    availability.minNotice ?? 0,
    dateStr,
    15 // 15-minute stepping granularity
  );
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
