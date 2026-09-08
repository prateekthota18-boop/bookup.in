/**
 * BookUp — Appointments Page
 * Appointment management, early completion auto-release, Google Calendar sync, and WhatsApp message preview
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, formatCurrency, formatDate, formatDateShort, formatTime, getStatusBadgeClass, getDepositBadgeClass, getStatusLabel, getDepositLabel, ACTIONS } from '../../data/store';
import { timeToMinutes, minutesToTime } from '../../utils/helpers';
import { whatsAppService } from '../../services/notifications/MockWhatsAppProvider';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'no-show', label: 'No-show' },
];

export default function Appointments() {
  const { state, dispatch, addToast } = useStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showNoShowModal, setShowNoShowModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completionEndTime, setCompletionEndTime] = useState('');

  const today = new Date().toISOString().split('T')[0];
  const gcalConnected = Boolean(state.googleCalendar?.isConnected);

  const filteredBookings = state.bookings
    .filter(b => {
      if (activeTab === 'all') return true;
      if (activeTab === 'upcoming') return b.date >= today && b.status === 'confirmed';
      if (activeTab === 'cancelled') return b.status === 'cancelled' || b.status === 'late-cancellation';
      return b.status === activeTab;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));

  const openCompleteDialog = (booking) => {
    setCompletionEndTime(booking.endTime);
    setShowCompleteModal(true);
  };

  const handleConfirmComplete = (booking) => {
    const scheduledEndMin = timeToMinutes(booking.endTime);
    const actualEndMin = timeToMinutes(completionEndTime);
    const freedMin = Math.max(0, scheduledEndMin - actualEndMin);

    const payload = {
      id: booking.id,
      actualEndTime: freedMin > 0 ? completionEndTime : undefined,
    };

    dispatch({ type: ACTIONS.MARK_COMPLETED, payload });

    if (freedMin > 0) {
      addToast(`Freed up ${freedMin} min — now bookable by other clients. ✓`);
    } else {
      addToast('Appointment marked as completed ✓');
    }

    setShowCompleteModal(false);
  };

  const handleMarkNoShow = (id) => {
    dispatch({ type: ACTIONS.MARK_NO_SHOW, payload: id });
    addToast('No-show recorded. Deposit forfeited (demo). 🛡️');
    setShowNoShowModal(false);
    setSelectedBooking(null);
  };

  const handleMarkLateCancellation = (id) => {
    dispatch({ type: ACTIONS.MARK_LATE_CANCELLATION, payload: id });
    addToast('Late cancellation recorded. Deposit forfeited (demo). ⚠️');
    setSelectedBooking(null);
  };

  const handleCancel = (id) => {
    dispatch({ type: ACTIONS.CANCEL_BOOKING, payload: id });
    addToast('Appointment cancelled. Deposit refunded (demo).');
    setShowCancelModal(false);
    setSelectedBooking(null);
  };

  // Appointment Detail View
  if (selectedBooking) {
    const b = state.bookings.find(bk => bk.id === selectedBooking);
    if (!b) return null;

    const isSyncedToGcal = gcalConnected || b.syncedToGoogleCalendar;
    const scheduledEndMin = timeToMinutes(b.endTime);
    const selectedEndMin = timeToMinutes(completionEndTime || b.endTime);
    const freedPreviewMin = Math.max(0, scheduledEndMin - selectedEndMin);

    // WhatsApp Message preview text based on booking status
    let waPreviewText = '';
    if (b.status === 'confirmed') {
      waPreviewText = whatsAppService.generateConfirmationMessage(b, state.provider);
    } else if (b.status === 'cancelled' || b.status === 'late-cancellation') {
      waPreviewText = whatsAppService.generateCancellationMessage(b, state.provider);
    } else {
      waPreviewText = `Hi ${b.customerName}! Thank you for attending your ${b.serviceName} session with ${state.provider?.name || 'us'}. We hope you had a great experience! ⭐`;
    }

    return (
      <div className="animate-fade-in-up">
        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedBooking(null)} style={{ marginBottom: 'var(--space-4)' }}>
          ← Back to appointments
        </button>

        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <h1 className="page-title">Appointment Details</h1>
            <p className="page-subtitle">Booking reference: {b.id}</p>
          </div>
          {isSyncedToGcal && (
            <span className="badge badge-active" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px' }}>
              <span>📅</span> Synced to Google Calendar
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
          {/* Customer Info */}
          <div className="card card-padding">
            <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>Customer</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Name</div>
                <div style={{ fontWeight: 500 }}>{b.customerName}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Phone / WhatsApp</div>
                <div>{b.customerPhone}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Email</div>
                <div>{b.customerEmail || '—'}</div>
              </div>
            </div>
          </div>

          {/* Appointment Info */}
          <div className="card card-padding">
            <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>Appointment</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Service</div>
                <div style={{ fontWeight: 500 }}>{b.serviceName}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Date & Scheduled Time</div>
                <div>{formatDate(b.date)} · {formatTime(b.startTime)} – {formatTime(b.endTime)}</div>
              </div>
              {b.actualEndTime && (
                <div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-success-700)', fontWeight: 600 }}>
                    ⚡ Completed Early
                  </div>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-success-700)' }}>
                    Finished at {formatTime(b.actualEndTime)} (released remaining time for bookings)
                  </div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Duration</div>
                <div>{b.duration} minutes</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Price</div>
                <div style={{ fontWeight: 600 }}>{formatCurrency(b.price)}</div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                <div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Status</div>
                  <span className={`badge ${getStatusBadgeClass(b.status)}`}>{getStatusLabel(b.status)}</span>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Deposit</div>
                  <span className={`badge ${getDepositBadgeClass(b.depositStatus)}`}>{getDepositLabel(b.depositStatus)}</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Calendar Sync</div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: isSyncedToGcal ? 'var(--color-primary-600)' : 'var(--color-text-secondary)' }}>
                  {isSyncedToGcal ? '✓ Event synced to provider Google Calendar' : 'Local booking only'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* WhatsApp Message Preview Panel */}
        <div className="card card-padding" style={{ marginTop: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <span style={{ fontSize: '1.25rem' }}>💬</span>
            <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, margin: 0 }}>WhatsApp Message Preview</h4>
            <span className="badge badge-active" style={{ fontSize: 'var(--font-size-xs)' }}>Simulated WhatsApp</span>
          </div>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
            Message generated and dispatched to client's phone ({b.customerPhone}):
          </p>

          <div style={{
            background: '#DCF8C6',
            borderRadius: '0 12px 12px 12px',
            padding: 'var(--space-4)',
            maxWidth: 480,
            fontSize: 'var(--font-size-sm)',
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid rgba(0,0,0,0.06)',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.5,
            color: '#111b21',
          }}>
            {waPreviewText}
            <div style={{ textAlign: 'right', fontSize: 11, color: '#667781', marginTop: 6 }}>
              {formatTime(b.startTime)} ✓✓
            </div>
          </div>
        </div>

        {/* Actions */}
        {b.status === 'confirmed' && (
          <div className="card card-padding" style={{ marginTop: 'var(--space-6)' }}>
            <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>Actions</h4>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <button className="btn btn-success btn-sm" onClick={() => openCompleteDialog(b)}>
                ✓ Mark Completed
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => {
                addToast('Reschedule: Pick a new date/time from the booking page.');
              }}>
                📅 Reschedule
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowCancelModal(true)}>
                ✕ Cancel Appointment
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setShowNoShowModal(true)}>
                🚫 Mark No-show
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleMarkLateCancellation(b.id)}>
                ⚠️ Mark Late Cancellation
              </button>
            </div>
          </div>
        )}

        {/* Early / Standard Complete Modal */}
        {showCompleteModal && (
          <div className="modal-overlay" onClick={() => setShowCompleteModal(false)}>
            <div className="modal modal-md" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Complete Appointment</h3>
                <button className="modal-close" onClick={() => setShowCompleteModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                  Mark session with <strong>{b.customerName}</strong> ({b.serviceName}) as finished.
                </p>

                <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-gray-50)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Scheduled Slot</div>
                  <div style={{ fontWeight: 600 }}>{formatTime(b.startTime)} – {formatTime(b.endTime)} ({b.duration} mins)</div>
                </div>

                <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="form-label">Actual Wrap-up Time</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                    <input
                      type="time"
                      className="form-input"
                      style={{ width: 140 }}
                      value={completionEndTime}
                      onChange={e => setCompletionEndTime(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setCompletionEndTime(b.endTime)}
                    >
                      On Schedule ({b.endTime})
                    </button>
                  </div>

                  {/* Quick early completion buttons */}
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {[15, 20, 30].map(mins => {
                      const earlyMin = scheduledEndMin - mins;
                      if (earlyMin <= timeToMinutes(b.startTime)) return null;
                      const earlyTime = minutesToTime(earlyMin);
                      return (
                        <button
                          key={mins}
                          type="button"
                          className="btn btn-ghost btn-xs"
                          style={{ border: '1px solid var(--color-border)', fontSize: 'var(--font-size-xs)' }}
                          onClick={() => setCompletionEndTime(earlyTime)}
                        >
                          {mins} min early ({earlyTime})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {freedPreviewMin > 0 ? (
                  <div style={{
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'var(--color-success-50)',
                    border: '1px solid var(--color-success-200)',
                    borderRadius: 'var(--radius-lg)',
                    color: 'var(--color-success-700)',
                    fontSize: 'var(--font-size-sm)',
                  }}>
                    ⚡ <strong>Freed up {freedPreviewMin} min</strong> — will automatically become bookable by other clients on your public page.
                  </div>
                ) : (
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                    Completed on schedule. Remaining calendar slots remain as currently scheduled.
                  </p>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowCompleteModal(false)}>Cancel</button>
                <button className="btn btn-success" onClick={() => handleConfirmComplete(b)}>
                  Confirm & Complete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* No-show Modal */}
        {showNoShowModal && (
          <div className="modal-overlay" onClick={() => setShowNoShowModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Record No-show</h3>
                <button className="modal-close" onClick={() => setShowNoShowModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: 'var(--space-4)' }}>
                  Are you sure you want to mark this appointment as a no-show?
                </p>
                {b.depositAmount > 0 && (
                  <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-error-50)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-error-100)' }}>
                    <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-error-700)', fontWeight: 500, marginBottom: 4 }}>
                      🛡️ Forfeit {formatCurrency(b.depositAmount)} deposit and charge no-show fee?
                    </p>
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-error-600)' }}>
                      Demo payment (simulated UPI) — no real charges will be made.
                    </p>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowNoShowModal(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => handleMarkNoShow(b.id)}>Confirm & Charge</button>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Modal */}
        {showCancelModal && (
          <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Cancel Appointment?</h3>
                <button className="modal-close" onClick={() => setShowCancelModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: 'var(--space-3)' }}>
                  Are you sure you want to cancel this appointment with {b.customerName}?
                </p>
                {b.depositAmount > 0 && (
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                    The {formatCurrency(b.depositAmount)} deposit will be refunded (demo).
                  </p>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowCancelModal(false)}>Keep Appointment</button>
                <button className="btn btn-danger" onClick={() => handleCancel(b.id)}>Cancel Appointment</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Appointments List View
  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <h1 className="page-title">Appointments</h1>
        <p className="page-subtitle">Manage all your bookings in one place.</p>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 'var(--space-6)' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`tab ${activeTab === tab.key ? 'tab-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            <span style={{ marginLeft: 6, fontSize: 'var(--font-size-xs)', color: 'inherit', opacity: 0.7 }}>
              {state.bookings.filter(b => {
                if (tab.key === 'all') return true;
                if (tab.key === 'upcoming') return b.date >= today && b.status === 'confirmed';
                if (tab.key === 'cancelled') return b.status === 'cancelled' || b.status === 'late-cancellation';
                return b.status === tab.key;
              }).length}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      {filteredBookings.length > 0 ? (
        <div className="card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Service</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Amount</th>
                  <th>Deposit</th>
                  <th>Status</th>
                  <th>Sync</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map(b => {
                  const isSynced = gcalConnected || b.syncedToGoogleCalendar;
                  return (
                    <tr key={b.id} className="clickable" onClick={() => setSelectedBooking(b.id)}>
                      <td>{b.customerName}</td>
                      <td>{b.serviceName}</td>
                      <td>{formatDateShort(b.date)}</td>
                      <td>
                        <div>{formatTime(b.startTime)}</div>
                        {b.actualEndTime && (
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-success-600)' }}>
                            wrapped {b.actualEndTime}
                          </div>
                        )}
                      </td>
                      <td>{formatCurrency(b.price)}</td>
                      <td>
                        <span className={`badge ${getDepositBadgeClass(b.depositStatus)}`}>
                          {getDepositLabel(b.depositStatus)}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(b.status)}`}>
                          {getStatusLabel(b.status)}
                        </span>
                      </td>
                      <td>
                        {isSynced ? (
                          <span className="badge badge-active" style={{ fontSize: 11, padding: '2px 6px' }}>
                            📅 GCal
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>📭</div>
            <div className="empty-state-title">No appointments found</div>
            <div className="empty-state-description">
              {activeTab === 'upcoming' ? 'No upcoming appointments. Share your booking link to get booked!' : 'No appointments match this filter.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
