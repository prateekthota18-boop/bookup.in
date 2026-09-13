export default function PillButton({
  children,
  variant = 'primary',
  size = 'md',
  arrow = false,
  step,
  totalSteps = 3,
  loading = false,
  disabled = false,
  onClick,
  type = 'button',
  className = '',
  style = {},
  ...props
}) {
  const variantClass =
    variant === 'lime'
      ? 'btn-lime'
      : variant === 'secondary'
      ? 'btn-secondary'
      : variant === 'ghost'
      ? 'btn-ghost'
      : variant === 'danger'
      ? 'btn-danger'
      : 'btn-primary';

  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`btn ${variantClass} ${sizeClass} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        borderRadius: 'var(--radius-pill)',
        ...style,
      }}
      {...props}
    >
      {/* 3-Dot Progress Indicator if step is provided */}
      {step && (
        <span className="progress-dots" style={{ marginRight: '4px' }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={`progress-dot ${i + 1 === step ? 'active' : ''}`}
              style={{
                background:
                  variant === 'lime' || variant === 'secondary' || variant === 'ghost'
                    ? i + 1 === step
                      ? 'var(--color-black)'
                      : 'rgba(14, 14, 14, 0.25)'
                    : i + 1 === step
                    ? '#FFFFFF'
                    : 'rgba(255, 255, 255, 0.35)',
              }}
            />
          ))}
        </span>
      )}

      {loading ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
          Loading...
        </span>
      ) : (
        <span>{children}</span>
      )}

      {arrow && !loading && (
        <span style={{ fontSize: '1.1em', lineHeight: 1, transition: 'transform 0.15s ease' }}>
          →
        </span>
      )}
    </button>
  );
}
