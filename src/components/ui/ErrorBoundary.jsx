import React from 'react';
import PillButton from './PillButton';
import BrandLogo from './BrandLogo';

/**
 * CalUp Application & Route Error Boundary
 * Catches uncaught runtime errors in child components and displays a clean,
 * customer-friendly recovery interface instead of a silent blank screen.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an uncaught error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback(this.state.error, this.handleReset);
        }
        return this.props.fallback;
      }

      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            background: 'var(--theme-bg, #FAFAFA)',
            color: 'var(--theme-text, #0E0E0E)',
            fontFamily: 'var(--font-sans, system-ui, sans-serif)',
          }}
        >
          <div
            style={{
              maxWidth: '440px',
              width: '100%',
              background: 'var(--theme-card-bg, #FFFFFF)',
              borderRadius: '24px',
              padding: '36px 28px',
              textAlign: 'center',
              boxShadow: 'var(--shadow-lg, 0 10px 25px -5px rgba(0, 0, 0, 0.05))',
              border: '1px solid var(--theme-border, #E5E7EB)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
              <BrandLogo />
            </div>

            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#FEE2E2',
                color: '#EF4444',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                marginBottom: '16px',
              }}
            >
              ⚠️
            </div>

            <h2
              style={{
                fontSize: '20px',
                fontWeight: 700,
                margin: '0 0 10px 0',
                color: 'var(--theme-text, #0E0E0E)',
              }}
            >
              {this.props.title || 'Something went wrong, please refresh'}
            </h2>

            <p
              style={{
                fontSize: '14px',
                color: 'var(--theme-text-muted, #64748B)',
                lineHeight: 1.5,
                margin: '0 0 24px 0',
              }}
            >
              {this.props.message ||
                'We encountered an unexpected issue while displaying your page. Please refresh to try again, or return to CalUp.'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <PillButton
                variant="primary"
                onClick={this.handleReload}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                ↻ Refresh Page
              </PillButton>

              <PillButton
                variant="ghost"
                onClick={() => {
                  window.location.href = '/';
                }}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Return to CalUp
              </PillButton>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
