/**
 * BookUp — Availability Page
 * Weekly schedule, dynamic buffers, and external calendar busy times
 */

import { Link } from 'react-router-dom';
import { useStore, ACTIONS } from '../../data/store';
import { DAYS_OF_WEEK, DAY_FULL_LABELS, formatTimeAmPm } from '../../utils/helpers';
import { MOCK_GCAL_BUSY_EVENTS } from '../../services/calendar/MockGoogleCalendarProvider';

const DAY_INDEX_NAMES = {
  1: 'Mondays',
  2: 'Tuesdays',
  3: 'Wednesdays',
  4: 'Thursdays',
  5: 'Fridays',
  6: 'Saturdays',
  0: 'Sundays',
};

export default function Availability() {
  const { state, dispatch, addToast } = useStore();
  const availability = state.availability || {
    schedule: DAYS_OF_WEEK.reduce((acc, day) => ({ ...acc, [day]: { available: day !== 'sunday', start: '09:00', end: '18:00' } }), {}),
    bufferTime: 15,
    minNotice: 2,
    maxAdvanceBooking: 30,
  };
  const gcal = state.googleCalendar || { isConnected: false, email: null };

  const updateDay = (day, field, value) => {
    const newSchedule = {
      ...availability.schedule,
      [day]: { ...availability.schedule[day], [field]: value },
    };
    dispatch({ type: ACTIONS.UPDATE_AVAILABILITY, payload: { schedule: newSchedule } });
  };

  const updateSetting = (field, value) => {
    dispatch({ type: ACTIONS.UPDATE_AVAILABILITY, payload: { [field]: value } });
  };

  const handleSave = () => {
    addToast('Availability updated ✓ Dynamic slot engine updated.');
  };

  return (
    <div className="animate-fade-in-up">
      <div className="section-header">
        <div>
          <h1 className="page-title">Availability</h1>
          <p className="page-subtitle">Set when clients can book appointments with you.</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
      </div>

      {/* Weekly Schedule */}
      <div className="card card-padding" style={{ marginBottom: 'var(--space-6)' }}>
        <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-5)' }}>Weekly Schedule</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {DAYS_OF_WEEK.map(day => (
            <div
              key={day}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-3) 0',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 160 }}>
                <input
                  type="checkbox"
                  className="form-checkbox"
                  checked={availability.schedule[day]?.available || false}
                  onChange={e => updateDay(day, 'available', e.target.checked)}
                />
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{DAY_FULL_LABELS[day]}</span>
              </label>
              {availability.schedule[day]?.available ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>
                  <input
                    type="time"
                    className="form-input"
                    style={{ width: 130, padding: '4px 8px', fontSize: 'var(--font-size-sm)' }}
                    value={availability.schedule[day]?.start || '09:00'}
                    onChange={e => updateDay(day, 'start', e.target.value)}
                  />
                  <span style={{ color: 'var(--color-text-tertiary)' }}>to</span>
                  <input
                    type="time"
                    className="form-input"
                    style={{ width: 130, padding: '4px 8px', fontSize: 'var(--font-size-sm)' }}
                    value={availability.schedule[day]?.end || '18:00'}
                    onChange={e => updateDay(day, 'end', e.target.value)}
                  />
                </div>
              ) : (
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                  Unavailable
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Scheduling Settings */}
      <div className="card card-padding" style={{ marginBottom: 'var(--space-6)' }}>
        <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-5)' }}>Scheduling Settings</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-6)' }}>
          <div className="form-group">
            <label className="form-label">Buffer time</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <input
                type="number"
                className="form-input"
                style={{ width: 100 }}
                min="0"
                step="5"
                value={availability.bufferTime ?? 0}
                onChange={e => updateSetting('bufferTime', Number(e.target.value))}
              />
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>minutes</span>
            </div>
            <span className="form-hint">Applied immediately to all future slot generation</span>
          </div>
          <div className="form-group">
            <label className="form-label">Minimum notice</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <input
                type="number"
                className="form-input"
                style={{ width: 100 }}
                min="0"
                value={availability.minNotice ?? 0}
                onChange={e => updateSetting('minNotice', Number(e.target.value))}
              />
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>hours</span>
            </div>
            <span className="form-hint">Prevents clients from booking too close to now</span>
          </div>
          <div className="form-group">
            <label className="form-label">Max advance booking</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <input
                type="number"
                className="form-input"
                style={{ width: 100 }}
                min="1"
                value={availability.maxAdvanceBooking || 30}
                onChange={e => updateSetting('maxAdvanceBooking', Number(e.target.value))}
              />
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>days</span>
            </div>
            <span className="form-hint">How far ahead clients can book</span>
          </div>
        </div>
      </div>

      {/* Busy Times from Google Calendar */}
      <div className="card card-padding">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: '1.25rem' }}>📅</span>
            <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, margin: 0 }}>Google Calendar Busy Times</h4>
          </div>
          {gcal.isConnected && (
            <span className="badge badge-active">Active in Slot Engine</span>
          )}
        </div>

        {gcal.isConnected ? (
          <div>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
              The following events from <strong>{gcal.email}</strong> automatically block candidate slots on your booking page:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {MOCK_GCAL_BUSY_EVENTS.map((event, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'var(--color-gray-50)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{event.title}</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                      Every {DAY_INDEX_NAMES[event.dayOfWeek]} · {formatTimeAmPm(event.start)} – {formatTimeAmPm(event.end)}
                    </div>
                  </div>
                  <span className="badge badge-inactive" style={{ fontSize: 'var(--font-size-xs)' }}>
                    🚫 Slot Blocked
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
            <div>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
                Google Calendar is currently disconnected. Connect in Settings to auto-block personal meetings and commitments.
              </p>
            </div>
            <Link to="/dashboard/settings" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
              Connect in Settings →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
