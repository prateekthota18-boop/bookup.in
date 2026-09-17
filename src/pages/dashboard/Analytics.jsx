/**
 * CalUp — Analytics Page
 */

import { useEffect, useRef } from 'react';
import { useStore, formatCurrency, calculateMetrics } from '../../data/store';
import { Chart, registerables } from 'chart.js';
import StatCard from '../../components/ui/StatCard';

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
            backgroundColor: '#0E0E0E',
            borderRadius: 8,
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
              grid: { color: 'rgba(0,0,0,0.04)' },
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
            borderColor: '#C6F135',
            backgroundColor: 'rgba(198, 241, 53, 0.25)',
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: '#C6F135',
            pointBorderColor: '#0E0E0E',
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
              grid: { color: 'rgba(0,0,0,0.04)' },
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
  const confirmedCount = state.bookings.filter(b => b.status === 'confirmed').length;
  const completedCount = state.bookings.filter(b => b.status === 'completed').length;

  const STATS = [
    { label: 'Total Appointments', value: totalBookings, icon: '📅', subtitle: 'All active bookings' },
    { label: 'Total Revenue', value: formatCurrency(metrics.totalRevenue), icon: '💰', subtitle: 'Completed & confirmed value', arrowUp: true },
    { label: 'Confirmed Slots', value: confirmedCount, icon: '✨', subtitle: 'Upcoming scheduled' },
    { label: 'Completed Sessions', value: completedCount, icon: '✅', subtitle: 'Fulfilled appointments' },
    { label: 'Cancellation Rate', value: `${cancellationRate}%`, icon: '❌', subtitle: `${cancellations} cancelled` },
    { label: 'No-Show Rate', value: `${metrics.noShowRate}%`, icon: '🚫', subtitle: 'Client missed slots' },
  ];

  return (
    <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Metric StatCards Grid */}
      <div>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '15px', fontWeight: 700, margin: '0 0 14px', color: 'var(--color-text)' }}>
          Performance Metrics
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          {STATS.map((stat, i) => (
            <StatCard
              key={i}
              label={stat.label}
              value={stat.value}
              icon={stat.icon}
              subtitle={stat.subtitle}
              arrowUp={stat.arrowUp}
            />
          ))}
        </div>
      </div>

      {/* Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        <div
          className="card"
          style={{
            borderRadius: 'var(--radius-card)',
            background: 'var(--theme-bg-card)',
            border: '1px solid var(--theme-border)',
            boxShadow: 'var(--shadow-card)',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
              Appointments Trend
            </h4>
            <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>Monthly volume</span>
          </div>
          <div style={{ height: 260 }}>
            <canvas ref={chartRef1} />
          </div>
        </div>

        <div
          className="card"
          style={{
            borderRadius: 'var(--radius-card)',
            background: 'var(--theme-bg-card)',
            border: '1px solid var(--theme-border)',
            boxShadow: 'var(--shadow-card)',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
              Revenue Trend
            </h4>
            <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>Gross booking value</span>
          </div>
          <div style={{ height: 260 }}>
            <canvas ref={chartRef2} />
          </div>
        </div>
      </div>
    </div>
  );
}

