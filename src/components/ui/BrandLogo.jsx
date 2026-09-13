import { Link } from 'react-router-dom';

export default function BrandLogo({ size = 'md', light = false, iconOnly = false, to = '/' }) {
  const iconSize = size === 'sm' ? 28 : size === 'lg' ? 42 : 34;
  const fontSize = size === 'sm' ? '1.1rem' : size === 'lg' ? '1.65rem' : '1.35rem';
  const glyphSize = size === 'sm' ? 14 : size === 'lg' ? 22 : 18;

  const content = (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        textDecoration: 'none',
        userSelect: 'none',
      }}
    >
      {/* Rounded black square icon with white sun/asterisk glyph */}
      <div
        style={{
          width: `${iconSize}px`,
          height: `${iconSize}px`,
          backgroundColor: '#0E0E0E',
          borderRadius: size === 'sm' ? '8px' : size === 'lg' ? '14px' : '11px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        <svg
          width={glyphSize}
          height={glyphSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Sun / Asterisk glyph */}
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
          <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
          <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
          <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
        </svg>
      </div>

      {/* Wordmark: bookup. */}
      {!iconOnly && (
        <span
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize,
            fontWeight: 800,
            letterSpacing: '-0.04em',
            color: light ? '#FFFFFF' : 'var(--color-black)',
            lineHeight: 1,
          }}
        >
          bookup<span style={{ color: 'var(--color-lime)' }}>.</span>
        </span>
      )}
    </div>
  );

  if (to) {
    return <Link to={to} style={{ textDecoration: 'none' }}>{content}</Link>;
  }

  return content;
}
