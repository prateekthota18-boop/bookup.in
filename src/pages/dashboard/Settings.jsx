/**
 * BookUp — Settings Page
 * Profile, Profile Completeness, Google Calendar, WhatsApp Reminders, and Account
 */

import { useState } from 'react';
import { useStore, ACTIONS } from '../../data/store';
import { getInitials } from '../../utils/helpers';
import { googleCalendarService } from '../../services/calendar/MockGoogleCalendarProvider';

export default function Settings() {
  const { state, dispatch, addToast } = useStore();
  const provider = state.provider || {};
  const reminders = state.reminderSettings || {};
  const gcal = state.googleCalendar || { isConnected: false, email: null };

  const [name, setName] = useState(provider.name || '');
  const [businessName, setBusinessName] = useState(provider.businessName || '');
  const [bio, setBio] = useState(provider.bio || '');
  const [email, setEmail] = useState(provider.email || '');
  const [phone, setPhone] = useState(provider.phone || '');
  const [bioError, setBioError] = useState('');
  const [isConnectingGcal, setIsConnectingGcal] = useState(false);

  // Profile Completeness Calculation
  const hasName = Boolean(name.trim().length >= 2);
  const hasBiz = Boolean(businessName.trim().length >= 2);
  const hasBio = Boolean(bio.trim().length >= 20);
  const hasContact = Boolean(email.trim() && phone.trim());
  const hasServices = Boolean(state.services?.some(s => s.isActive && s.name && s.description));

  const completenessScore = [hasName, hasBiz, hasBio, hasContact, hasServices].filter(Boolean).length * 20;

  const completenessNudges = [];
  if (!hasBio) completenessNudges.push('Add a descriptive bio (min 20 chars)');
  if (!hasBiz) completenessNudges.push('Add your studio or business name');
  if (!hasContact) completenessNudges.push('Complete your email & phone contact info');
  if (!hasServices) completenessNudges.push('Add at least one active service');

  const handleSaveProfile = () => {
    if (bio.trim().length > 0 && bio.trim().length < 20) {
      setBioError('Bio should be at least 20 characters to build trust with clients.');
      return;
    }
    setBioError('');
    dispatch({ type: ACTIONS.UPDATE_PROVIDER, payload: { name, businessName, bio, email, phone } });
    addToast('Profile updated ✓');
  };

  const toggleReminder = (key) => {
    dispatch({ type: ACTIONS.UPDATE_REMINDERS, payload: { [key]: !reminders[key] } });
  };

  const handleConnectGcal = async () => {
    setIsConnectingGcal(true);
    try {
      const res = await googleCalendarService.connect(email || 'priya.sharma@gmail.com');
      dispatch({
        type: ACTIONS.CONNECT_GOOGLE_CALENDAR,
        payload: { email: res.email },
      });
      addToast(`Connected to Google Calendar as ${res.email} ✓`);
    } finally {
      setIsConnectingGcal(false);
    }
  };

  const handleDisconnectGcal = async () => {
    await googleCalendarService.disconnect();
    dispatch({ type: ACTIONS.DISCONNECT_GOOGLE_CALENDAR });
    addToast('Google Calendar disconnected');
  };

  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your profile, calendar integrations, and account preferences.</p>
      </div>

      {/* Profile Completeness Meter */}
      <div className="card card-padding" style={{ marginBottom: 'var(--space-6)', borderLeft: '4px solid var(--color-primary-600)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
          <div>
            <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, margin: 0 }}>Profile Completeness</h4>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {completenessScore === 100
                ? '🎉 Excellent! Your profile is complete and optimized for client trust.'
                : `Your profile is ${completenessScore}% complete — ${completenessNudges[0] || 'complete remaining steps'}`}
            </div>
          </div>
          <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: completenessScore === 100 ? 'var(--color-success-600)' : 'var(--color-primary-600)' }}>
            {completenessScore}%
          </div>
        </div>
        <div style={{ width: '100%', height: 8, background: 'var(--color-gray-100)', borderRadius: 999, overflow: 'hidden', marginTop: 'var(--space-3)' }}>
          <div style={{
            width: `${completenessScore}%`,
            height: '100%',
            background: completenessScore === 100 ? 'var(--color-success-500)' : 'var(--color-primary-600)',
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* Profile */}
      <div className="card card-padding" style={{ marginBottom: 'var(--space-6)' }}>
        <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-5)' }}>Profile</h4>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
          <div className="avatar avatar-xl">{getInitials(name)}</div>
          <div>
            <div style={{ fontWeight: 500 }}>{name || 'Your Name'}</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{businessName || 'Your Business'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 560 }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Your name</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Business name</label>
              <input className="form-input" value={businessName} onChange={e => setBusinessName(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label className="form-label">Bio</label>
              <span style={{ fontSize: 'var(--font-size-xs)', color: bio.length >= 20 ? 'var(--color-success-600)' : 'var(--color-text-tertiary)' }}>
                {bio.length}/20 min chars
              </span>
            </div>
            <textarea
              className={`form-input form-textarea ${bioError ? 'form-input-error' : ''}`}
              placeholder="e.g. Certified personal trainer helping busy professionals build strength and consistency."
              value={bio}
              onChange={e => {
                setBio(e.target.value);
                if (e.target.value.trim().length >= 20) setBioError('');
              }}
              rows={3}
            />
            {bioError ? (
              <span className="form-hint" style={{ color: 'var(--color-error-600)' }}>{bioError}</span>
            ) : (
              <span className="form-hint">Brief intro displayed on your public booking page. Minimum 20 characters recommended.</span>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={handleSaveProfile}>
            Save Profile
          </button>
        </div>
      </div>

      {/* Google Calendar Integration (Optional) */}
      <div className="card card-padding" style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 4 }}>
              <span style={{ fontSize: '1.25rem' }}>📅</span>
              <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, margin: 0 }}>Google Calendar Integration</h4>
            </div>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
              Optional 2-way sync: automatically block your Google Calendar busy times and sync BookUp bookings.
            </p>
          </div>

          {gcal.isConnected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span className="badge badge-active" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                Connected as {gcal.email}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={handleDisconnectGcal}>
                Disconnect
              </button>
            </div>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={handleConnectGcal} disabled={isConnectingGcal}>
              {isConnectingGcal ? 'Connecting...' : '🔗 Connect Google Calendar'}
            </button>
          )}
        </div>

        {gcal.isConnected ? (
          <div style={{
            background: 'var(--color-primary-50)',
            border: '1px solid var(--color-primary-200)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-primary-900)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>✓ Real-time Sync Active</div>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
              <li>Every confirmed BookUp booking is created on your Google Calendar with a <code>Synced to Google Calendar</code> badge.</li>
              <li>Your personal Google Calendar busy intervals automatically block candidate booking slots on your public page.</li>
            </ul>
          </div>
        ) : (
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
            No Google account required to use BookUp. Connecting your calendar is a convenience add-on to prevent overlapping commitments.
          </div>
        )}
      </div>

      {/* WhatsApp Reminders */}
      <div className="card card-padding" style={{ marginBottom: 'var(--space-6)' }}>
        <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>WhatsApp Reminders</h4>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-5)' }}>
          Send automated reminders and confirmation updates to your clients on WhatsApp (simulated in prototype).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            { key: 'bookingConfirmation', label: 'Booking confirmation', desc: 'Send when a booking is confirmed' },
            { key: 'reminder24h', label: '24-hour reminder', desc: 'Remind clients 24 hours before' },
            { key: 'reminder2h', label: '2-hour reminder', desc: 'Remind clients 2 hours before' },
            { key: 'cancellationReminder', label: 'Cancellation policy', desc: 'Include cancellation policy in reminders' },
          ].map(r => (
            <div key={r.key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: 'var(--space-4) 0', borderBottom: '1px solid var(--color-border)',
            }}>
              <div>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{r.label}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 2 }}>{r.desc}</div>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={reminders[r.key] || false} onChange={() => toggleReminder(r.key)} />
                <span className="toggle-slider"></span>
              </label>
            </div>
          ))}
        </div>

        {/* Simulated WhatsApp Preview */}
        <div style={{ marginTop: 'var(--space-6)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
            WhatsApp Preview (Simulated)
          </div>
          <div style={{
            background: '#DCF8C6', borderRadius: '0 8px 8px 8px', padding: 'var(--space-3) var(--space-4)',
            maxWidth: 340, fontSize: 'var(--font-size-sm)', boxShadow: 'var(--shadow-xs)', border: '1px solid rgba(0,0,0,0.05)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: '#075E54' }}>BookUp Reminders ✓✓</div>
            <div style={{ fontSize: 13, color: 'var(--color-gray-700)', lineHeight: 1.5 }}>
              Hi! This is a reminder for your appointment tomorrow with {provider.name || 'your provider'}.<br /><br />
              📅 Tomorrow at 10:00 AM<br />
              💼 Personal Training<br /><br />
              See you soon! 👋
            </div>
          </div>
        </div>
      </div>

      {/* Account */}
      <div className="card card-padding">
        <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>Account</h4>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
          {state.auth.isDemoMode ? 'You are using BookUp in Demo Mode. All actions run locally.' : 'Manage your account settings.'}
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => addToast('Password reset link sent (demo).')}>
            Change Password
          </button>
          <button className="btn btn-secondary btn-sm" style={{ color: 'var(--color-error-600)' }} onClick={() => addToast('Account deletion disabled in demo.')}>
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}
