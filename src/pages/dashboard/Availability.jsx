/**
 * BookUp — Availability Page
 * Weekly schedule, dynamic buffers, and external calendar busy times
 */

import { Link } from 'react-router-dom';
import { useStore } from '../../data/store';
import { ACTIONS } from '../../data/actions';
import { DAYS_OF_WEEK, DAY_FULL_LABELS, formatTimeAmPm } from '../../utils/helpers';
import { MOCK_GCAL_BUSY_EVENTS } from '../../services/calendar/MockGoogleCalendarProvider';
import { isSupabaseConfigured } from '../../services/supabase/supabaseClient';
import { dbService } from '../../services/supabase/dbService';
import PillButton from '../../components/ui/PillButton';

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

  const handleSave = async () => {
    if (!state.auth?.isDemoMode && isSupabaseConfigured() && state.provider?.id) {
      try {
        await dbService.saveAvailability(state.provider.id, availability.schedule, {
          bufferTime: availability.bufferTime,
          minNotice: availability.minNotice,
          maxAdvanceBooking: availability.maxAdvanceBooking,
        });
      } catch (err) {
        console.error('Failed to save availability in Supabase:', err);
      }
    }
    addToast('Availability updated ✓ Dynamic slot engine updated.');
  };

  return (
    <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Action Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
            Weekly Hours & Rules
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)', margin: '3px 0 0' }}>
            Set when clients can book appointments with you.
          </p>
        </div>
        <PillButton variant="primary" size="md" onClick={handleSave}>
          Save Changes
        </PillButton>
      </div>

      {/* Weekly Schedule Card */}
      <div
        className="card"
        style={{
          borderRadius: 'var(--radius-card)',
          background: 'var(--theme-bg-card)',
          border: '1px solid var(--theme-border)',
          boxShadow: 'var(--shadow-card)',
          padding: '24px 28px',
        }}
      >
        <div style={{ marginBottom: '18px' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: 'var(--color-text)' }}>
            Working Days & Hours
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)', margin: 0 }}>
            Toggle active days and define your working window for client booking.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {DAYS_OF_WEEK.map(day => {
            const isAvailable = availability.schedule[day]?.available || false;
            return (
              <div
                key={day}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  borderRadius: 'var(--radius-lg)',
                  background: isAvailable ? 'var(--theme-bg-card-subtle)' : 'transparent',
                  border: '1px solid var(--theme-border)',
                  transition: 'all var(--transition-fast)',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', minWidth: '150px' }}>
                  <input
                    type="checkbox"
                    checked={isAvailable}
                    onChange={e => updateDay(day, 'available', e.target.checked)}
                    style={{
                      width: '18px',
                      height: '18px',
                      accentColor: '#0E0E0E',
                      cursor: 'pointer',
                    }}
                  />
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: '14px', fontWeight: isAvailable ? 700 : 500, color: 'var(--color-text)' }}>
                    {DAY_FULL_LABELS[day]}
                  </span>
                </label>

                {isAvailable ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="time"
                      value={availability.schedule[day]?.start || '09:00'}
                      onChange={e => updateDay(day, 'start', e.target.value)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--theme-border)',
                        background: 'var(--theme-bg-card)',
                        fontFamily: 'var(--font-family-mono)',
                        fontSize: '13px',
                        color: 'var(--color-text)',
                      }}
                    />
                    <span style={{ color: 'var(--theme-text-muted)', fontSize: '13px' }}>to</span>
                    <input
                      type="time"
                      value={availability.schedule[day]?.end || '18:00'}
                      onChange={e => updateDay(day, 'end', e.target.value)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--theme-border)',
                        background: 'var(--theme-bg-card)',
                        fontFamily: 'var(--font-family-mono)',
                        fontSize: '13px',
                        color: 'var(--color-text)',
                      }}
                    />
                  </div>
                ) : (
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--theme-input-bg)',
                    color: 'var(--theme-text-muted)',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}>
                    Unavailable
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scheduling Rules Card */}
      <div
        className="card"
        style={{
          borderRadius: 'var(--radius-card)',
          background: 'var(--theme-bg-card)',
          border: '1px solid var(--theme-border)',
          boxShadow: 'var(--shadow-card)',
          padding: '24px 28px',
        }}
      >
        <div style={{ marginBottom: '18px' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: 'var(--color-text)' }}>
            Buffer & Advance Booking Rules
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)', margin: 0 }}>
            Fine-tune the dynamic slot calculation engine.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
              Buffer between bookings
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                min="0"
                step="5"
                value={availability.bufferTime ?? 0}
                onChange={e => updateSetting('bufferTime', Number(e.target.value))}
                style={{
                  width: '100px',
                  padding: '8px 12px',
                  borderRadius: '12px',
                  border: '1px solid var(--theme-border)',
                  background: 'var(--theme-bg-card-subtle)',
                  color: 'var(--color-text)',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              />
              <span style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>minutes</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
              Time padding added automatically between sessions
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
              Minimum advance notice
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                min="0"
                value={availability.minNotice ?? 0}
                onChange={e => updateSetting('minNotice', Number(e.target.value))}
                style={{
                  width: '100px',
                  padding: '8px 12px',
                  borderRadius: '12px',
                  border: '1px solid var(--theme-border)',
                  background: 'var(--theme-bg-card-subtle)',
                  color: 'var(--color-text)',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              />
              <span style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>hours</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
              Prevents clients from booking too close to start time
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
              Max advance booking window
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                min="1"
                value={availability.maxAdvanceBooking || 30}
                onChange={e => updateSetting('maxAdvanceBooking', Number(e.target.value))}
                style={{
                  width: '100px',
                  padding: '8px 12px',
                  borderRadius: '12px',
                  border: '1px solid var(--theme-border)',
                  background: 'var(--theme-bg-card-subtle)',
                  color: 'var(--color-text)',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              />
              <span style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>days</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
              How far into the future clients can book
            </span>
          </div>
        </div>
      </div>

      {/* Busy Times from Google Calendar */}
      <div
        className="card"
        style={{
          borderRadius: 'var(--radius-card)',
          background: 'var(--theme-bg-card)',
          border: '1px solid var(--theme-border)',
          boxShadow: 'var(--shadow-card)',
          padding: '24px 28px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.3rem' }}>📅</span>
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                Google Calendar Busy Times
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--theme-text-muted)', margin: 0 }}>
                Two-way calendar sync automatically blocks candidate booking slots.
              </p>
            </div>
          </div>
          {gcal.isConnected && (
            <span
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--color-lime-soft)',
                color: '#2B3505',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              ✓ Active in Slot Engine
            </span>
          )}
        </div>

        {gcal.isConnected ? (
          <div>
            <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)', marginBottom: '14px' }}>
              Events from <strong>{gcal.email}</strong> automatically block candidate slots on your booking page:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {MOCK_GCAL_BUSY_EVENTS.map((event, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'var(--theme-bg-card-subtle)',
                    border: '1px solid var(--theme-border)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '13px', color: 'var(--color-text)' }}>{event.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
                      Every {DAY_INDEX_NAMES[event.dayOfWeek]} · {formatTimeAmPm(event.start)} – {formatTimeAmPm(event.end)}
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--theme-input-bg)',
                    color: 'var(--theme-text-muted)',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}>
                    🚫 Slot Blocked
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', padding: '12px 0 0' }}>
            <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)', margin: 0 }}>
              Google Calendar is currently disconnected. Connect in Settings to auto-block personal meetings and commitments.
            </p>
            <Link to="/dashboard/settings" style={{ textDecoration: 'none' }}>
              <PillButton variant="secondary" size="sm" arrow>
                Connect in Settings
              </PillButton>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

