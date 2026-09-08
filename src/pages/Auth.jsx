/**
 * BookUp — Login / Signup Pages
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStore, ACTIONS, generateId } from '../data/store';

function AuthLayout({ children, title, subtitle }) {
  const navigate = useNavigate();
  const { dispatch } = useStore();

  const handleDemo = () => {
    dispatch({ type: ACTIONS.ENTER_DEMO });
    navigate('/dashboard');
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <Link to="/" className="auth-logo">
            <span className="logo-icon">B</span>
            <span className="logo-text">BookUp</span>
          </Link>
        </div>
        <div className="auth-card card card-padding">
          <h2 className="auth-title">{title}</h2>
          <p className="auth-subtitle">{subtitle}</p>
          {children}
        </div>
        <div className="auth-demo">
          <button className="btn btn-ghost btn-sm" onClick={handleDemo}>
            ⚡ Try Demo Mode instead
          </button>
        </div>
      </div>
      <style>{`
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-bg-subtle);
          padding: var(--space-6);
        }
        .auth-container {
          width: 100%;
          max-width: 400px;
        }
        .auth-header {
          text-align: center;
          margin-bottom: var(--space-8);
        }
        .auth-logo {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          text-decoration: none;
          color: var(--color-text);
        }
        .auth-card {
          animation: fadeInUp var(--transition-smooth) ease;
        }
        .auth-title {
          font-size: var(--font-size-xl);
          margin-bottom: var(--space-1);
        }
        .auth-subtitle {
          font-size: var(--font-size-sm);
          color: var(--color-text-secondary);
          margin-bottom: var(--space-6);
        }
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .auth-divider {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          margin: var(--space-4) 0;
        }
        .auth-divider::before,
        .auth-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--color-border);
        }
        .auth-divider span {
          font-size: var(--font-size-xs);
          color: var(--color-text-tertiary);
        }
        .auth-footer {
          text-align: center;
          margin-top: var(--space-5);
          font-size: var(--font-size-sm);
          color: var(--color-text-secondary);
        }
        .auth-footer a {
          color: var(--color-primary-600);
          font-weight: var(--font-weight-medium);
        }
        .auth-demo {
          text-align: center;
          margin-top: var(--space-4);
        }
      `}</style>
    </div>
  );
}

export function Login() {
  const navigate = useNavigate();
  const { dispatch } = useStore();
  const [form, setForm] = useState({ emailOrPhone: '', password: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    // Simulated login
    dispatch({
      type: ACTIONS.ENTER_DEMO,
    });
    navigate('/dashboard');
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to your BookUp account">
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Email or phone number</label>
          <input
            className="form-input"
            type="text"
            placeholder="you@example.com or +91 98765 43210"
            value={form.emailOrPhone}
            onChange={e => setForm({ ...form, emailOrPhone: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            className="form-input"
            type="password"
            placeholder="Enter your password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit">
          Log in
        </button>
      </form>
      <div className="auth-footer">
        Don't have an account? <Link to="/signup">Sign up</Link>
      </div>
    </AuthLayout>
  );
}

export function Signup() {
  const navigate = useNavigate();
  const { dispatch } = useStore();
  const [form, setForm] = useState({ name: '', emailOrPhone: '', password: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    const user = {
      id: generateId('provider'),
      name: form.name,
      email: form.emailOrPhone.includes('@') ? form.emailOrPhone : '',
      phone: !form.emailOrPhone.includes('@') ? form.emailOrPhone : '',
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: ACTIONS.SIGNUP, payload: user });
    navigate('/onboarding');
  };

  return (
    <AuthLayout title="Create your account" subtitle="Start getting booked in under 5 minutes">
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Your name</label>
          <input
            className="form-input"
            type="text"
            placeholder="Priya Sharma"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Email or phone number</label>
          <input
            className="form-input"
            type="text"
            placeholder="you@example.com or +91 98765 43210"
            value={form.emailOrPhone}
            onChange={e => setForm({ ...form, emailOrPhone: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            className="form-input"
            type="password"
            placeholder="Create a password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            required
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit">
          Create Account
        </button>
      </form>
      <div className="auth-footer">
        Already have an account? <Link to="/login">Log in</Link>
      </div>
    </AuthLayout>
  );
}
