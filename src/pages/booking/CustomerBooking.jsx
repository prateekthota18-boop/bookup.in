/**
 * BookUp — Customer Booking Management Page (/manage/:token or /booking/:id)
 * Persistent public customer-management route backed by Supabase.
 * Allows customers to view confirmation, reschedule slots, and cancel with policy evaluation.
 */

import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
import PillButton from '../../components/ui/PillButton';
import BrandLogo from '../../components/ui/BrandLogo';
import './BookingPage.css';

export default function CustomerBooking() {
  const { token, id } = useParams();
  const lookupIdentifier = token || id;

  const navigate = useNavigate();
  const { state, dispatch, addToast } = useStore();

  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [rescheduledSuccess, setRescheduledSuccess] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  // Payment state
  const [paymentScreenshot, setPaymentScreenshot] = useState(null);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [isRetryingPayment, setIsRetryingPayment] = useState(false);
  const paymentFileRef = { current: null };

  const [supabaseBookingData, setSupabaseBookingData] = useState(null);
  const [isLoading, setIsLoading] = useState(
    () => Boolean(lookupIdentifier) && isSupabaseConfigured()
  );

  const bookingInState = state.bookings?.find(
    b => b.managementToken === lookupIdentifier
  );
  const demoBooking = DEMO_BOOKINGS.find(
    b => b.managementToken === lookupIdentifier || b.id === lookupIdentifier
  );

  // Authoritative server projection is source of truth when Supabase is configured.
  // In-memory or demo state serves as fallback if Supabase is unconfigured or fetch fails.
  const resolvedBooking = isSupabaseConfigured()
    ? (supabaseBookingData?.booking || (!isLoading ? (bookingInState || demoBooking || null) : null))
    : (supabaseBookingData?.booking || bookingInState || demoBooking || null);

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

  const isPaidService = (resolvedBooking?.price || 0) > 0;
  const rawPaymentStatus = resolvedBooking?.paymentStatus;
  let paymentStatus = rawPaymentStatus || (isPaidService ? 'awaiting_payment' : 'not_required');
  if (isRetryingPayment) {
    paymentStatus = 'awaiting_payment';
  }

  const isConfirmed = resolvedBooking.status === 'confirmed';
  const isCancelled = resolvedBooking.status === 'cancelled' || resolvedBooking.status === 'late-cancellation';
  const isCompleted = resolvedBooking.status === 'completed';

  const providerName = provider?.name || provider?.businessName || 'Coach';
  const providerUpiId = supabaseBookingData?.provider?.upiId || provider?.upiId || state.provider?.upiId || null;
  const providerQrCodeUrl = supabaseBookingData?.provider?.qrCodeUrl || provider?.qrCodeUrl || state.provider?.qrCodeUrl || null;
  const showPaymentSection = Boolean(isPaidService && paymentStatus !== 'not_required');

  // Compute Headline, Subline, Celebrate Icon, and Status Badge strictly from payment_status and booking state
  let celebrateBadge = '🎉';
  let heroHeadline = "You're booked!";
  let heroSubline = `Your appointment with ${providerName} is confirmed.`;
  let statusBadgeText = getStatusLabel(resolvedBooking.status);
  let statusBadgeStyle = null;

  if (paymentStatus === 'rejected') {
    celebrateBadge = '⚠️';
    heroHeadline = "Payment couldn't be verified";
    heroSubline = `Your payment submission could not be verified by ${providerName}.`;
    statusBadgeText = 'Payment Rejected';
    statusBadgeStyle = { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' };
  } else if (isCancelled) {
    celebrateBadge = '❌';
    heroHeadline = 'Appointment Cancelled';
    heroSubline = `Your appointment with ${providerName} has been cancelled.`;
    statusBadgeText = getStatusLabel(resolvedBooking.status);
  } else if (isCompleted) {
    celebrateBadge = '✓';
    heroHeadline = 'Session Completed';
    heroSubline = `Thank you for attending your session with ${providerName}.`;
    statusBadgeText = 'Completed';
  } else if (isPaidService) {
    if (paymentStatus === 'awaiting_payment') {
      celebrateBadge = '💳';
      heroHeadline = 'Almost there — complete your payment';
      heroSubline = `Your appointment with ${providerName} is reserved. Complete payment to secure your spot.`;
      statusBadgeText = 'Awaiting Payment';
      statusBadgeStyle = { background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' };
    } else if (paymentStatus === 'verification_pending') {
      celebrateBadge = '⏱️';
      heroHeadline = `Payment submitted — waiting for ${providerName} to confirm`;
      heroSubline = `Your coach will verify your payment in their UPI app shortly.`;
      statusBadgeText = 'Verification Pending';
      statusBadgeStyle = { background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE' };
    } else if (paymentStatus === 'confirmed') {
      celebrateBadge = '🎉';
      heroHeadline = "You're booked!";
      heroSubline = `Your appointment with ${providerName} is confirmed.`;
      statusBadgeText = 'Confirmed';
      statusBadgeStyle = { background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC' };
    }
  }

  const handleMarkPaid = async () => {
    if (isMarkingPaid) return;
    setIsMarkingPaid(true);
    try {
      const res = await customerBookingService.markPaid(lookupIdentifier, paymentScreenshot);
      addToast('Payment marked as paid. Awaiting coach verification.');
      setSupabaseBookingData(prev => prev ? {
        ...prev,
        booking: {
          ...prev.booking,
          paymentStatus: 'verification_pending',
          paymentMarkedPaidAt: res?.booking?.paymentMarkedPaidAt || new Date().toISOString(),
          paymentScreenshotUrl: res?.booking?.paymentScreenshotUrl || prev.booking?.paymentScreenshotUrl,
        },
      } : null);
      setPaymentScreenshot(null);
      setIsRetryingPayment(false);
    } catch (err) {
      console.warn('Backend markPaid failed or token is demo/local, falling back to local state update:', err.message);
      const now = new Date().toISOString();
      const fakeUrl = paymentScreenshot ? URL.createObjectURL(paymentScreenshot) : null;

      // Update local Redux/store booking
      if (resolvedBooking?.id) {
        dispatch({
          type: ACTIONS.UPDATE_BOOKING,
          payload: {
            id: resolvedBooking.id,
            paymentStatus: 'verification_pending',
            paymentMarkedPaidAt: now,
            paymentScreenshotUrl: fakeUrl,
          },
        });
      }

      // Update component state so UI instantly reflects verification_pending
      setSupabaseBookingData(prev => ({
        ...(prev || {}),
        booking: {
          ...(prev?.booking || resolvedBooking || {}),
          paymentStatus: 'verification_pending',
          paymentMarkedPaidAt: now,
          paymentScreenshotUrl: fakeUrl || prev?.booking?.paymentScreenshotUrl,
        },
      }));

      addToast('Payment marked as paid. Awaiting coach verification.');
      setPaymentScreenshot(null);
      setIsRetryingPayment(false);
    } finally {
      setIsMarkingPaid(false);
    }
  };

  const meetUrl = resolvedBooking?.meetLink || resolvedBooking?.meet_link;

  return (
    <div className="janjiyuk-booking-canvas">
      <div className="janjiyuk-phone-card" style={{ maxWidth: 480 }}>
        {/* Header Bar */}
        <div className="booking-card-header">
          <div className="header-left">
            <Link to={`/book/${providerSlug}`} className="header-back-btn" title="Back to booking">
              ‹
            </Link>
            <div>
              <div className="header-provider-name">{provider?.businessName || provider?.name || 'BookUp'}</div>
              <div className="header-step-sub">Appointment Management</div>
            </div>
          </div>
          <BrandLogo iconOnly size={26} />
        </div>

        {/* Confirmation / Management Header */}
        <div className="manage-header-block animate-scale-up">
          <div className="manage-avatar">
            {getInitials(provider?.name || 'U')}
          </div>
          <div className="manage-celebrate-badge">
            {celebrateBadge}
          </div>
          <h1 className="manage-headline">
            {heroHeadline}
          </h1>
          <p className="manage-subline">
            {heroSubline}
          </p>
        </div>

        <div className="booking-step-pane" style={{ paddingTop: 0 }}>
          {/* Rescheduled Success Alert */}
          {rescheduledSuccess && isConfirmed && (
            <div className="animate-fade-in-up" style={{
              padding: '12px 16px',
              background: 'var(--color-lime-light)',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '13px',
              color: '#0E0E0E',
              fontWeight: 600,
            }}>
              <span style={{ fontSize: '16px' }}>✓</span>
              <div>
                <div>Appointment rescheduled successfully!</div>
                <div style={{ fontSize: '11.5px', fontWeight: 400, opacity: 0.8 }}>
                  New slot: {formatDate(resolvedBooking.date)} at {formatTime(resolvedBooking.startTime)}
                </div>
              </div>
            </div>
          )}

          {/* Details Block: clean label/value rows */}
          <div className="manage-details-card">
            <div className="manage-detail-row">
              <span className="manage-detail-label">Service</span>
              <span className="manage-detail-val">{resolvedBooking.serviceName}</span>
            </div>
            <div className="manage-detail-row">
              <span className="manage-detail-label">Date</span>
              <span className="manage-detail-val">{formatDate(resolvedBooking.date)}</span>
            </div>
            <div className="manage-detail-row">
              <span className="manage-detail-label">Time</span>
              <span className="manage-detail-val">
                {formatTime(resolvedBooking.startTime)} – {formatTime(resolvedBooking.endTime)}
              </span>
            </div>
            <div className="manage-detail-row">
              <span className="manage-detail-label">Duration</span>
              <span className="manage-detail-val">{resolvedBooking.duration} min</span>
            </div>
            <div className="manage-detail-row">
              <span className="manage-detail-label">Status</span>
              <span
                className={`badge ${statusBadgeStyle ? '' : 'badge-active'}`}
                style={{ textTransform: 'capitalize', ...(statusBadgeStyle || {}) }}
              >
                {statusBadgeText}
              </span>
            </div>
          </div>

          {/* Google Meet Block */}
          {meetUrl ? (
            <div className="manage-meet-block animate-fade-in-up">
              <div className="manage-meet-title">Virtual Session via Google Meet</div>
              <PillButton
                variant="primary"
                onClick={() => window.open(meetUrl, '_blank', 'noopener,noreferrer')}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Join Google Meet →
              </PillButton>
              <a
                href={meetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="manage-meet-link"
              >
                {meetUrl}
              </a>
            </div>
          ) : (
            <div className="manage-meet-pending">
              Meet link will be sent before your session.
            </div>
          )}

          {/* Payment Verification Section */}
          {showPaymentSection && (
            <div className="animate-fade-in-up" style={{ marginTop: 'var(--space-3)' }}>
              {/* 1. Awaiting Payment */}
              {paymentStatus === 'awaiting_payment' && (
                <div style={{
                  background: 'var(--theme-card-bg, #FAFAFA)',
                  border: '1px solid var(--color-warning-200, #FDE68A)',
                  borderRadius: '16px',
                  padding: '20px',
                  marginBottom: 'var(--space-3)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '18px' }}>💳</span>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>Complete Payment</h3>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                    Pay your coach directly via UPI to confirm your booking. Your slot is reserved — complete payment to secure it.
                  </p>

                  {/* UPI Info */}
                  {(providerUpiId || providerQrCodeUrl) ? (
                    <div style={{
                      background: 'var(--color-bg-subtle, #F8FAFC)',
                      borderRadius: '12px',
                      padding: '16px',
                      marginBottom: '16px',
                      border: '1px solid var(--color-border)',
                    }}>
                      {providerUpiId && (
                        <div style={{ marginBottom: providerQrCodeUrl ? '12px' : 0 }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>UPI ID</div>
                          <div style={{
                            fontSize: '15px',
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            color: 'var(--color-text)',
                            background: 'var(--theme-input-bg, #fff)',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}>
                            <span>{providerUpiId}</span>
                            <button
                              type="button"
                              onClick={() => { navigator.clipboard?.writeText(providerUpiId); addToast('UPI ID copied!'); }}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '12px',
                                color: 'var(--color-primary-600)',
                                fontWeight: 600,
                              }}
                            >Copy</button>
                          </div>
                        </div>
                      )}
                      {providerQrCodeUrl && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-tertiary)', marginBottom: '8px' }}>Scan to Pay</div>
                          <img
                            src={providerQrCodeUrl}
                            alt="UPI QR Code"
                            style={{ maxWidth: '200px', width: '100%', borderRadius: '12px', border: '1px solid var(--color-border)' }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{
                      fontSize: '13px',
                      color: 'var(--color-text-tertiary)',
                      padding: '12px',
                      background: 'var(--color-bg-subtle)',
                      borderRadius: '12px',
                      marginBottom: '16px',
                      textAlign: 'center',
                    }}>
                      Contact your coach for payment details.
                    </div>
                  )}

                  {resolvedBooking.price > 0 && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: 'var(--color-primary-50, #EFF6FF)',
                      borderRadius: '10px',
                      marginBottom: '16px',
                      fontWeight: 600,
                      fontSize: '14px',
                    }}>
                      <span>Amount</span>
                      <span style={{ fontSize: '16px', color: 'var(--color-primary-700)' }}>{formatCurrency(resolvedBooking.price)}</span>
                    </div>
                  )}

                  {/* Screenshot Upload */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>
                      Payment Screenshot (optional)
                    </label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={e => setPaymentScreenshot(e.target.files?.[0] || null)}
                      style={{ fontSize: '13px' }}
                    />
                    {paymentScreenshot && (
                      <div style={{ fontSize: '12px', color: 'var(--color-success-600)', marginTop: '4px' }}>
                        ✓ {paymentScreenshot.name}
                      </div>
                    )}
                  </div>

                  <PillButton
                    variant="primary"
                    onClick={handleMarkPaid}
                    disabled={isMarkingPaid}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {isMarkingPaid ? 'Submitting...' : "I've Paid ✓"}
                  </PillButton>
                </div>
              )}

              {/* 2. Verification Pending */}
              {paymentStatus === 'verification_pending' && (
                <div style={{
                  padding: '16px 20px',
                  background: 'var(--color-warning-50, #FFFBEB)',
                  border: '1px solid var(--color-warning-200, #FDE68A)',
                  borderRadius: '16px',
                  marginBottom: 'var(--space-3)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '16px' }}>⏱️</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-warning-800, #92400E)' }}>Payment Verification Pending</span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--color-warning-700, #A16207)', margin: 0, lineHeight: 1.5 }}>
                    Your payment details have been submitted. Your coach ({providerName}) will verify the payment shortly.
                  </p>
                  {resolvedBooking.paymentMarkedPaidAt && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--color-warning-800)', fontWeight: 500 }}>
                      Marked paid on: {new Date(resolvedBooking.paymentMarkedPaidAt).toLocaleString()}
                    </div>
                  )}
                  {resolvedBooking.paymentScreenshotUrl && (
                    <div style={{ marginTop: '8px', fontSize: '12px' }}>
                      <a href={resolvedBooking.paymentScreenshotUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary-600)', fontWeight: 600 }}>
                        View uploaded payment screenshot ↗
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* 3. Payment Confirmed */}
              {paymentStatus === 'confirmed' && (
                <div style={{
                  padding: '14px 18px',
                  background: 'var(--color-lime-light, #F0FDF4)',
                  border: '1px solid var(--color-success-200, #BBF7D0)',
                  borderRadius: '14px',
                  marginBottom: 'var(--space-3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  color: 'var(--color-success-800, #166534)',
                  fontWeight: 600,
                }}>
                  <span>Payment received ✓</span>
                </div>
              )}

              {/* 4. Payment Rejected */}
              {paymentStatus === 'rejected' && (
                <div style={{
                  padding: '16px 20px',
                  background: 'var(--color-error-50, #FEF2F2)',
                  border: '1px solid var(--color-error-200, #FECACA)',
                  borderRadius: '16px',
                  marginBottom: 'var(--space-3)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '16px' }}>❌</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-error-800, #991B1B)' }}>Payment Could Not Be Verified</span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--color-error-700, #B91C1C)', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                    Your coach could not verify your payment. The reserved slot was released.
                  </p>
                  {resolvedBooking.paymentRejectedReason && (
                    <div style={{
                      fontSize: '13px',
                      color: 'var(--color-error-800)',
                      background: '#FEE2E2',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      marginBottom: '14px',
                    }}>
                      <strong>Reason from coach:</strong> {resolvedBooking.paymentRejectedReason}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <PillButton
                      variant="primary"
                      onClick={() => setIsRetryingPayment(true)}
                      style={{ flex: 1, minWidth: '130px', justifyContent: 'center' }}
                    >
                      Retry Payment
                    </PillButton>
                    {(provider?.phone || provider?.email) && (
                      <a
                        href={provider?.phone ? `tel:${provider.phone}` : `mailto:${provider.email}`}
                        style={{ textDecoration: 'none', flex: 1, minWidth: '130px' }}
                      >
                        <PillButton variant="secondary" style={{ width: '100%', justifyContent: 'center' }}>
                          Contact Coach
                        </PillButton>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Customer Details Box: Quiet secondary styling */}
          <div className="manage-customer-box">
            <div className="manage-customer-heading">Customer Details</div>
            <div className="manage-customer-row">
              <span className="manage-customer-label">Name</span>
              <span className="manage-customer-val">{resolvedBooking.customerName}</span>
            </div>
            <div className="manage-customer-row">
              <span className="manage-customer-label">Phone</span>
              <span className="manage-customer-val">{resolvedBooking.customerPhone}</span>
            </div>
            {resolvedBooking.customerEmail && (
              <div className="manage-customer-row">
                <span className="manage-customer-label">Email</span>
                <span className="manage-customer-val">{resolvedBooking.customerEmail}</span>
              </div>
            )}
          </div>

          {/* Three Stacked Actions */}
          {isConfirmed && (
            <div className="manage-actions-stack">
              <PillButton
                variant="primary"
                onClick={handleOpenReschedule}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Reschedule Appointment
              </PillButton>

              <PillButton
                variant="secondary"
                onClick={handleAddToCalendar}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Add to Calendar
              </PillButton>

              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#EF4444',
                  fontSize: '13px',
                  fontWeight: 600,
                  padding: '8px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'opacity var(--transition-fast)',
                }}
                onMouseOver={e => e.currentTarget.style.opacity = '0.75'}
                onMouseOut={e => e.currentTarget.style.opacity = '1'}
              >
                Cancel Appointment
              </button>
            </div>
          )}

          {(isCancelled || isCompleted) && (
            <div className="manage-actions-stack">
              <Link to={`/book/${providerSlug}`} style={{ textDecoration: 'none' }}>
                <PillButton
                  variant="primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Book Another Appointment
                </PillButton>
              </Link>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="booking-card-footer">
          <div className="booking-powered-by">
            Powered by <BrandLogo size={18} />
          </div>
        </div>

        {/* Reschedule Modal */}
        {showRescheduleModal && (
          <div className="modal-overlay" onClick={() => setShowRescheduleModal(false)}>
            <div className="modal modal-md" onClick={e => e.stopPropagation()} style={{ borderRadius: '24px', padding: '24px' }}>
              <div className="modal-header">
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800 }}>Reschedule Your Session</h3>
                <button className="modal-close" onClick={() => setShowRescheduleModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--theme-text-muted)', marginBottom: 'var(--space-4)' }}>
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
                            padding: '8px 4px',
                            borderRadius: '12px',
                            opacity: slot.available ? 1 : 0.45,
                            cursor: slot.available ? 'pointer' : 'not-allowed',
                            background: newTime === slot.time ? 'var(--color-lime)' : undefined,
                            color: newTime === slot.time ? '#0E0E0E' : undefined,
                            fontWeight: newTime === slot.time ? 700 : 500,
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
                    <div style={{ padding: 'var(--space-3)', background: 'var(--theme-input-bg)', borderRadius: 'var(--radius-md)', color: 'var(--theme-text-muted)', fontSize: 'var(--font-size-xs)', textAlign: 'center' }}>
                      No available slots on this date. Please pick another date.
                    </div>
                  )}
                </div>

                {newTime && (
                  <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-lime-light)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', color: '#0E0E0E', fontWeight: 600 }}>
                    Rescheduling to: <strong>{formatDate(newDate)} at {formatTime(newTime)}</strong>
                  </div>
                )}
              </div>
              <div className="modal-footer" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <PillButton variant="ghost" onClick={() => setShowRescheduleModal(false)}>
                  Cancel
                </PillButton>
                <PillButton
                  variant="primary"
                  disabled={!newDate || !newTime}
                  onClick={handleConfirmReschedule}
                >
                  Confirm Reschedule
                </PillButton>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Confirmation Modal with Policy Evaluation */}
        {showCancelModal && (
          <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
            <div className="modal modal-md" onClick={e => e.stopPropagation()} style={{ borderRadius: '24px', padding: '24px' }}>
              <div className="modal-header">
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800 }}>Cancel Appointment</h3>
                <button className="modal-close" onClick={() => setShowCancelModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div style={{
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--theme-input-bg)',
                  borderRadius: '16px',
                  marginBottom: 'var(--space-4)',
                  fontSize: 'var(--font-size-sm)'
                }}>
                  <div style={{ color: 'var(--theme-text-muted)', fontSize: 'var(--font-size-xs)' }}>Appointment</div>
                  <div style={{ fontWeight: 700 }}>{resolvedBooking.serviceName} with {provider?.name}</div>
                  <div style={{ color: 'var(--theme-text-muted)', fontSize: 'var(--font-size-xs)', marginTop: 2 }}>
                    {formatDate(resolvedBooking.date)} at {formatTime(resolvedBooking.startTime)}
                  </div>
                </div>

                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--theme-text-muted)', lineHeight: 1.5, marginBottom: '16px' }}>
                  Please confirm if you would like to cancel your session with {provider?.name}.
                </p>
              </div>
              <div className="modal-footer" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <PillButton variant="ghost" onClick={() => setShowCancelModal(false)}>
                  Keep appointment
                </PillButton>
                <PillButton
                  variant="primary"
                  onClick={handleConfirmCancel}
                  style={{ background: '#EF4444', color: '#FFFFFF' }}
                >
                  Cancel appointment
                </PillButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
