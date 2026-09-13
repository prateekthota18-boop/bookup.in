/**
 * BookUp — Customer Booking Management Page (/manage/:token or /booking/:id)
 * Persistent public customer-management route backed by Supabase.
 * Allows customers to view confirmation, reschedule slots, and cancel with policy evaluation.
 */

import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  useStore,
  formatCurrency,
  formatDate,
  formatTime,
  getStatusBadgeClass,
  getDepositBadgeClass,
  getStatusLabel,
  getDepositLabel,
} from '../../data/store';
import { ACTIONS } from '../../data/actions';
import {
  getInitials,
  getTimeSlotsDetailedForDate,
} from '../../utils/helpers';
import { buildManagementUrl } from '../../utils/token';
import { whatsAppService } from '../../services/notifications/MockWhatsAppProvider';
import { MOCK_GCAL_BUSY_EVENTS } from '../../services/calendar/MockGoogleCalendarProvider';
import { DEMO_PROVIDER, DEMO_POLICIES, DEMO_BOOKINGS, createSeedState } from '../../data/seedData';
import { isSupabaseConfigured } from '../../services/supabase/supabaseClient';
import { customerBookingService } from '../../services/booking/customerBookingService';
import './BookingPage.css';

export default function CustomerBooking() {
  const { token, id } = useParams();
  const lookupIdentifier = token || id;
  const [searchParams] = useSearchParams();
  const isJustConfirmed = searchParams.get('confirmed') === 'true';

  const navigate = useNavigate();
  const { state, dispatch, addToast } = useStore();

  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [rescheduledSuccess, setRescheduledSuccess] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const [supabaseBookingData, setSupabaseBookingData] = useState(null);
  const bookingInState = state.bookings?.find(
    b => b.managementToken === lookupIdentifier
  );
  const demoBooking = DEMO_BOOKINGS.find(
    b => b.managementToken === lookupIdentifier
  );

  // Authoritative server projection is source of truth.
  // In-memory state only provides instant optimistic render if the customer just completed booking with matching token.
  const resolvedBooking = isSupabaseConfigured()
    ? (supabaseBookingData?.booking || (isJustConfirmed && bookingInState ? bookingInState : null))
    : (supabaseBookingData?.booking || bookingInState || demoBooking || null);

  const [isLoading, setIsLoading] = useState(
    () => !resolvedBooking && Boolean(lookupIdentifier) && isSupabaseConfigured()
  );

  const hasBookings = Boolean(state.bookings && state.bookings.length > 0);

  // Authoritative Supabase hydration for persistent access across refresh, tabs, or incognito
  useEffect(() => {
    let isMounted = true;

    if (lookupIdentifier) {
      customerBookingService
        .getBooking(lookupIdentifier)
        .then(data => {
          if (isMounted) {
            if (data) {
              setSupabaseBookingData(data);
            }
            setIsLoading(false);
          }
        })
        .catch(err => {
          console.error('Failed to load booking from API/Supabase:', err);
          if (isMounted) setIsLoading(false);
        });
    }

    if (!hasBookings && demoBooking) {
      dispatch({ type: ACTIONS.LOAD_STATE, payload: createSeedState() });
    }

    return () => {
      isMounted = false;
    };
  }, [lookupIdentifier, demoBooking, hasBookings, dispatch]);

  const provider = supabaseBookingData?.provider || state.provider || DEMO_PROVIDER;
  const policies = supabaseBookingData?.policies || supabaseBookingData?.cancellationPolicy || state.policies || DEMO_POLICIES;
  const availability = supabaseBookingData?.availability || state.availability;
  const services = useMemo(
    () => supabaseBookingData?.services || state.services || [],
    [supabaseBookingData?.services, state.services]
  );
  const isGcal = Boolean(state.googleCalendar?.isConnected);
  const providerSlug = provider?.slug || 'alex-johnson';

  const managementUrl = buildManagementUrl(resolvedBooking?.managementToken || lookupIdentifier);

  // Available slots for customer rescheduling (excluding current booking to avoid self-conflict)
  const availableSlotsDetailed = useMemo(() => {
    if (!resolvedBooking || !newDate || !availability) return [];
    const gcalEvents = isGcal
      ? (() => {
          const d = new Date(newDate + 'T00:00:00');
          const day = d.getDay();
          return MOCK_GCAL_BUSY_EVENTS.filter(e => e.dayOfWeek === day);
        })()
      : [];

    return getTimeSlotsDetailedForDate(
      newDate,
      availability,
      services.length > 0 ? services : (state.services || []),
      resolvedBooking.serviceId,
      state.bookings || [],
      gcalEvents,
      resolvedBooking.id // Exclude self
    );
  }, [resolvedBooking, newDate, availability, services, state.services, state.bookings, isGcal]);

  // Max advance date
  const maxAdvanceDays = availability?.maxAdvanceBooking ?? 30;
  const maxDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + maxAdvanceDays);
    return d.toISOString().split('T')[0];
  }, [maxAdvanceDays]);

  // Evaluate cancellation policy timing
  const cancellationWindow = policies?.cancellationWindow ?? 12;
  const isWithinFreeCancellation = useMemo(() => {
    if (!resolvedBooking?.date || !resolvedBooking?.startTime) return true;
    try {
      const aptTime = new Date(`${resolvedBooking.date}T${resolvedBooking.startTime}:00`).getTime();
      const now = new Date().getTime();
      return (aptTime - now) / (1000 * 60 * 60) >= cancellationWindow;
    } catch {
      return true;
    }
  }, [resolvedBooking, cancellationWindow]);

  // Loading state (avoids flashing "Appointment Not Found" during initial fetch)
  if (isLoading) {
    return (
      <div className="booking-page">
        <div className="booking-container">
          <div style={{ textAlign: 'center', padding: 'var(--space-12) var(--space-6)' }}>
            <div className="spinner" style={{ margin: '0 auto var(--space-4)' }} />
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Loading your appointment details...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // If booking not found
  if (!resolvedBooking) {
    return (
      <div className="booking-page">
        <div className="booking-container">
          <div className="booking-empty" style={{ textAlign: 'center', padding: 'var(--space-12) var(--space-6)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 'var(--space-3)' }}>📋</div>
            <h3 style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-2)' }}>Appointment Not Found</h3>
            <p style={{ color: 'var(--color-text-secondary)', maxWidth: 360, margin: '0 auto var(--space-6)' }}>
              We couldn't find an appointment matching reference <strong>{lookupIdentifier}</strong>.
            </p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>Return to BookUp</button>
          </div>
        </div>
      </div>
    );
  }

  const handleOpenReschedule = () => {
    setNewDate(resolvedBooking.date >= today ? resolvedBooking.date : today);
    setNewTime('');
    setShowRescheduleModal(true);
  };

  const handleConfirmReschedule = async () => {
    if (!newDate || !newTime) return;

    const slotObj = availableSlotsDetailed.find(s => s.time === newTime);
    if (!slotObj || !slotObj.available) {
      addToast('Selected time slot is no longer available. Please select another slot.', 'error');
      return;
    }

    const [h, m] = newTime.split(':').map(Number);
    const endMinutes = h * 60 + m + (resolvedBooking.duration || 60);
    const calculatedEndTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

    try {
      const result = await customerBookingService.rescheduleBooking(lookupIdentifier, newDate, newTime);
      const finalEndTime = result?.booking?.endTime || calculatedEndTime;

      // Synchronize store and local state
      dispatch({
        type: ACTIONS.RESCHEDULE_BOOKING,
        payload: {
          id: resolvedBooking.id,
          date: newDate,
          startTime: newTime,
          endTime: finalEndTime,
        },
      });

      setSupabaseBookingData(prev => prev ? {
        ...prev,
        booking: {
          ...prev.booking,
          date: newDate,
          startTime: newTime,
          endTime: finalEndTime,
        },
      } : null);

      setRescheduledSuccess(true);
      addToast('Appointment rescheduled successfully.');
      setShowRescheduleModal(false);
    } catch (err) {
      console.error('Failed to reschedule:', err);
      addToast(err.message || 'Failed to reschedule appointment.', 'error');
    }
  };

  const handleConfirmCancel = async () => {
    try {
      const result = await customerBookingService.cancelBooking(lookupIdentifier);
      const actualNewStatus = result?.status || (isWithinFreeCancellation ? 'cancelled' : 'late-cancellation');

      if (actualNewStatus === 'cancelled') {
        dispatch({ type: ACTIONS.CANCEL_BOOKING, payload: resolvedBooking.id });
        addToast(result?.message || 'Appointment cancelled.');
      } else {
        dispatch({ type: ACTIONS.MARK_LATE_CANCELLATION, payload: resolvedBooking.id });
        addToast(result?.message || 'Appointment cancelled (late cancellation).');
      }

      setSupabaseBookingData(prev => prev ? {
        ...prev,
        booking: {
          ...prev.booking,
          status: actualNewStatus,
        },
      } : null);

      setRescheduledSuccess(false);
      setShowCancelModal(false);
    } catch (err) {
      console.error('Failed to cancel:', err);
      addToast(err.message || 'Failed to cancel appointment.', 'error');
    }
  };

  const handleAddToCalendar = () => {
    if (!resolvedBooking) return;
    const title = encodeURIComponent(`${resolvedBooking.serviceName || 'Session'} with ${provider?.name || 'BookUp'}`);
    const details = encodeURIComponent(
      `Appointment with ${provider?.name}\nBooking reference: ${resolvedBooking.id}\nManage your booking: ${managementUrl}`
    );
    const cleanDate = (resolvedBooking.date || '').replace(/-/g, '');
    const startClean = (resolvedBooking.startTime || '').replace(':', '') + '00';
    const endClean = (resolvedBooking.endTime || '').replace(':', '') + '00';
    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${cleanDate}T${startClean}/${cleanDate}T${endClean}&details=${details}`;
    window.open(gcalUrl, '_blank', 'noopener,noreferrer');
  };

  const isConfirmed = resolvedBooking.status === 'confirmed';
  const isCancelled = resolvedBooking.status === 'cancelled' || resolvedBooking.status === 'late-cancellation';
  const isCompleted = resolvedBooking.status === 'completed';

  return (
    <div className="booking-page">
      <div className="booking-container">
        {/* Navigation Breadcrumb */}
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Link
            to={`/book/${providerSlug}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 500,
              textDecoration: 'none',
              transition: 'color var(--transition-fast)',
            }}
            onMouseOver={e => e.currentTarget.style.color = 'var(--color-primary-600)'}
            onMouseOut={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}
          >
            ← Back to booking page
          </Link>
        </div>

        {/* Provider / Portal Header */}
        <div className="booking-provider-header" style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <div className="avatar avatar-lg" style={{ margin: '0 auto var(--space-3)' }}>
            {getInitials(provider?.name || 'U')}
          </div>

          {isJustConfirmed ? (
            <>
              <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-2)' }}>🎉</div>
              <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, margin: '0 0 var(--space-1)', color: 'var(--color-text)' }}>
                You're booked!
              </h1>
              <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-primary-700)' }}>
                Your appointment with {provider?.name} is confirmed.
              </div>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, margin: '0 0 var(--space-1)', color: 'var(--color-text)' }}>
                Manage your appointment
              </h1>
              <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-primary-700)' }}>
                {provider?.name}
              </div>
            </>
          )}

          {provider?.businessName && (
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {provider.businessName}
            </div>
          )}
        </div>

        <div className="booking-step animate-fade-in-up">
          {/* Rescheduled Success Alert */}
          {rescheduledSuccess && isConfirmed && (
            <div style={{
              padding: 'var(--space-4)',
              background: 'var(--color-success-50)',
              border: '1px solid var(--color-success-200)',
              borderRadius: 'var(--radius-lg)',
              marginBottom: 'var(--space-5)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}>
              <span style={{ fontSize: '1.25rem' }}>✓</span>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--color-success-700)', fontSize: 'var(--font-size-sm)' }}>
                  Appointment rescheduled successfully.
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-success-600)', marginTop: 2 }}>
                  Your appointment is now booked for {formatDate(resolvedBooking.date)} at {formatTime(resolvedBooking.startTime)}.
                </div>
              </div>
            </div>
          )}

          {/* Cancelled Status Alert Banner */}
          {isCancelled && (
            <div style={{
              padding: 'var(--space-4)',
              background: 'var(--color-error-50)',
              border: '1px solid var(--color-error-200)',
              borderRadius: 'var(--radius-lg)',
              marginBottom: 'var(--space-5)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--space-3)',
            }}>
              <span style={{ fontSize: '1.25rem' }}>❌</span>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--color-error-700)', fontSize: 'var(--font-size-base)' }}>
                  Appointment cancelled
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-error-600)', marginTop: 2 }}>
                  {resolvedBooking.status === 'late-cancellation'
                    ? `Late cancellation (under ${cancellationWindow}h notice). Deposit was forfeited according to policy.`
                    : 'Cancelled within free cancellation window. Deposit has been refunded.'}
                </div>
              </div>
            </div>
          )}

          {/* Completed Status Alert Banner */}
          {isCompleted && (
            <div style={{
              padding: 'var(--space-4)',
              background: 'var(--color-success-50)',
              border: '1px solid var(--color-success-200)',
              borderRadius: 'var(--radius-lg)',
              marginBottom: 'var(--space-5)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}>
              <span style={{ fontSize: '1.25rem' }}>✓</span>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--color-success-700)', fontSize: 'var(--font-size-sm)' }}>
                  Appointment Completed
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-success-600)', marginTop: 2 }}>
                  Thank you for attending your session!
                </div>
              </div>
            </div>
          )}

          {/* Appointment Overview Summary Card */}
          <div className="booking-summary" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="summary-row">
              <span className="summary-label">Booking Reference</span>
              <span className="summary-value" style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)' }}>
                {resolvedBooking.id}
              </span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Service</span>
              <span className="summary-value" style={{ fontWeight: 600 }}>{resolvedBooking.serviceName}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Date</span>
              <span className="summary-value" style={{ fontWeight: 600 }}>{formatDate(resolvedBooking.date)}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Time</span>
              <span className="summary-value" style={{ fontWeight: 600 }}>{formatTime(resolvedBooking.startTime)} – {formatTime(resolvedBooking.endTime)}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Duration</span>
              <span className="summary-value">{resolvedBooking.duration} minutes</span>
            </div>
            <div className="summary-row summary-row-total">
              <span className="summary-label">Total Amount</span>
              <span className="summary-value">{formatCurrency(resolvedBooking.price)}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Status</span>
              <span className={`badge ${getStatusBadgeClass(resolvedBooking.status)}`}>
                {getStatusLabel(resolvedBooking.status)}
              </span>
            </div>
          </div>

          {/* Customer Details Card */}
          <div style={{
            padding: 'var(--space-4)',
            background: 'var(--color-gray-50)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            marginBottom: 'var(--space-5)',
            fontSize: 'var(--font-size-sm)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 'var(--space-2)', color: 'var(--color-text)' }}>Your Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
              <div>
                <span style={{ color: 'var(--color-text-tertiary)' }}>Name: </span>
                <span style={{ fontWeight: 500 }}>{resolvedBooking.customerName}</span>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-tertiary)' }}>Phone: </span>
                <span>{resolvedBooking.customerPhone}</span>
              </div>
              {resolvedBooking.customerEmail && (
                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>Email: </span>
                  <span>{resolvedBooking.customerEmail}</span>
                </div>
              )}
            </div>
          </div>


          {/* Customer Action Buttons */}
          {isConfirmed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <button
                className="btn btn-primary btn-block btn-lg"
                onClick={handleOpenReschedule}
              >
                📅 Reschedule Appointment
              </button>

              <button
                className="btn btn-secondary btn-block"
                onClick={handleAddToCalendar}
              >
                📅 Add to Calendar
              </button>

              <button
                className="btn btn-secondary btn-block"
                style={{ color: 'var(--color-error-600)' }}
                onClick={() => setShowCancelModal(true)}
              >
                ✕ Cancel Appointment
              </button>

              <div style={{ borderTop: '1px solid var(--color-border)', margin: 'var(--space-2) 0' }} />

              <Link
                to={`/book/${providerSlug}`}
                className="btn btn-secondary btn-block"
                style={{ textAlign: 'center', textDecoration: 'none' }}
              >
                Book another appointment
              </Link>
            </div>
          )}

          {/* Cancelled State Actions */}
          {isCancelled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <Link
                to={`/book/${providerSlug}`}
                className="btn btn-primary btn-block btn-lg"
                style={{ textAlign: 'center', textDecoration: 'none' }}
              >
                Book another appointment
              </Link>
              <Link
                to={`/book/${providerSlug}`}
                style={{
                  textAlign: 'center',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-secondary)',
                  textDecoration: 'none',
                  padding: 'var(--space-2)',
                }}
              >
                ← Back to booking page
              </Link>
            </div>
          )}

          {/* Completed State Actions */}
          {isCompleted && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <Link
                to={`/book/${providerSlug}`}
                className="btn btn-primary btn-block btn-lg"
                style={{ textAlign: 'center', textDecoration: 'none' }}
              >
                Book another appointment
              </Link>
              <Link
                to={`/book/${providerSlug}`}
                style={{
                  textAlign: 'center',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-secondary)',
                  textDecoration: 'none',
                  padding: 'var(--space-2)',
                }}
              >
                ← Back to booking page
              </Link>
            </div>
          )}
        </div>

        {/* Reschedule Modal */}
        {showRescheduleModal && (
          <div className="modal-overlay" onClick={() => setShowRescheduleModal(false)}>
            <div className="modal modal-md" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Reschedule Your Session</h3>
                <button className="modal-close" onClick={() => setShowRescheduleModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
                  Current slot: <strong>{formatDate(resolvedBooking.date)} at {formatTime(resolvedBooking.startTime)}</strong>
                </p>

                <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="form-label">Pick a New Date</label>
                  <input
                    type="date"
                    className="form-input"
                    min={today}
                    max={maxDate}
                    value={newDate}
                    onChange={e => {
                      setNewDate(e.target.value);
                      setNewTime('');
                    }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="form-label">Select Available Time Slot</label>
                  {availableSlotsDetailed.length > 0 ? (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(95px, 1fr))',
                      gap: 'var(--space-2)',
                      maxHeight: 220,
                      overflowY: 'auto',
                      padding: '2px',
                    }}>
                      {availableSlotsDetailed.map(slot => (
                        <button
                          key={slot.time}
                          type="button"
                          disabled={!slot.available}
                          className={`btn btn-sm ${newTime === slot.time ? 'btn-primary' : 'btn-secondary'}`}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 'var(--font-size-xs)',
                            padding: '6px 4px',
                            opacity: slot.available ? 1 : 0.45,
                            cursor: slot.available ? 'pointer' : 'not-allowed',
                          }}
                          onClick={() => slot.available && setNewTime(slot.time)}
                        >
                          <span>{formatTime(slot.time)}</span>
                          {!slot.available && (
                            <span style={{ fontSize: '0.625rem', opacity: 0.85, fontWeight: 500 }}>
                              {slot.reason === 'booked' ? 'Booked' : 'Unavailable'}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: 'var(--space-3)', background: 'var(--color-warning-50)', borderRadius: 'var(--radius-md)', color: 'var(--color-warning-700)', fontSize: 'var(--font-size-xs)' }}>
                      No available slots on this date. Please pick another date.
                    </div>
                  )}
                </div>

                {newTime && (
                  <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-primary-900)' }}>
                    Rescheduling to: <strong>{formatDate(newDate)} at {formatTime(newTime)}</strong>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowRescheduleModal(false)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  disabled={!newDate || !newTime}
                  onClick={handleConfirmReschedule}
                >
                  Confirm Reschedule
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Confirmation Modal with Policy Evaluation */}
        {showCancelModal && (
          <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
            <div className="modal modal-md" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Cancel Appointment</h3>
                <button className="modal-close" onClick={() => setShowCancelModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div style={{
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--color-gray-50)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 'var(--space-4)',
                  fontSize: 'var(--font-size-sm)'
                }}>
                  <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)' }}>Appointment</div>
                  <div style={{ fontWeight: 600 }}>{resolvedBooking.serviceName} with {provider?.name}</div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: 2 }}>
                    {formatDate(resolvedBooking.date)} at {formatTime(resolvedBooking.startTime)}
                  </div>
                </div>

                <div style={{
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--color-gray-50)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--font-size-sm)',
                  marginBottom: 'var(--space-4)',
                  lineHeight: 1.5,
                }}>
                  Please confirm if you would like to cancel this appointment with {provider?.name}.
                </div>

                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text)', fontWeight: 500, margin: 0 }}>
                  Are you sure you want to cancel this appointment?
                </p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowCancelModal(false)}>
                  Keep appointment
                </button>
                <button
                  className="btn btn-danger"
                  onClick={handleConfirmCancel}
                >
                  Cancel appointment
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="booking-footer">
          Powered by <strong>BookUp</strong>
        </div>
      </div>
    </div>
  );
}
