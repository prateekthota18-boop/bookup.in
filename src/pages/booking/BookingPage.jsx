/**
 * BookUp — Public Booking Page
 * Mobile-first, one-handed booking flow
 */

import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore, formatCurrency, formatTime, formatDate, generateId } from '../../data/store';
import { ACTIONS } from '../../data/actions';
import { getInitials, getCalendarDays, isDateAvailable, getTimeSlotsDetailedForDate, isPastDate, isFutureDate } from '../../utils/helpers';
import { MOCK_GCAL_BUSY_EVENTS } from '../../services/calendar/MockGoogleCalendarProvider';
import { realGoogleCalendarService } from '../../services/calendar/RealGoogleCalendarProvider';
import { whatsAppService } from '../../services/notifications/MockWhatsAppProvider';
import { isDemoSlug, createSeedState } from '../../data/seedData';
import { isSupabaseConfigured } from '../../services/supabase/supabaseClient';
import { dbService } from '../../services/supabase/dbService';
import './BookingPage.css';

export default function PublicBookingPage() {
  const { state, dispatch, addToast } = useStore();
  const navigate = useNavigate();
  const { slug } = useParams();

  // Resolve provider from state or demo fallback
  const isDemo = isDemoSlug(slug);
  const demoFallback = useMemo(() => (isDemo ? createSeedState(slug) : null), [isDemo, slug]);

  // Supabase public data state
  const [supabaseData, setSupabaseData] = useState(null);
  const [isLoadingPublic, setIsLoadingPublic] = useState(!isDemo && isSupabaseConfigured());

  // Fetch live provider, services, availability, bookings from Supabase
  useEffect(() => {
    let isMounted = true;
    if (!isDemo && slug && isSupabaseConfigured()) {
      dbService.getPublicBookingData(slug).then(data => {
        if (isMounted) {
          if (data) setSupabaseData(data);
          setIsLoadingPublic(false);
        }
      }).catch(err => {
        console.error('Failed to load public booking data from Supabase:', err);
        if (isMounted) setIsLoadingPublic(false);
      });
    }
    return () => { isMounted = false; };
  }, [slug, isDemo]);

  // Hydrate store on cold start/incognito or when navigating to a demo provider
  useEffect(() => {
    if (isDemo && (!state.provider || state.provider.slug !== slug)) {
      const seed = createSeedState(slug);
      const existingBookings = (state.bookings && state.bookings.length > 0) ? state.bookings : seed.bookings;
      dispatch({
        type: ACTIONS.LOAD_STATE,
        payload: { ...seed, bookings: existingBookings }
      });
    }
  }, [slug, isDemo, state.provider, state.bookings, dispatch]);

  const provider = supabaseData?.provider || ((state.provider && state.provider.slug === slug)
    ? state.provider
    : (demoFallback ? demoFallback.provider : null));

  const availability = supabaseData?.availability || ((state.provider && state.provider.slug === slug)
    ? state.availability
    : (demoFallback ? demoFallback.availability : null));

  const allServices = supabaseData?.services || ((state.provider && state.provider.slug === slug)
    ? (state.services || [])
    : (demoFallback ? demoFallback.services : []));
  const services = allServices.filter(s => s.isActive);

  const policies = supabaseData?.policies || ((state.provider && state.provider.slug === slug)
    ? state.policies
    : (demoFallback ? demoFallback.policies : null));

  const [step, setStep] = useState('service');
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', whatsapp: '', email: '' });
  const [paymentDone, setPaymentDone] = useState(false);
  const [policyAgreed, setPolicyAgreed] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  // Calendar state
  const today = new Date();
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());
  const calDays = useMemo(() => getCalendarDays(calYear, calMonth), [calYear, calMonth]);
  const todayStr = today.toISOString().split('T')[0];

  // External calendar busy times (live Google Calendar when provider has connected)
  const [liveGcalBusyTimes, setLiveGcalBusyTimes] = useState([]);

  useEffect(() => {
    let isMounted = true;
    if (isDemo) return;

    if (selectedDate && provider?.id) {
      realGoogleCalendarService.getBusyTimes(selectedDate, provider.id, provider.timezone || 'Asia/Kolkata').then(times => {
        if (isMounted && Array.isArray(times)) {
          setLiveGcalBusyTimes(times);
        }
      }).catch(err => {
        console.warn('Could not fetch calendar busy times (graceful fallback):', err.message);
      });
    }
    return () => { isMounted = false; };
  }, [isDemo, selectedDate, provider?.id, provider?.timezone]);

  const calendarBusyTimes = useMemo(() => {
    if (isDemo) {
      if (!state.googleCalendar?.isConnected || !selectedDate) return [];
      const d = new Date(selectedDate + 'T00:00:00');
      const day = d.getDay();
      return MOCK_GCAL_BUSY_EVENTS.filter(e => e.dayOfWeek === day);
    }
    return liveGcalBusyTimes;
  }, [isDemo, state.googleCalendar?.isConnected, selectedDate, liveGcalBusyTimes]);

  const timeSlotsDetailed = useMemo(() => {
    if (!selectedDate || !selectedService) return [];
    const bookingsToCheck = (supabaseData?.bookings && supabaseData.bookings.length > 0)
      ? supabaseData.bookings
      : ((state.bookings && state.bookings.length > 0)
        ? state.bookings
        : (demoFallback?.bookings || []));
    return getTimeSlotsDetailedForDate(
      selectedDate,
      availability,
      services,
      selectedService.id,
      bookingsToCheck,
      calendarBusyTimes
    );
  }, [selectedDate, selectedService, availability, services, supabaseData, state.bookings, demoFallback?.bookings, calendarBusyTimes]);

  const timeSlots = useMemo(() => {
    return timeSlotsDetailed.filter(s => s.available).map(s => s.time);
  }, [timeSlotsDetailed]);

  const service = selectedService;
  const requiresDeposit = service && service.depositAmount > 0;

  if (isLoadingPublic) {
    return (
      <div className="booking-page">
        <div className="booking-container" style={{ textAlign: 'center', padding: 'var(--space-12) var(--space-6)' }}>
          <h3 style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
            Loading booking page...
          </h3>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>Please wait</p>
        </div>
      </div>
    );
  }

  // Unknown or missing provider? Show polished not found screen
  if (!provider) {
    return (
      <div className="booking-page">
        <div className="booking-container">
          <div className="booking-empty" style={{ textAlign: 'center', padding: 'var(--space-12) var(--space-6)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 'var(--space-3)' }}>🔗</div>
            <h3 style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-2)' }}>Booking page not found</h3>
            <p style={{ color: 'var(--color-text-secondary)', maxWidth: 380, margin: '0 auto var(--space-6)', lineHeight: 1.5 }}>
              The booking link <strong>/book/{slug}</strong> doesn't exist or hasn't been set up yet.
            </p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>Go to BookUp</button>
          </div>
        </div>
      </div>
    );
  }

  const handleSelectService = (svc) => {
    setSelectedService(svc);
    setStep('date');
  };

  const handleSelectDate = (dateStr) => {
    setSelectedDate(dateStr);
    setSelectedTime(null);
    setStep('time');
  };

  const handleSelectTime = (time) => {
    setSelectedTime(time);
    setStep('info');
  };

  const handleSubmitInfo = (e) => {
    e.preventDefault();
    if (!customerInfo.name.trim() || !customerInfo.phone.trim()) return;
    if (requiresDeposit) {
      setStep('payment');
    } else {
      setStep('review');
    }
  };

  const handlePayment = () => {
    setPaymentDone(true);
    setTimeout(() => setStep('review'), 800);
  };

  const handleConfirmBooking = async () => {
    if (!policyAgreed) return;

    if (!timeSlots.includes(selectedTime)) {
      addToast('Selected time slot is no longer available. Please choose another slot.', 'error');
      setStep('time');
      return;
    }

    const service = selectedService;
    const [h, m] = selectedTime.split(':').map(Number);
    const endMinutes = h * 60 + m + service.duration;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

    let realBookingId = generateId('booking');
    let authoritativePrice = service.price;
    let authoritativeDeposit = service.depositAmount;

    // Real Supabase persistence & authoritative double-booking protection
    if (!isDemo && isSupabaseConfigured() && provider?.id) {
      try {
        const result = await dbService.createBookingAtomic({
          providerId: provider.id,
          serviceId: service.id,
          customerName: customerInfo.name.trim(),
          customerEmail: customerInfo.email?.trim() || '',
          customerPhone: customerInfo.phone.trim(),
          customerWhatsApp: customerInfo.whatsapp?.trim() || customerInfo.phone.trim(),
          bookingDate: selectedDate,
          startTime: selectedTime,
          notes: '',
        });

        if (result?.bookingId) {
          realBookingId = result.bookingId;
        }
        if (result?.price !== undefined) authoritativePrice = result.price;
        if (result?.depositAmount !== undefined) authoritativeDeposit = result.depositAmount;
      } catch (err) {
        console.error('Booking creation error:', err);
        addToast(err.message || 'Failed to create booking. Please select another slot.', 'error');
        // Refresh live bookings to update slots
        if (slug) {
          dbService.getPublicBookingData(slug).then(d => {
            if (d) setSupabaseData(d);
          });
        }
        return;
      }
    }

    const booking = {
      id: realBookingId,
      providerId: provider.id,
      serviceId: service.id,
      serviceName: service.name,
      customerId: generateId('cust'),
      customerName: customerInfo.name,
      customerPhone: customerInfo.phone,
      customerWhatsApp: customerInfo.whatsapp || customerInfo.phone,
      customerEmail: customerInfo.email,
      date: selectedDate,
      startTime: selectedTime,
      endTime,
      duration: service.duration,
      price: authoritativePrice,
      depositAmount: authoritativeDeposit,
      depositStatus: requiresDeposit ? 'paid' : 'na',
      status: 'confirmed',
      source: 'BookUp booking page',
      notes: '',
      createdAt: new Date().toISOString(),
    };

    const customer = {
      id: booking.customerId,
      name: customerInfo.name,
      phone: customerInfo.phone,
      whatsapp: customerInfo.whatsapp || customerInfo.phone,
      email: customerInfo.email,
    };

    dispatch({ type: ACTIONS.ADD_BOOKING, payload: { booking, customer } });
    setConfirmedBooking(booking);
    setStep('confirmed');

    // Sync event to provider's Google Calendar if real provider
    if (!isDemo && provider?.id) {
      realGoogleCalendarService.createEvent(booking, provider.id, provider.timezone || 'Asia/Kolkata').then(gRes => {
        if (gRes?.success && gRes.eventId) {
          dispatch({
            type: ACTIONS.UPDATE_BOOKING,
            payload: {
              id: booking.id,
              googleEventId: gRes.eventId,
              googleEventLink: gRes.htmlLink,
              syncedToGoogleCalendar: true,
            },
          });
          setConfirmedBooking(prev => prev ? { ...prev, googleEventId: gRes.eventId, syncedToGoogleCalendar: true } : prev);
        }
      }).catch(err => {
        console.warn('Google Calendar sync failed (non-blocking):', err.message);
      });
    } else if (isDemo && state.googleCalendar?.isConnected) {
      dispatch({
        type: ACTIONS.UPDATE_BOOKING,
        payload: {
          id: booking.id,
          googleEventId: 'demo-gcal-event',
          syncedToGoogleCalendar: true,
        },
      });
    }
  };

  const goBack = () => {
    const stepOrder = ['service', 'date', 'time', 'info', 'payment', 'review'];
    const idx = stepOrder.indexOf(step);
    if (idx > 0) {
      let prevStep = stepOrder[idx - 1];
      if (prevStep === 'payment' && !requiresDeposit) prevStep = 'info';
      setStep(prevStep);
    }
  };

  return (
    <div className="booking-page">
      <div className="booking-container">
        {/* Provider Header */}
        <div className="booking-provider-header">
          <div className="avatar avatar-lg" style={{ margin: '0 auto var(--space-3)' }}>
            {getInitials(provider.name)}
          </div>
          <h2 className="booking-provider-name">{provider.name}</h2>
          {provider.businessName && (
            <p className="booking-provider-biz">{provider.businessName}</p>
          )}
          {step === 'service' && (
            <p className="booking-provider-bio">
              {provider.bio && provider.bio.trim().length >= 20
                ? provider.bio
                : `Book a 1-on-1 session with ${provider.name}.`}
            </p>
          )}
        </div>

        {/* Back button (not on service or confirmed step) */}
        {step !== 'service' && step !== 'confirmed' && (
          <button className="booking-back" onClick={goBack}>← Back</button>
        )}

        {/* Step: Select Service */}
        {step === 'service' && (
          <div className="booking-step animate-fade-in-up">
            <div className="booking-step-title">Select a service</div>
            <div className="booking-services">
              {services.map(svc => (
                <button className="booking-service-card" key={svc.id} onClick={() => handleSelectService(svc)}>
                  <div className="booking-service-name">{svc.name}</div>
                  {svc.description && <div className="booking-service-desc">{svc.description}</div>}
                  <div className="booking-service-meta">
                    <span>{svc.duration} min</span>
                    <span>·</span>
                    <span className="booking-service-price">{formatCurrency(svc.price)}</span>
                  </div>
                  {svc.depositAmount > 0 && (
                    <div className="booking-service-deposit">
                      {formatCurrency(svc.depositAmount)} deposit to confirm
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Select Date */}
        {step === 'date' && (
          <div className="booking-step animate-fade-in-up">
            <div className="booking-step-title">Select a date</div>
            <div className="booking-selected-service">
              {service.name} · {service.duration} min · {formatCurrency(service.price)}
            </div>

            <div className="booking-calendar">
              <div className="cal-header">
                <button className="cal-nav" onClick={() => {
                  if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
                  else setCalMonth(calMonth - 1);
                }}>←</button>
                <span className="cal-title">
                  {new Date(calYear, calMonth).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                </span>
                <button className="cal-nav" onClick={() => {
                  if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
                  else setCalMonth(calMonth + 1);
                }}>→</button>
              </div>
              <div className="cal-weekdays">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div className="cal-weekday" key={d}>{d}</div>
                ))}
              </div>
              <div className="cal-days">
                {calDays.map((d, i) => {
                  const maxDays = availability?.maxAdvanceBooking ?? 30;
                  const isAvailable = d.isCurrentMonth && d.date && !isPastDate(d.date) && isFutureDate(d.date, maxDays) && isDateAvailable(d.date, availability);
                  const isSelected = d.date === selectedDate;
                  const isTodayDate = d.date === todayStr;
                  return (
                    <button
                      className={`cal-day ${!d.isCurrentMonth ? 'cal-day-other' : ''} ${isAvailable ? 'cal-day-available' : 'cal-day-disabled'} ${isSelected ? 'cal-day-selected' : ''} ${isTodayDate ? 'cal-day-today' : ''}`}
                      key={i}
                      disabled={!isAvailable}
                      onClick={() => isAvailable && handleSelectDate(d.date)}
                    >
                      {d.day}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step: Select Time */}
        {step === 'time' && (
          <div className="booking-step animate-fade-in-up">
            <div className="booking-step-title">Select a time</div>
            <div className="booking-selected-service">
              {service.name} · {formatDate(selectedDate)}
            </div>

            {timeSlotsDetailed.length > 0 ? (
              <div className="booking-time-grid">
                {timeSlotsDetailed.map(slot => (
                  <button
                    key={slot.time}
                    type="button"
                    disabled={!slot.available}
                    className={`booking-time-slot ${selectedTime === slot.time ? 'booking-time-selected' : ''} ${!slot.available ? 'booking-time-disabled' : ''}`}
                    onClick={() => slot.available && handleSelectTime(slot.time)}
                  >
                    <span className="slot-time">{formatTime(slot.time)}</span>
                    {!slot.available && (
                      <span className="slot-status-label">
                        {slot.reason === 'booked' ? 'Booked' : 'Unavailable'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="booking-no-slots">
                <p>No available time slots on this date.</p>
                <button className="btn btn-secondary btn-sm" onClick={() => setStep('date')}>Pick another date</button>
              </div>
            )}
          </div>
        )}

        {/* Step: Customer Info */}
        {step === 'info' && (
          <div className="booking-step animate-fade-in-up">
            <div className="booking-step-title">Your details</div>
            <div className="booking-selected-service">
              {service.name} · {formatDate(selectedDate)} · {formatTime(selectedTime)}
            </div>

            <form className="booking-form" onSubmit={handleSubmitInfo}>
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input
                  className="form-input"
                  placeholder="Your full name"
                  value={customerInfo.name}
                  onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phone number *</label>
                <input
                  className="form-input"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={customerInfo.phone}
                  onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">WhatsApp number</label>
                <input
                  className="form-input"
                  type="tel"
                  placeholder="Same as phone number"
                  value={customerInfo.whatsapp}
                  onChange={e => setCustomerInfo({ ...customerInfo, whatsapp: e.target.value })}
                />
                <span className="form-hint">For booking confirmation and reminders</span>
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  type="email"
                  placeholder="your@email.com"
                  value={customerInfo.email}
                  onChange={e => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                />
              </div>
              <button className="btn btn-primary btn-block" type="submit">
                {requiresDeposit ? 'Continue to Payment' : 'Review Booking'}
              </button>
            </form>
          </div>
        )}

        {/* Step: Simulated UPI Payment */}
        {step === 'payment' && (
          <div className="booking-step animate-fade-in-up">
            <div className="booking-step-title">Pay deposit via UPI</div>
            <div className="booking-payment">
              <div className="payment-card">
                <div className="payment-amount">{formatCurrency(service.depositAmount)}</div>
                <div className="payment-label">Deposit to confirm booking</div>

                <div className="payment-demo-badge">
                  ⚠️ Demo payment (simulated UPI) — no real charges
                </div>

                <div className="payment-upi-options">
                  <button className="upi-option" onClick={handlePayment}>
                    <span className="upi-icon">📱</span>
                    <span>Google Pay</span>
                  </button>
                  <button className="upi-option" onClick={handlePayment}>
                    <span className="upi-icon">💳</span>
                    <span>PhonePe</span>
                  </button>
                  <button className="upi-option" onClick={handlePayment}>
                    <span className="upi-icon">💰</span>
                    <span>Paytm</span>
                  </button>
                  <button className="upi-option" onClick={handlePayment}>
                    <span className="upi-icon">🏦</span>
                    <span>UPI ID</span>
                  </button>
                </div>

                {paymentDone && (
                  <div className="payment-success animate-scale-in">
                    <span style={{ fontSize: '1.5rem' }}>✅</span>
                    <span>Payment successful (simulated)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step: Review */}
        {step === 'review' && (
          <div className="booking-step animate-fade-in-up">
            <div className="booking-step-title">Review your booking</div>

            <div className="booking-summary">
              <div className="summary-row">
                <span className="summary-label">Service</span>
                <span className="summary-value">{service.name}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Date</span>
                <span className="summary-value">{formatDate(selectedDate)}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Time</span>
                <span className="summary-value">{formatTime(selectedTime)} – {(() => {
                  const [h, m] = selectedTime.split(':').map(Number);
                  const end = h * 60 + m + service.duration;
                  return formatTime(`${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`);
                })()}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Duration</span>
                <span className="summary-value">{service.duration} minutes</span>
              </div>
              <div className="summary-row summary-row-total">
                <span className="summary-label">Total</span>
                <span className="summary-value">{formatCurrency(service.price)}</span>
              </div>
              {requiresDeposit && (
                <div className="summary-row">
                  <span className="summary-label">Deposit paid</span>
                  <span className="summary-value" style={{ color: 'var(--color-success-600)' }}>
                    {formatCurrency(service.depositAmount)} ✓
                  </span>
                </div>
              )}
            </div>

            {/* Cancellation Policy */}
            {policies && (
              <div className="booking-policy">
                <div className="booking-policy-title">Cancellation Policy</div>
                <p className="booking-policy-text">{policies.policyText}</p>
              </div>
            )}

            <div className="booking-agree">
              <label className="form-checkbox-group">
                <input
                  type="checkbox"
                  className="form-checkbox"
                  checked={policyAgreed}
                  onChange={e => setPolicyAgreed(e.target.checked)}
                />
                <span style={{ fontSize: 'var(--font-size-sm)' }}>I agree to the cancellation policy</span>
              </label>
            </div>

            <button
              className="btn btn-primary btn-block btn-lg"
              disabled={!policyAgreed}
              onClick={handleConfirmBooking}
            >
              Confirm Booking
            </button>
          </div>
        )}

        {/* Step: Confirmed */}
        {step === 'confirmed' && confirmedBooking && (
          <div className="booking-step booking-confirmed animate-fade-in-up">
            <div className="confirmed-icon">🎉</div>
            <h2 className="confirmed-title">You're booked!</h2>
            <div className="booking-summary">
              <div className="summary-row">
                <span className="summary-label">Service</span>
                <span className="summary-value">{confirmedBooking.serviceName}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">With</span>
                <span className="summary-value">{provider.name}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Date</span>
                <span className="summary-value">{formatDate(confirmedBooking.date)}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Time</span>
                <span className="summary-value">{formatTime(confirmedBooking.startTime)} – {formatTime(confirmedBooking.endTime)}</span>
              </div>
              {confirmedBooking.depositAmount > 0 && (
                <div className="summary-row">
                  <span className="summary-label">Deposit</span>
                  <span className="summary-value" style={{ color: 'var(--color-success-600)' }}>
                    {formatCurrency(confirmedBooking.depositAmount)} paid ✓
                  </span>
                </div>
              )}
            </div>

            {/* WhatsApp Confirmation Message Preview */}
            <div className="confirmed-whatsapp-preview">
              <div className="confirmed-whatsapp-label">
                <span>💬</span> WhatsApp Message Confirmation (Simulated)
              </div>
              <div className="confirmed-whatsapp-bubble">
                {whatsAppService.generateConfirmationMessage(confirmedBooking, provider)}
                <div className="confirmed-whatsapp-time">
                  {formatTime(confirmedBooking.startTime)} ✓✓
                </div>
              </div>
            </div>

            <div className="confirmed-actions">
              <button
                className="btn btn-primary btn-block"
                onClick={() => navigate(`/booking/${confirmedBooking.id}`)}
              >
                ⚙️ Manage Appointment
              </button>
              <button className="btn btn-secondary btn-block" onClick={() => addToast('Added to calendar (demo) 📅')}>
                📅 Add to Calendar
              </button>
              <button className="btn btn-ghost btn-block btn-sm" onClick={() => {
                setStep('service');
                setSelectedService(null);
                setSelectedDate(null);
                setSelectedTime(null);
                setCustomerInfo({ name: '', phone: '', whatsapp: '', email: '' });
                setPaymentDone(false);
                setPolicyAgreed(false);
                setConfirmedBooking(null);
              }}>
                Book another appointment
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="booking-footer">
          Powered by <strong>BookUp</strong>
        </div>
      </div>
    </div>
  );
}
