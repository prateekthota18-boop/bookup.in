/**
 * BookUp — Booking Page Management
 */

import { useStore, formatCurrency } from '../../data/store';
import { getInitials } from '../../utils/helpers';

export default function BookingPageManagement() {
  const { state, addToast } = useStore();
  const provider = state.provider;
  const slug = provider?.slug || 'my-page';
  const bookingUrl = `bookup.in/book/${slug}`;
  const localUrl = `/book/${slug}`;

  const copyLink = () => {
    navigator.clipboard?.writeText(bookingUrl).catch(() => {});
    addToast('Booking link copied! 📋');
  };

  const shareWhatsApp = () => {
    const pitch = `Hi! You can now book time with me directly without any back-and-forth. Pick a service and your preferred time slot here: ${bookingUrl}`;
    const text = encodeURIComponent(pitch);
    window.open(`https://wa.me/?text=${text}`, '_blank');
    addToast('Opening WhatsApp with pre-filled booking link! 📲');
  };

  const activeServices = state.services.filter(s => s.isActive);

  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <h1 className="page-title">Booking Page</h1>
        <p className="page-subtitle">Your public booking link — share it anywhere.</p>
      </div>

      {/* Link Section */}
      <div className="card card-padding" style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
              Your booking link
            </div>
            <div style={{
              fontFamily: 'var(--font-family-mono)',
              fontSize: 'var(--font-size-md)',
              color: 'var(--color-primary-600)',
              fontWeight: 500,
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-primary-50)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-primary-200)',
            }}>
              {bookingUrl}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={copyLink}>📋 Copy Link</button>
          <a className="btn btn-secondary btn-sm" href={localUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>🔗 Open Page</a>
          <button className="btn btn-whatsapp btn-sm" onClick={shareWhatsApp}>💬 Share to WhatsApp</button>
          <button className="btn btn-secondary btn-sm" onClick={() => addToast('Share link copied for Instagram bio! 📸')}>📸 Share to Instagram</button>
        </div>
      </div>

      {/* Live Preview */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: 'var(--space-4) var(--space-6)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>Live Preview</h4>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>What your clients see</span>
        </div>
        <div style={{ padding: 'var(--space-8)', background: 'var(--color-gray-50)', display: 'flex', justifyContent: 'center' }}>
          <div style={{
            width: '100%',
            maxWidth: 400,
            background: 'white',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--color-border)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-lg)',
          }}>
            {/* Provider Header */}
            <div style={{ padding: 'var(--space-6)', borderBottom: '1px solid var(--color-border)', textAlign: 'center' }}>
              <div className="avatar avatar-xl" style={{ margin: '0 auto var(--space-3)' }}>
                {getInitials(provider?.name || 'U')}
              </div>
              <div style={{ fontWeight: 600, fontSize: 'var(--font-size-lg)' }}>{provider?.name || 'Your Name'}</div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{provider?.businessName || 'Your Business'}</div>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-2)', lineHeight: 1.5 }}>
                {provider?.bio && provider.bio.trim().length >= 20
                  ? (provider.bio.substring(0, 120) + (provider.bio.length > 120 ? '...' : ''))
                  : `Book a 1-on-1 session with ${provider?.name || 'your specialist'}.`}
              </p>
            </div>
            {/* Services */}
            <div style={{ padding: 'var(--space-4)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500, marginBottom: 'var(--space-3)', padding: '0 var(--space-2)' }}>
                Select a service
              </div>
              {activeServices.length > 0 ? activeServices.map(s => (
                <div
                  key={s.id}
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    marginBottom: 'var(--space-2)',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                >
                  <div style={{ fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>{s.name}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {s.duration} min · {formatCurrency(s.price)}
                  </div>
                  {s.depositAmount > 0 && (
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary-600)', marginTop: 2 }}>
                      {formatCurrency(s.depositAmount)} deposit to confirm
                    </div>
                  )}
                </div>
              )) : (
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)', padding: 'var(--space-6)', textAlign: 'center' }}>
                  No active services
                </div>
              )}
            </div>
            <div style={{ padding: 'var(--space-3)', textAlign: 'center', borderTop: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Powered by BookUp</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
