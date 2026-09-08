/**
 * BookUp — Dashboard Overview
 */

import { useStore, formatCurrency, calculateMetrics } from '../../data/store';
import { getGreeting } from '../../utils/helpers';

export default function Overview() {
  const { state } = useStore();
  const provider = state.provider;
  const metrics = calculateMetrics(state.bookings);

  const CARDS = [
    { label: 'Upcoming appointments', value: metrics.upcomingCount, icon: '📅' },
    { label: 'This month', value: metrics.thisMonthCount, icon: '📊' },
    { label: 'Revenue', value: formatCurrency(metrics.totalRevenue), icon: '💰' },
    { label: 'No-show rate', value: `${metrics.noShowRate}%`, icon: '🚫' },
    { label: 'Deposits collected', value: formatCurrency(metrics.depositsCollected), icon: '🏦' },
    { label: 'Revenue protected', value: formatCurrency(metrics.revenueProtected), icon: '🛡️' },
  ];

  // Get next few upcoming appointments
  const today = new Date().toISOString().split('T')[0];
  const upcoming = state.bookings
    .filter(b => b.date >= today && b.status === 'confirmed')
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .slice(0, 5);

  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <h1 className="page-title">{getGreeting()}, {provider?.name?.split(' ')[0] || 'there'}.</h1>
        <p className="page-subtitle">Here's what's happening with your schedule.</p>
      </div>

      <div className="metrics-grid" style={{ marginBottom: 'var(--space-8)' }}>
        {CARDS.map((card, i) => (
          <div className="metric-card" key={i}>
            <div className="metric-card-label">
              <span style={{ marginRight: 6 }}>{card.icon}</span>
              {card.label}
            </div>
            <div className="metric-card-value">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Upcoming Appointments */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>Upcoming appointments</h4>
          <a href="/dashboard/appointments" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary-600)', textDecoration: 'none' }}>View all →</a>
        </div>
        {upcoming.length > 0 ? (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Service</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map(b => {
                  const dateLabel = b.date === today ? 'Today' : new Date(b.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                  const timeLabel = (() => {
                    const [h, m] = b.startTime.split(':').map(Number);
                    const p = h >= 12 ? 'PM' : 'AM';
                    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${p}`;
                  })();
                  return (
                    <tr key={b.id}>
                      <td>{b.customerName}</td>
                      <td>{b.serviceName}</td>
                      <td>{dateLabel}</td>
                      <td>{timeLabel}</td>
                      <td>{formatCurrency(b.price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '48px 24px' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>📅</div>
            <div className="empty-state-title">No upcoming appointments</div>
            <div className="empty-state-description">Share your booking link to start getting booked!</div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <a href="/dashboard/booking-page" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>🔗 Copy Booking Link</a>
        <a href="/dashboard/services" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>📋 Manage Services</a>
        <a href="/dashboard/analytics" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>📊 View Analytics</a>
      </div>
    </div>
  );
}
