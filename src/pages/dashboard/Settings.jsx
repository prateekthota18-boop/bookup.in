/**
 * BookUp — Settings Page
 * Profile, Profile Completeness, Google Calendar, WhatsApp Reminders, and Account
 */

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useStore } from '../../data/store';
import { ACTIONS } from '../../data/actions';
import { getInitials, generateSlug } from '../../utils/helpers';
import { realGoogleCalendarService } from '../../services/calendar/RealGoogleCalendarProvider';
import { supabase, isSupabaseConfigured } from '../../services/supabase/supabaseClient';
import { dbService } from '../../services/supabase/dbService';
import PillButton from '../../components/ui/PillButton';

export default function Settings() {
  const { state, dispatch, addToast } = useStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const provider = state.provider || {};
  const reminders = state.reminderSettings || {};
  const gcal = state.googleCalendar || { isConnected: false, email: null };

  const [name, setName] = useState(provider.name || '');
  const [businessName, setBusinessName] = useState(provider.businessName || '');
  const [bio, setBio] = useState(provider.bio || '');
  const [email, setEmail] = useState(provider.email || '');
  const [phone, setPhone] = useState(provider.phone || '');
  const [avatar, setAvatar] = useState(provider.avatar || provider.avatarUrl || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);
  const [bioError, setBioError] = useState('');
  const [isConnectingGcal, setIsConnectingGcal] = useState(false);

  // Sync state if provider is hydrated from Supabase
  useEffect(() => {
    if (state.provider) {
      if (state.provider.name && !name) setName(state.provider.name);
      if (state.provider.businessName && !businessName) setBusinessName(state.provider.businessName);
      if (state.provider.bio && !bio) setBio(state.provider.bio);
      if (state.provider.email && !email) setEmail(state.provider.email);
      if (state.provider.phone && !phone) setPhone(state.provider.phone);
      if ((state.provider.avatar || state.provider.avatarUrl) && !avatar) {
        setAvatar(state.provider.avatar || state.provider.avatarUrl);
      }
    }
  }, [state.provider]);

  // Handle return redirect from Google OAuth callback
  useEffect(() => {
    const success = searchParams.get('gcal_success');
    const gcalEmail = searchParams.get('email');
    const gcalError = searchParams.get('gcal_error');

    if (success === 'true') {
      dispatch({
        type: ACTIONS.CONNECT_GOOGLE_CALENDAR,
        payload: { email: gcalEmail || 'Connected Google User' },
      });
      addToast(`Connected to Google Calendar as ${gcalEmail || 'your account'} ✓`);
      navigate('/dashboard/settings', { replace: true });
    } else if (gcalError) {
      if (gcalError === 'access_denied') {
        addToast('Google Calendar authorization was cancelled.', 'warning');
      } else {
        addToast(`Google connection failed: ${decodeURIComponent(gcalError)}`, 'error');
      }
      navigate('/dashboard/settings', { replace: true });
    }
  }, [searchParams, dispatch, addToast, navigate]);

  // Synchronize calendar connection state with backend on mount
  useEffect(() => {
    const checkServerStatus = async () => {
      const providerId = provider?.id || 'provider-1';
      const status = await realGoogleCalendarService.getStatus(providerId);
      if (status.isConnected && (!gcal.isConnected || gcal.email !== status.email)) {
        dispatch({
          type: ACTIONS.CONNECT_GOOGLE_CALENDAR,
          payload: { email: status.email },
        });
      }
    };
    checkServerStatus();
  }, [provider?.id, dispatch, gcal.isConnected, gcal.email]);

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

  const handleAvatarFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      addToast('Profile image must be under 5MB.', 'error');
      return;
    }

    setUploadingAvatar(true);
    try {
      const url = await dbService.uploadAvatar(provider.id, file);
      if (url) {
        setAvatar(url);
        dispatch({
          type: ACTIONS.UPDATE_PROVIDER,
          payload: { avatar: url, avatarUrl: url },
        });

        if (isSupabaseConfigured() && provider.id) {
          await dbService.updateProviderProfile(provider.id, { avatarUrl: url });
        }
        addToast('Profile photo updated ✓');
      }
    } catch (err) {
      console.error('Failed to upload avatar:', err);
      addToast(err.message || 'Failed to upload image.', 'error');
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatar(null);
    dispatch({
      type: ACTIONS.UPDATE_PROVIDER,
      payload: { avatar: null, avatarUrl: null },
    });
    if (isSupabaseConfigured() && provider.id) {
      await dbService.updateProviderProfile(provider.id, { avatarUrl: null });
    }
    addToast('Profile photo removed.');
  };

  const handleSaveProfile = async () => {
    if (bio.trim().length > 0 && bio.trim().length < 20) {
      setBioError('Bio should be at least 20 characters to build trust with clients.');
      return;
    }
    setBioError('');

    if (isSupabaseConfigured()) {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const existingProv = await dbService.getProviderByUserId(authUser.id);
          let savedProv = null;

          if (existingProv?.id) {
            await dbService.updateProviderProfile(existingProv.id, {
              name,
              businessName,
              bio,
              email: email || authUser.email,
              phone,
            });
            savedProv = {
              ...existingProv,
              name,
              businessName,
              bio,
              email: email || authUser.email,
              phone,
            };
          } else {
            const baseSlug = generateSlug(businessName || name || 'provider');
            const slug = `${baseSlug}-${authUser.id.slice(0, 5)}`;
            savedProv = await dbService.createProviderProfile({
              userId: authUser.id,
              name: name || authUser.user_metadata?.name || 'Provider',
              businessName,
              slug,
              email: email || authUser.email,
              phone,
              bio,
            });
          }

          if (savedProv) {
            dispatch({ type: ACTIONS.UPDATE_PROVIDER, payload: savedProv });
            addToast('Profile updated ✓');
            return;
          }
        }
      } catch (err) {
        console.error('Failed to save profile in Supabase:', err);
        addToast(err.message || 'Failed to update profile in database', 'error');
        return;
      }
    }

    if (state.auth?.isDemoMode) {
      dispatch({ type: ACTIONS.UPDATE_PROVIDER, payload: { name, businessName, bio, email, phone } });
      addToast('Profile updated ✓ (Demo Mode)');
      return;
    }

    dispatch({ type: ACTIONS.UPDATE_PROVIDER, payload: { name, businessName, bio, email, phone } });
    addToast('Profile updated ✓');
  };

  const toggleReminder = (key) => {
    dispatch({ type: ACTIONS.UPDATE_REMINDERS, payload: { [key]: !reminders[key] } });
  };

  const handleConnectGcal = async () => {
    setIsConnectingGcal(true);
    try {
      // Ensure provider profile exists in Supabase before requesting Google OAuth URL
      let providerId = provider?.id;
      if (isSupabaseConfigured()) {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          let prov = await dbService.getProviderByUserId(authUser.id);
          if (!prov) {
            const pName = name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Provider';
            const baseSlug = generateSlug(businessName || pName);
            const pSlug = `${baseSlug}-${authUser.id.slice(0, 5)}`;
            prov = await dbService.createProviderProfile({
              userId: authUser.id,
              name: pName,
              businessName: businessName || '',
              slug: pSlug,
              email: email || authUser.email,
              phone: phone || '',
              bio: bio || '',
            });
          }
          if (prov?.id) {
            providerId = prov.id;
            dispatch({ type: ACTIONS.UPDATE_PROVIDER, payload: prov });
          }
        }
      }

      await realGoogleCalendarService.connect({ providerId: providerId || 'provider-1' });
    } catch (err) {
      console.error('Google OAuth init error:', err);
      addToast(err.message, 'error');
      setIsConnectingGcal(false);
    }
  };

  const handleDisconnectGcal = async () => {
    const providerId = provider?.id || 'provider-1';
    await realGoogleCalendarService.disconnect(providerId);
    dispatch({ type: ACTIONS.DISCONNECT_GOOGLE_CALENDAR });
    addToast('Google Calendar disconnected');
  };

  return (
    <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
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
              flexShrink: 0,
            }}
          >
            {avatar ? (
              <img src={avatar} alt={name || 'Coach'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              getInitials(name)
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input
                type="file"
                ref={avatarInputRef}
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={handleAvatarFileSelect}
              />
              <PillButton
                variant="primary"
                size="sm"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? 'Uploading...' : (avatar ? 'Change Photo' : 'Upload Photo')}
              </PillButton>
              {avatar && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={handleRemoveAvatar}
                  style={{ fontSize: '12px', color: '#EF4444' }}
                >
                  Remove
                </button>
              )}
            </div>
            <span style={{ fontSize: '11.5px', color: 'var(--theme-text-muted)' }}>
              JPG, PNG, or WebP up to 5MB.
            </span>
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
            <div style={{ marginTop: '8px' }}>
              <PillButton variant="primary" size="sm" onClick={handleSaveProfile}>
                Save Profile
              </PillButton>
            </div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--theme-badge-bg)',
                  color: 'var(--theme-badge-text)',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                <span style={{ fontSize: '14px', fontWeight: 800 }}>✓</span>
                Connected as {gcal.email}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleDisconnectGcal}
                style={{ borderRadius: 'var(--radius-pill)' }}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <PillButton
              variant="primary"
              size="sm"
              arrow
              onClick={handleConnectGcal}
              disabled={isConnectingGcal}
            >
              {isConnectingGcal ? 'Connecting...' : 'Connect Google Calendar'}
            </PillButton>
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
