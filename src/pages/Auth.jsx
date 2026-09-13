/**
 * BookUp — Login / Signup Pages
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStore, generateId } from '../data/store';
import { ACTIONS } from '../data/actions';

import BrandLogo from '../components/ui/BrandLogo';
import PillButton from '../components/ui/PillButton';

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
        <div className="auth-header" style={{ display: 'flex', justifyContent: 'center', marginBottom: '28px' }}>
          <BrandLogo size="lg" />
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
          background: var(--theme-canvas-bg);
          padding: 24px 16px;
          transition: background var(--transition-base);
          box-sizing: border-box;
        }
        .auth-container {
          width: 100%;
          max-width: 420px;
          margin: 0 auto;
        }
        .auth-header {
          text-align: center;
          margin-bottom: 24px;
        }
        .auth-card {
          background: var(--theme-bg-card);
          border: 1px solid var(--theme-border-card);
          border-radius: 24px;
          padding: 32px 28px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.15);
          animation: fadeInUp var(--transition-smooth) ease;
          box-sizing: border-box;
        }
        .auth-title {
          font-family: var(--font-heading);
          font-size: 1.55rem;
          font-weight: 800;
          color: var(--color-text);
          letter-spacing: -0.02em;
          margin-bottom: 4px;
        }
        .auth-subtitle {
          font-size: 13.5px;
          color: var(--theme-text-muted);
          margin-bottom: 24px;
          line-height: 1.4;
        }
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .auth-footer {
          text-align: center;
          margin-top: 20px;
          font-size: 13px;
          color: var(--theme-text-muted);
        }
        .auth-footer a {
          color: var(--theme-text-primary);
          font-weight: 700;
          text-decoration: underline;
        }
        .auth-demo {
          text-align: center;
          margin-top: 16px;
        }
        .auth-demo button {
          color: var(--theme-text-muted);
          font-size: 13px;
        }
        .auth-demo button:hover {
          color: var(--color-text);
        }
        @media (max-width: 480px) {
          .auth-page {
            padding: 16px 12px;
          }
          .auth-card {
            padding: 24px 18px;
            border-radius: 20px;
          }
          .auth-title {
            font-size: 1.4rem;
          }
        }
      `}</style>
    </div>
  );
}

import { supabase, isSupabaseConfigured } from '../services/supabase/supabaseClient';
import { dbService } from '../services/supabase/dbService';
import { generateSlug } from '../utils/helpers';

export function Login() {
  const navigate = useNavigate();
  const { dispatch, addToast } = useStore();
  const [form, setForm] = useState({ emailOrPhone: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!form.emailOrPhone || !form.password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    if (!isSupabaseConfigured()) {
      // Fallback for offline demo mode
      dispatch({ type: ACTIONS.ENTER_DEMO });
      navigate('/dashboard');
      return;
    }

    setLoading(true);
    try {
      const email = form.emailOrPhone.trim();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: form.password,
      });

      if (error) {
        throw error;
      }

      if (data?.user) {
        // Fetch or auto-resolve provider profile
        let provider = await dbService.getProviderByUserId(data.user.id);
        if (!provider) {
          const provName = data.user.user_metadata?.name || data.user.email?.split('@')[0] || 'Provider';
          const provSlug = `${generateSlug(provName)}-${data.user.id.slice(0, 5)}`;
          try {
            provider = await dbService.createProviderProfile({
              userId: data.user.id,
              name: provName,
              slug: provSlug,
              email: data.user.email,
            });
          } catch (pErr) {
            console.warn('Could not auto-provision provider profile on login:', pErr.message);
          }
        }

        dispatch({
          type: ACTIONS.LOGIN,
          payload: {
            id: data.user.id,
            email: data.user.email,
            name: provider?.name || data.user.user_metadata?.name || 'Provider',
            ...provider,
          },
        });

        if (provider) {
          dispatch({ type: ACTIONS.UPDATE_PROVIDER, payload: provider });
          addToast(`Welcome back, ${provider.name}! 👋`);
          navigate('/dashboard');
        } else {
          // Fallback to onboarding if profile could not be auto-provisioned
          navigate('/onboarding');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      let msg = err.message || 'Invalid email or password.';
      if (err.message?.toLowerCase().includes('invalid login credentials')) {
        msg = 'Invalid email or password. Please check your credentials and try again.';
      } else if (err.message?.toLowerCase().includes('email not confirmed')) {
        msg = 'Please confirm your email address before logging in, or disable email confirmation in Supabase.';
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to your BookUp account">
      <form className="auth-form" onSubmit={handleSubmit}>
        {errorMsg && (
          <div style={{
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--color-error-50, #fef2f2)',
            border: '1px solid var(--color-error-200, #fecaca)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-error-700, #b91c1c)',
            fontSize: 'var(--font-size-sm)',
          }}>
            {errorMsg}
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Email address</label>
          <input
            className="form-input"
            type="email"
            placeholder="you@example.com"
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
            placeholder="Enter your password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            required
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Log in'}
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
  const { dispatch, addToast } = useStore();
  const [form, setForm] = useState({ name: '', emailOrPhone: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!form.name.trim()) {
      setErrorMsg('Please enter your name.');
      return;
    }
    if (!form.emailOrPhone.trim()) {
      setErrorMsg('Please enter your email.');
      return;
    }
    if (!form.password || form.password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    if (!isSupabaseConfigured()) {
      const user = {
        id: generateId('provider'),
        name: form.name.trim(),
        email: form.emailOrPhone.trim(),
        phone: '',
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: ACTIONS.SIGNUP, payload: user });
      navigate('/onboarding');
      return;
    }

    setLoading(true);
    try {
      const email = form.emailOrPhone.trim();
      const { data, error } = await supabase.auth.signUp({
        email,
        password: form.password,
        options: {
          data: {
            name: form.name.trim(),
          },
        },
      });

      if (error) {
        throw error;
      }

      if (data?.user) {
        // Check if user already exists (Supabase returns empty identities array)
        if (data.user.identities && data.user.identities.length === 0) {
          setErrorMsg('An account with this email already exists. Please log in.');
          return;
        }

        const user = {
          id: data.user.id,
          userId: data.user.id,
          name: form.name.trim(),
          email,
          createdAt: data.user.created_at || new Date().toISOString(),
        };
        dispatch({ type: ACTIONS.SIGNUP, payload: user });

        if (data.session) {
          // Immediately provision provider profile in Supabase so user is always linked
          try {
            const provSlug = `${generateSlug(form.name.trim())}-${data.user.id.slice(0, 5)}`;
            const newProv = await dbService.createProviderProfile({
              userId: data.user.id,
              name: form.name.trim(),
              slug: provSlug,
              email,
            });
            if (newProv) {
              dispatch({ type: ACTIONS.UPDATE_PROVIDER, payload: newProv });
            }
          } catch (_pErr) {
            console.warn('Provider profile pre-provision note:', _pErr.message);
          }
          addToast("Account created! Let's set up your booking page. 🚀");
          navigate('/onboarding');
        } else {
          addToast('Account created! Please check your email to confirm your account, then log in.', 'info', 6000);
          navigate('/login');
        }
      }
    } catch (err) {
      console.error('Signup error:', err);
      let msg = err.message || 'Failed to create account.';
      if (err.message?.includes('over_email_send_rate_limit')) {
        msg = 'Email rate limit reached. Please disable "Confirm email" in your Supabase Auth settings to test instant signups.';
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Start getting booked in under 5 minutes">
      <form className="auth-form" onSubmit={handleSubmit}>
        {errorMsg && (
          <div style={{
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--color-error-50, #fef2f2)',
            border: '1px solid var(--color-error-200, #fecaca)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-error-700, #b91c1c)',
            fontSize: 'var(--font-size-sm)',
          }}>
            {errorMsg}
          </div>
        )}
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
          <label className="form-label">Email address</label>
          <input
            className="form-input"
            type="email"
            placeholder="you@example.com"
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
            placeholder="Create a password (min 6 characters)"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            required
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>
      <div className="auth-footer">
        Already have an account? <Link to="/login">Log in</Link>
      </div>
    </AuthLayout>
  );
}

