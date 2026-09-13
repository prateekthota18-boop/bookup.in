/**
 * BookUp — Booking Page Management
 */

import { useState } from 'react';
import { useStore, formatCurrency } from '../../data/store';
import { getInitials } from '../../utils/helpers';
import PillButton from '../../components/ui/PillButton';
import BrandLogo from '../../components/ui/BrandLogo';

export default function BookingPageManagement() {
  const { state, addToast } = useStore();
  const provider = state.provider;
  const slug = provider?.slug || 'my-page';
  const bookingUrl = `bookup.in/book/${slug}`;
  const localUrl = `/book/${slug}`;

  const [selectedPreviewService, setSelectedPreviewService] = useState(() => {
    const active = (state.services || []).filter(s => s.isActive);
    return active.length > 0 ? active[0].id : null;
  });

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

  const activeServices = (state.services || []).filter(s => s.isActive);

  return (
    <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Link Section Card */}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              Your Booking Link
            </span>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              marginTop: '8px',
              padding: '12px 18px',
              background: 'var(--theme-bg-card-subtle)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--theme-border)',
              flexWrap: 'wrap',
            }}>
              <span style={{
                fontFamily: 'var(--font-family-mono)',
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--color-text)',
              }}>
                {bookingUrl}
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <PillButton variant="primary" size="sm" onClick={copyLink}>
                  📋 Copy Link
                </PillButton>
                <a
                  href={localUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  <PillButton variant="secondary" size="sm">
                    ↗ Open Page
                  </PillButton>
                </a>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '6px' }}>
            <button
              type="button"
              onClick={shareWhatsApp}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-pill)',
                background: '#25D366',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'transform var(--transition-fast)',
              }}
            >
              <span>💬</span> Share to WhatsApp
            </button>
            <button
              type="button"
              onClick={() => {
                copyLink();
                addToast('Booking link copied! Paste it in your Instagram bio 📸');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--theme-input-bg)',
                color: 'var(--color-text)',
                border: '1px solid var(--theme-border)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <span>📸</span> Instagram Bio Link
            </button>
          </div>
        </div>
      </div>

      {/* Live Preview Card */}
      <div
        className="card"
        style={{
          borderRadius: 'var(--radius-card)',
          background: 'var(--theme-bg-card)',
          border: '1px solid var(--theme-border)',
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--theme-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
              Live Client Preview
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
              Interactive view of your customer-facing booking experience
            </span>
          </div>
          <span style={{
            padding: '4px 12px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--theme-badge-bg)',
            color: 'var(--theme-badge-text)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.02em',
          }}>
            LIVE PREVIEW
          </span>
        </div>

        <div style={{
          padding: '36px 16px',
          background: 'var(--theme-canvas-bg)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          {/* Mobile phone card frame matching BookingPage.jsx */}
          <div
            style={{
              width: '100%',
              maxWidth: '390px',
              background: 'var(--theme-bg-card)',
              borderRadius: '28px',
              border: '1px solid var(--theme-border)',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.08)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Customer Booking Header */}
            <div style={{
              padding: '18px 20px',
              borderBottom: '1px solid var(--theme-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  background: 'var(--theme-input-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '13px',
                  overflow: 'hidden',
                  flexShrink: 0,
                  border: '1.5px solid var(--color-lime)',
                }}>
                  {provider?.avatar || provider?.avatarUrl ? (
                    <img src={provider.avatar || provider.avatarUrl} alt={provider?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    getInitials(provider?.name || 'U')
                  )}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.2 }}>
                    {provider?.name || 'Your Name'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                    {provider?.businessName || 'Your Studio / Business'}
                  </div>
                </div>
              </div>

              <BrandLogo size="sm" />
            </div>

            {/* Provider Bio / Headline */}
            <div style={{ padding: '20px 20px 14px' }}>
              <div style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '20px',
                fontWeight: 800,
                color: 'var(--color-text)',
                letterSpacing: '-0.02em',
                marginBottom: '6px',
              }}>
                Book a session.
              </div>
              <p style={{
                fontSize: '12px',
                color: 'var(--theme-text-muted)',
                lineHeight: 1.4,
                margin: 0,
              }}>
                {provider?.bio && provider.bio.trim().length >= 20
                  ? (provider.bio.substring(0, 110) + (provider.bio.length > 110 ? '...' : ''))
                  : `Select a service below to view real-time open slots and confirm.`}
              </p>
            </div>

            {/* Service Selection list matching BookingPage.jsx */}
            <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--theme-text-muted)',
                marginBottom: '2px',
              }}>
                Available Services
              </div>

              {activeServices.length > 0 ? (
                activeServices.map(s => {
                  const isSelected = selectedPreviewService === s.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedPreviewService(s.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-lg)',
                        background: isSelected ? 'var(--color-lime)' : 'var(--theme-bg-card-subtle)',
                        color: isSelected ? '#0E0E0E' : 'var(--color-text)',
                        border: isSelected ? '1.5px solid var(--color-lime)' : '1.5px solid transparent',
                        cursor: 'pointer',
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          border: isSelected ? '4px solid #0E0E0E' : '2px solid var(--theme-text-muted)',
                          background: isSelected ? '#FFFFFF' : 'transparent',
                        }} />
                        <div>
                          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '13px', fontWeight: 700 }}>
                            {s.name}
                          </div>
                          <div style={{ fontSize: '11px', opacity: 0.75 }}>
                            {s.duration} mins
                          </div>
                        </div>
                      </div>

                      <div style={{
                        fontFamily: 'var(--font-heading)',
                        fontWeight: 800,
                        fontSize: '13px',
                      }}>
                        {formatCurrency(s.price)}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--theme-text-muted)', textAlign: 'center', padding: '16px' }}>
                  No active services yet.
                </div>
              )}

              {/* Call to action pill inside preview */}
              <div style={{ marginTop: '10px' }}>
                <button
                  type="button"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 'var(--radius-pill)',
                    background: '#0E0E0E',
                    color: '#FFFFFF',
                    border: 'none',
                    fontFamily: 'var(--font-heading)',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  Select Time Slot →
                </button>
              </div>
            </div>

            {/* Card Footer */}
            <div style={{
              padding: '10px 16px',
              borderTop: '1px solid var(--theme-border)',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}>
              <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)', fontWeight: 500 }}>
                powered by <strong>bookup.</strong>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

