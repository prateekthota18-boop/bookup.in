/**
 * BookUp — Policies & Deposits Page
 */

import { useStore, formatCurrency } from '../../data/store';
import { ACTIONS } from '../../data/actions';
import { isSupabaseConfigured } from '../../services/supabase/supabaseClient';
import { dbService } from '../../services/supabase/dbService';

export default function Policies() {
  const { state, dispatch, addToast } = useStore();
  const policies = state.policies || {
    cancellationWindow: 12,
    depositAmount: 200,
    depositType: 'fixed',
    lateCancellationFee: 200,
    noShowFee: 200,
  };

  const updatePolicy = (field, value) => {
    dispatch({ type: ACTIONS.UPDATE_POLICIES, payload: { [field]: value } });
  };

  const handleSave = async () => {
    const policyText = `Cancel more than ${policies.cancellationWindow} hours before your appointment: full deposit refund. Late cancellation or no-show: deposit forfeited (${formatCurrency(policies.depositAmount)}).`;
    
    if (!state.auth?.isDemoMode && isSupabaseConfigured() && state.provider?.id) {
      try {
        await dbService.savePolicy(state.provider.id, {
          cancellationWindow: policies.cancellationWindow,
          depositAmount: policies.depositAmount,
          policyText,
        });
      } catch (err) {
        console.error('Failed to save policy in Supabase:', err);
      }
    }

    dispatch({ type: ACTIONS.UPDATE_POLICIES, payload: { policyText } });
    addToast('Policies updated ✓');
  };

  return (
    <div className="animate-fade-in-up">
      <div className="section-header">
        <div>
          <h1 className="page-title">Policies & Deposits</h1>
          <p className="page-subtitle">Protect your revenue with deposits and cancellation policies.</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
      </div>

      {/* Feature Preview Notice Banner */}
      <div
        style={{
          background: 'var(--color-lime-soft)',
          color: '#2B3505',
          border: '1px solid var(--color-lime)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: 'var(--space-6)',
          fontWeight: 500,
          fontSize: '14px',
        }}
      >
        <span style={{ fontSize: '20px' }}>💳</span>
        <div>
          <strong>Payment collection coming soon</strong> — Online deposit collection via Razorpay will be enabled in an upcoming release. Configure your policy rules below in advance.
        </div>
      </div>

      <div className="policies-grid">
        {/* Settings */}
        <div className="card card-padding">
          <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-5)' }}>Deposit Settings</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label">Default deposit amount (₹)</label>
              <input
                type="number"
                className="form-input"
                min="0"
                value={policies.depositAmount}
                onChange={e => updatePolicy('depositAmount', Number(e.target.value))}
              />
              <span className="form-hint">Collected via UPI when a client confirms booking (simulated)</span>
            </div>
            <div className="form-group">
              <label className="form-label">Cancellation window</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <input
                  type="number"
                  className="form-input"
                  style={{ width: 120 }}
                  min="0"
                  value={policies.cancellationWindow}
                  onChange={e => updatePolicy('cancellationWindow', Number(e.target.value))}
                />
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>hours before appointment</span>
              </div>
              <span className="form-hint">Cancellations before this window get a full refund</span>
            </div>
            <div className="form-group">
              <label className="form-label">Late cancellation fee (₹)</label>
              <input
                type="number"
                className="form-input"
                min="0"
                value={policies.lateCancellationFee}
                onChange={e => updatePolicy('lateCancellationFee', Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">No-show fee (₹)</label>
              <input
                type="number"
                className="form-input"
                min="0"
                value={policies.noShowFee}
                onChange={e => updatePolicy('noShowFee', Number(e.target.value))}
              />
              <span className="form-hint">Deposit is forfeited by default for no-shows</span>
            </div>
          </div>
        </div>

        {/* Policy Preview */}
        <div>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 'var(--space-4)' }}>
            <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)', fontSize: 'var(--font-size-md)', fontWeight: 600 }}>
              Policy Preview
            </div>
            <div style={{ padding: 'var(--space-5)' }}>
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
                padding: 'var(--space-3) var(--space-4)', background: 'var(--color-success-50)',
                borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-3)',
                fontSize: 'var(--font-size-sm)', color: 'var(--color-success-700)',
              }}>
                <span>✅</span>
                <span>Cancel more than <strong>{policies.cancellationWindow} hours</strong> before your appointment: <strong>full deposit refund</strong></span>
              </div>
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
                padding: 'var(--space-3) var(--space-4)', background: 'var(--color-error-50)',
                borderRadius: 'var(--radius-lg)',
                fontSize: 'var(--font-size-sm)', color: 'var(--color-error-700)',
              }}>
                <span>⚠️</span>
                <span>Late cancellation or no-show: <strong>deposit forfeited ({formatCurrency(policies.depositAmount)})</strong></span>
              </div>
            </div>
          </div>

          {/* How it works */}
          <div className="card card-padding">
            <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>How it works</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <span style={{ fontWeight: 600, color: 'var(--color-primary-600)' }}>1.</span>
                <span>Client books and pays {formatCurrency(policies.depositAmount)} deposit via UPI</span>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <span style={{ fontWeight: 600, color: 'var(--color-primary-600)' }}>2.</span>
                <span>If they show up, the deposit is adjusted against the full payment</span>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <span style={{ fontWeight: 600, color: 'var(--color-primary-600)' }}>3.</span>
                <span>If they cancel on time, deposit is fully refunded</span>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <span style={{ fontWeight: 600, color: 'var(--color-primary-600)' }}>4.</span>
                <span>Late cancellation or no-show? Deposit is forfeited — your time is protected</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
