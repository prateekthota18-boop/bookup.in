/**
 * CalUp — Onboarding Flow
 * 8-step wizard for new providers
 */

import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStore, generateId, formatCurrency } from '../data/store';
import { ACTIONS } from '../data/actions';
import { generateSlug, getInitials, DAYS_OF_WEEK, DAY_FULL_LABELS } from '../utils/helpers';
import { getBookingUrl, getBookingDisplayUrl } from '../utils/url';
import { supabase, isSupabaseConfigured } from '../services/supabase/supabaseClient';
import { dbService } from '../services/supabase/dbService';
import './Onboarding.css';

const TOTAL_STEPS = 8;

const defaultAvailability = {
  monday:    { available: true, start: '09:00', end: '18:00' },
  tuesday:   { available: true, start: '09:00', end: '18:00' },
  wednesday: { available: true, start: '09:00', end: '18:00' },
  thursday:  { available: true, start: '09:00', end: '18:00' },
  friday:    { available: true, start: '09:00', end: '17:00' },
  saturday:  { available: true, start: '10:00', end: '14:00' },
  sunday:    { available: false, start: '09:00', end: '18:00' },
};

export default function Onboarding() {
  const { state, dispatch, addToast } = useStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const [businessName, setBusinessName] = useState('');
  const [providerName, setProviderName] = useState(state.provider?.name || '');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(state.provider?.avatar || state.provider?.avatarUrl || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);
  const [service, setService] = useState({ name: '', description: '', price: 1000, duration: 60, depositAmount: 200 });
  const [availability, setAvailability] = useState(defaultAvailability);
  const [bookingRules, setBookingRules] = useState({ minNotice: 2, maxAdvanceBooking: 30, bufferTime: 15, cancellationWindow: 12 });
  const [policies, setPolicies] = useState({ depositAmount: 200, depositType: 'fixed', lateCancellationFee: 200, noShowFee: 200 });
  const [reminders, setReminders] = useState({ bookingConfirmation: true, reminder24h: true, reminder2h: true, cancellationReminder: true });

  const [stepError, setStepError] = useState('');

  const slug = generateSlug(providerName || businessName || 'my-page');

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      addToast('Profile image must be under 5MB.', 'error');
      return;
    }

    setUploadingAvatar(true);
    try {
      const url = await dbService.uploadAvatar(state.provider?.id, file);
      if (url) {
        setAvatarUrl(url);
        dispatch({
          type: ACTIONS.UPDATE_PROVIDER,
          payload: { avatar: url, avatarUrl: url },
        });
        addToast('Profile photo added ✓');
      }
    } catch (err) {
      console.error('Failed to upload avatar in onboarding:', err);
      addToast(err.message || 'Failed to upload photo.', 'error');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const nextStep = () => {
    setStepError('');
    if (step === 0) {
      if (!businessName.trim() || businessName.trim().length < 2) {
        setStepError('Please enter your business or studio name.');
        return;
      }
    }
    if (step === 1) {
      if (!providerName.trim() || providerName.trim().length < 2) {
        setStepError('Please enter your full name.');
        return;
      }
    }
    if (step === 2) {
      if (!bio.trim() || bio.trim().length < 20) {
        setStepError('Bio must be at least 20 characters to introduce yourself to clients.');
        return;
      }
    }
    if (step === 3) {
      if (!service.name.trim() || service.name.trim().length < 3) {
        setStepError('Service name must be at least 3 characters.');
        return;
      }
      if (!service.description.trim() || service.description.trim().length < 15) {
        setStepError('Service description must be at least 15 characters so clients know what they are booking.');
        return;
      }
    }
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
  };

  const prevStep = () => {
    setStepError('');
    if (step > 0) setStep(step - 1);
  };

  const finishOnboarding = async () => {
    let providerId = state.provider?.id || generateId('provider');
    const authUser = isSupabaseConfigured() ? (await supabase.auth.getUser())?.data?.user : null;

    if (authUser) {
      try {
        // 1. Create/Update provider in Supabase
        const existingProv = await dbService.getProviderByUserId(authUser.id);
        if (existingProv) {
          providerId = existingProv.id;
          await dbService.updateProviderProfile(providerId, {
            name: providerName,
            businessName,
            slug,
            bio,
            bufferTime: bookingRules.bufferTime,
            minNotice: bookingRules.minNotice,
            maxAdvanceBooking: bookingRules.maxAdvanceBooking,
            avatarUrl,
          });
        } else {
          const newProv = await dbService.createProviderProfile({
            userId: authUser.id,
            name: providerName,
            businessName,
            slug,
            email: authUser.email,
            phone: state.provider?.phone || '',
            bio,
          });
          if (newProv?.id) {
            providerId = newProv.id;
          }
        }

        // 2. Create Service
        if (service.name.trim()) {
          await dbService.createService({
            providerId,
            name: service.name.trim(),
            description: service.description.trim(),
            price: Number(service.price),
            duration: Number(service.duration),
            depositAmount: Number(service.depositAmount) || 0,
            isActive: true,
          });
        }

        // 3. Save Availability
        await dbService.saveAvailability(providerId, availability, {
          bufferTime: bookingRules.bufferTime,
          minNotice: bookingRules.minNotice,
          maxAdvanceBooking: bookingRules.maxAdvanceBooking,
        });

        // 4. Save Policies
        await dbService.savePolicy(providerId, {
          cancellationWindow: bookingRules.cancellationWindow,
          depositAmount: policies.depositAmount,
          policyText: `Cancel more than ${bookingRules.cancellationWindow} hours before your appointment: full deposit refund. Late cancellation or no-show: deposit forfeited (${formatCurrency(policies.depositAmount)}).`,
        });
      } catch (err) {
        console.error('Failed to persist onboarding to Supabase:', err);
      }
    }

    dispatch({
      type: ACTIONS.UPDATE_PROVIDER,
      payload: {
        id: providerId,
        name: providerName,
        businessName,
        bio,
        slug,
      }
    });

    if (service.name.trim()) {
      dispatch({
        type: ACTIONS.ADD_SERVICE,
        payload: {
          id: generateId('svc'),
          providerId,
          name: service.name,
          description: service.description,
          price: Number(service.price),
          duration: Number(service.duration),
          depositAmount: Number(service.depositAmount) || 0,
          isActive: true,
          createdAt: new Date().toISOString(),
        }
      });
    }

    dispatch({
      type: ACTIONS.UPDATE_AVAILABILITY,
      payload: {
        providerId,
        schedule: availability,
        bufferTime: bookingRules.bufferTime,
        minNotice: bookingRules.minNotice,
        maxAdvanceBooking: bookingRules.maxAdvanceBooking,
      }
    });

    dispatch({
      type: ACTIONS.UPDATE_POLICIES,
      payload: {
        providerId,
        cancellationWindow: bookingRules.cancellationWindow,
        depositAmount: policies.depositAmount,
        depositType: policies.depositType,
        lateCancellationFee: policies.lateCancellationFee,
        noShowFee: policies.noShowFee,
        policyText: `Cancel more than ${bookingRules.cancellationWindow} hours before your appointment: full deposit refund. Late cancellation or no-show: deposit forfeited (${formatCurrency(policies.depositAmount)}).`,
      }
    });

    dispatch({ type: ACTIONS.UPDATE_REMINDERS, payload: { providerId, ...reminders } });
    dispatch({ type: ACTIONS.COMPLETE_ONBOARDING });

    setStep(TOTAL_STEPS); // Show completion
  };

  const goToDashboard = () => {
    addToast('Welcome to CalUp! Your booking page is live. 🎉');
    navigate('/dashboard');
  };

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <div className="onb-step animate-fade-in-up">
            <h2>What's your business called?</h2>
            <p>This will appear on your booking page.</p>
            <div className="form-group">
              <input
                className="form-input onb-input-lg"
                placeholder="e.g. Alex Fitness Studio"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                autoFocus
              />
            </div>
          </div>
        );

      case 1:
        return (
          <div className="onb-step animate-fade-in-up">
            <h2>What's your name?</h2>
            <p>Your clients will see this when booking.</p>
            <div className="form-group">
              <input
                className="form-input onb-input-lg"
                placeholder="e.g. Priya Sharma"
                value={providerName}
                onChange={e => setProviderName(e.target.value)}
                autoFocus
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="onb-step animate-fade-in-up">
            <h2>Tell clients about yourself</h2>
            <p>A short bio that appears on your booking page.</p>
            <div className="onb-avatar-section">
              <div
                className="avatar avatar-xl"
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: 'var(--theme-input-bg)',
                  border: '2px solid var(--color-lime)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '22px',
                  color: 'var(--color-text)',
                  margin: '0 auto',
                }}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt={providerName || 'Coach'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  getInitials(providerName)
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={handleAvatarUpload}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                >
                  {uploadingAvatar ? 'Uploading...' : (avatarUrl ? 'Change Photo' : 'Upload Profile Photo')}
                </button>
                <span className="onb-avatar-hint">JPG, PNG, or WebP up to 5MB</span>
              </div>
            </div>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span className="form-label" style={{ margin: 0 }}>Your Bio</span>
                <span style={{ fontSize: 'var(--font-size-xs)', color: bio.length >= 20 ? 'var(--color-success-600)' : 'var(--color-text-tertiary)' }}>
                  {bio.length}/20 min chars
                </span>
              </div>
              <textarea
                className="form-input form-textarea"
                placeholder="e.g. Certified personal trainer with 6+ years of experience helping busy professionals achieve lasting fitness and posture strength."
                value={bio}
                onChange={e => {
                  setBio(e.target.value);
                  if (stepError && e.target.value.trim().length >= 20) setStepError('');
                }}
                rows={4}
              />
              <span className="form-hint">At least 20 characters required. Helps clients trust your expertise.</span>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="onb-step animate-fade-in-up">
            <h2>Create your first service</h2>
            <p>You can add more services later from your dashboard.</p>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label className="form-label">Service name</label>
                <span style={{ fontSize: 'var(--font-size-xs)', color: service.name.length >= 3 ? 'var(--color-success-600)' : 'var(--color-text-tertiary)' }}>
                  min 3 chars
                </span>
              </div>
              <input
                className="form-input"
                placeholder="e.g. Personal Training Session"
                value={service.name}
                onChange={e => {
                  setService({ ...service, name: e.target.value });
                  if (stepError && e.target.value.trim().length >= 3) setStepError('');
                }}
              />
            </div>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label className="form-label">Description</label>
                <span style={{ fontSize: 'var(--font-size-xs)', color: service.description.length >= 15 ? 'var(--color-success-600)' : 'var(--color-text-tertiary)' }}>
                  {service.description.length}/15 min chars
                </span>
              </div>
              <textarea
                className="form-input form-textarea"
                placeholder="e.g. Comprehensive 1-on-1 session covering goal setting, fitness assessment, and customized workout plan."
                value={service.description}
                onChange={e => {
                  setService({ ...service, description: e.target.value });
                  if (stepError && e.target.value.trim().length >= 15) setStepError('');
                }}
                rows={3}
              />
              <span className="form-hint">Minimum 15 characters. Clear descriptions result in higher booking conversions.</span>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Price (₹)</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  value={service.price}
                  onChange={e => setService({ ...service, price: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Duration (minutes)</label>
                <input
                  className="form-input"
                  type="number"
                  min="15"
                  step="15"
                  value={service.duration}
                  onChange={e => setService({ ...service, duration: e.target.value })}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">UPI deposit to confirm (₹)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                value={service.depositAmount}
                onChange={e => setService({ ...service, depositAmount: e.target.value })}
              />
              <span className="form-hint">Set to 0 for no deposit requirement</span>
            </div>
            {service.name && (
              <div className="onb-service-preview">
                <strong>{service.name}</strong> — {formatCurrency(Number(service.price))} — {service.duration} min
                {Number(service.depositAmount) > 0 && <> — {formatCurrency(Number(service.depositAmount))} deposit</>}
              </div>
            )}
          </div>
        );

      case 4:
        return (
          <div className="onb-step animate-fade-in-up">
            <h2>Set your availability</h2>
            <p>Choose when clients can book appointments with you.</p>
            <div className="onb-availability">
              {DAYS_OF_WEEK.map(day => (
                <div className="onb-day-row" key={day}>
                  <label className="form-checkbox-group">
                    <input
                      type="checkbox"
                      className="form-checkbox"
                      checked={availability[day].available}
                      onChange={e => setAvailability({
                        ...availability,
                        [day]: { ...availability[day], available: e.target.checked }
                      })}
                    />
                    <span className="onb-day-label">{DAY_FULL_LABELS[day]}</span>
                  </label>
                  {availability[day].available ? (
                    <div className="onb-time-range">
                      <input
                        type="time"
                        className="form-input onb-time-input"
                        value={availability[day].start}
                        onChange={e => setAvailability({
                          ...availability,
                          [day]: { ...availability[day], start: e.target.value }
                        })}
                      />
                      <span>to</span>
                      <input
                        type="time"
                        className="form-input onb-time-input"
                        value={availability[day].end}
                        onChange={e => setAvailability({
                          ...availability,
                          [day]: { ...availability[day], end: e.target.value }
                        })}
                      />
                    </div>
                  ) : (
                    <span className="onb-unavailable">Unavailable</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="onb-step animate-fade-in-up">
            <h2>Booking rules</h2>
            <p>Set how far in advance clients can book and other scheduling preferences.</p>
            <div className="form-group">
              <label className="form-label">Minimum scheduling notice</label>
              <div className="onb-input-with-unit">
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  value={bookingRules.minNotice}
                  onChange={e => setBookingRules({ ...bookingRules, minNotice: Number(e.target.value) })}
                />
                <span className="onb-unit">hours</span>
              </div>
              <span className="form-hint">How much notice do you need before an appointment?</span>
            </div>
            <div className="form-group">
              <label className="form-label">Maximum advance booking</label>
              <div className="onb-input-with-unit">
                <input
                  className="form-input"
                  type="number"
                  min="1"
                  value={bookingRules.maxAdvanceBooking}
                  onChange={e => setBookingRules({ ...bookingRules, maxAdvanceBooking: Number(e.target.value) })}
                />
                <span className="onb-unit">days</span>
              </div>
              <span className="form-hint">How far in advance can clients book?</span>
            </div>
            <div className="form-group">
              <label className="form-label">Buffer time between appointments</label>
              <div className="onb-input-with-unit">
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  step="5"
                  value={bookingRules.bufferTime}
                  onChange={e => setBookingRules({ ...bookingRules, bufferTime: Number(e.target.value) })}
                />
                <span className="onb-unit">minutes</span>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Cancellation window</label>
              <div className="onb-input-with-unit">
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  value={bookingRules.cancellationWindow}
                  onChange={e => setBookingRules({ ...bookingRules, cancellationWindow: Number(e.target.value) })}
                />
                <span className="onb-unit">hours before appointment</span>
              </div>
              <span className="form-hint">Cancellations after this window are considered "late"</span>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="onb-step animate-fade-in-up">
            <h2>No-show protection & deposits</h2>
            <p>Protect your revenue when clients cancel late or don't show up.</p>
            <div className="form-group">
              <label className="form-label">Default deposit amount (₹)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                value={policies.depositAmount}
                onChange={e => setPolicies({ ...policies, depositAmount: Number(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Late cancellation fee (₹)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                value={policies.lateCancellationFee}
                onChange={e => setPolicies({ ...policies, lateCancellationFee: Number(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">No-show fee (₹)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                value={policies.noShowFee}
                onChange={e => setPolicies({ ...policies, noShowFee: Number(e.target.value) })}
              />
              <span className="form-hint">By default, the deposit is forfeited for no-shows</span>
            </div>
            <div className="onb-policy-preview">
              <div className="ppc-header" style={{ padding: '12px 16px', fontSize: '14px' }}>Your cancellation policy</div>
              <div style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                <p>✅ Cancel more than {bookingRules.cancellationWindow} hours before: <strong>full deposit refund</strong></p>
                <p style={{ marginTop: '8px' }}>⚠️ Late cancellation or no-show: <strong>deposit forfeited ({formatCurrency(policies.depositAmount)})</strong></p>
              </div>
            </div>
          </div>
        );

      case 7:
        return (
          <div className="onb-step animate-fade-in-up">
            <h2>WhatsApp reminders</h2>
            <p>Send automated reminders to your clients on WhatsApp (simulated in demo).</p>
            <div className="onb-reminder-list">
              {[
                { key: 'bookingConfirmation', label: 'Booking confirmation', desc: 'Send when a booking is confirmed' },
                { key: 'reminder24h', label: '24-hour reminder', desc: 'Send 24 hours before the appointment' },
                { key: 'reminder2h', label: '2-hour reminder', desc: 'Send 2 hours before the appointment' },
                { key: 'cancellationReminder', label: 'Cancellation policy reminder', desc: 'Include cancellation policy in reminders' },
              ].map(r => (
                <div className="onb-reminder-item" key={r.key}>
                  <div>
                    <div className="onb-reminder-label">{r.label}</div>
                    <div className="onb-reminder-desc">{r.desc}</div>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={reminders[r.key]}
                      onChange={e => setReminders({ ...reminders, [r.key]: e.target.checked })}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              ))}
            </div>
            <div className="onb-whatsapp-preview">
              <div className="wa-preview-badge">WhatsApp Preview (Simulated)</div>
              <div className="wa-preview-msg">
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Booking Confirmed! ✅</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  Hi! Your appointment with {providerName || 'your provider'} is confirmed.<br />
                  📅 {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}<br />
                  ⏰ 10:00 AM<br />
                  💰 {service.name || 'Service'} — {formatCurrency(Number(service.price) || 0)}<br /><br />
                  {Number(service.depositAmount) > 0 && <>Deposit: {formatCurrency(Number(service.depositAmount))} paid ✓<br /><br /></>}
                  Reply to reschedule or cancel.
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Completion screen
  if (step === TOTAL_STEPS) {
    return (
      <div className="onb-page">
        <div className="onb-completion animate-fade-in-up">
          <div className="onb-completion-icon">🎉</div>
          <h2>Your booking page is ready!</h2>
          <p>Share this link with your clients to start getting booked.</p>
          <div className="onb-link-display">
            <span className="onb-link-url" style={{ wordBreak: 'break-all' }}>{getBookingUrl(slug)}</span>
          </div>
          <div className="onb-completion-actions">
            <button className="btn btn-primary btn-lg" onClick={goToDashboard}>
              Open Dashboard
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => navigate(`/book/${slug}`)}>
              Open Booking Page
            </button>
            <button
              className="btn btn-whatsapp"
              onClick={() => {
                const url = getBookingUrl(slug);
                navigator.clipboard?.writeText(url).catch(() => {});
                addToast('Booking link copied! Share it on WhatsApp. 📲');
              }}
            >
              💬 Share to WhatsApp
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="onb-page">
      <div className="onb-container">
        {/* Header */}
        <div className="onb-header">
          <Link to="/" className="landing-logo">
            <span className="logo-icon">C</span>
            <span className="logo-text">CalUp</span>
          </Link>
          <span className="onb-step-counter">Step {step + 1} of {TOTAL_STEPS}</span>
        </div>

        {/* Progress */}
        <div className="onb-progress">
          <div className="onb-progress-bar" style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }} />
        </div>

        {/* Step Content */}
        <div className="onb-content">
          {renderStepContent()}
        </div>

        {/* Step Error Banner */}
        {stepError && (
          <div style={{
            margin: '0 var(--space-6) var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--color-error-50)',
            border: '1px solid var(--color-error-200)',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--color-error-700)',
            fontSize: 'var(--font-size-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}>
            <span>⚠️</span>
            <span>{stepError}</span>
          </div>
        )}

        {/* Footer */}
        <div className="onb-footer">
          {step > 0 && (
            <button className="btn btn-ghost" onClick={prevStep}>
              ← Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step < TOTAL_STEPS - 1 ? (
            <button className="btn btn-primary" onClick={nextStep}>
              Continue →
            </button>
          ) : (
            <button className="btn btn-primary" onClick={finishOnboarding}>
              Finish Setup ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
