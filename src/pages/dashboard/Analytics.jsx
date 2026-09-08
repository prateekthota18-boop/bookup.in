/**
 * BookUp — Analytics Page
 */

import { useEffect, useRef } from 'react';
import { useStore, formatCurrency, calculateMetrics } from '../../data/store';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export default function Analytics() {
  const { state } = useStore();
  const metrics = calculateMetrics(state.bookings);
  const analyticsData = state.analytics;
  const chartRef1 = useRef(null);
  const chartRef2 = useRef(null);
  const chart1Instance = useRef(null);
  const chart2Instance = useRef(null);

  useEffect(() => {
    if (!analyticsData?.monthlyData) return;

    const labels = analyticsData.monthlyData.map(d => d.month);

    // Appointments chart
    if (chartRef1.current) {
      if (chart1Instance.current) chart1Instance.current.destroy();
      chart1Instance.current = new Chart(chartRef1.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Appointments',
            data: analyticsData.monthlyData.map(d => d.appointments),
            backgroundColor: 'rgba(99, 102, 241, 0.8)',
            borderRadius: 6,
            borderSkipped: false,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(0,0,0,0.06)' },
              ticks: { font: { size: 12, family: 'Inter' } },
            },
            x: {
              grid: { display: false },
              ticks: { font: { size: 12, family: 'Inter' } },
            },
          },
        },
      });
    }

    // Revenue chart
    if (chartRef2.current) {
      if (chart2Instance.current) chart2Instance.current.destroy();
      chart2Instance.current = new Chart(chartRef2.current, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Revenue (₹)',
            data: analyticsData.monthlyData.map(d => d.revenue),
            borderColor: '#10B981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: '#10B981',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(0,0,0,0.06)' },
              ticks: {
                font: { size: 12, family: 'Inter' },
                callback: (v) => `₹${(v / 1000).toFixed(0)}k`,
              },
            },
            x: {
              grid: { display: false },
              ticks: { font: { size: 12, family: 'Inter' } },
            },
          },
        },
      });
    }

    return () => {
      if (chart1Instance.current) chart1Instance.current.destroy();
      if (chart2Instance.current) chart2Instance.current.destroy();
    };
  }, [analyticsData]);

  const totalBookings = state.bookings.filter(b => b.status !== 'cancelled').length;
  const cancellations = state.bookings.filter(b => b.status === 'cancelled' || b.status === 'late-cancellation').length;
  const cancellationRate = totalBookings > 0 ? ((cancellations / (totalBookings + cancellations)) * 100).toFixed(1) : '0.0';

  const CARDS = [
    { label: 'Total appointments', value: totalBookings, icon: '📅' },
    { label: 'Revenue', value: formatCurrency(metrics.totalRevenue), icon: '💰' },
    { label: 'Cancellation rate', value: `${cancellationRate}%`, icon: '❌' },
    { label: 'No-show rate', value: `${metrics.noShowRate}%`, icon: '🚫' },
    { label: 'Deposits collected', value: formatCurrency(metrics.depositsCollected), icon: '🏦' },
    { label: 'Revenue protected', value: formatCurrency(metrics.revenueProtected), icon: '🛡️' },
  ];

  return (
    <div className="animate-fade-in-up">
      <div className="page-header">
        <h1 className="page-title">Analytics</h1>
        <p className="page-subtitle">Track your business performance.</p>
      </div>

      {/* Metric Cards */}
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

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
        <div className="card card-padding">
          <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>Appointments Trend</h4>
          <div style={{ height: 280 }}>
            <canvas ref={chartRef1} />
          </div>
        </div>
        <div className="card card-padding">
          <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>Revenue Trend</h4>
          <div style={{ height: 280 }}>
            <canvas ref={chartRef2} />
          </div>
        </div>
      </div>
    </div>
  );
}
