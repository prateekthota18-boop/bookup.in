import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore, useAuth } from '../data/store';
import { ACTIONS } from '../data/actions';
import { getInitials } from '../utils/helpers';
import { supabase, isSupabaseConfigured } from '../services/supabase/supabaseClient';
import { useTheme } from '../context/ThemeContext';
import BrandLogo from '../components/ui/BrandLogo';
import './DashboardLayout.css';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Overview', icon: 'grid', end: true },
  { path: '/dashboard/appointments', label: 'Appointments', icon: 'calendar' },
  { path: '/dashboard/services', label: 'Services', icon: 'briefcase' },
  { path: '/dashboard/availability', label: 'Availability', icon: 'clock' },
  { path: '/dashboard/booking-page', label: 'Booking Page', icon: 'link' },
  { path: '/dashboard/policies', label: 'Policies & Deposits', icon: 'shield' },
  { path: '/dashboard/analytics', label: 'Analytics', icon: 'bar-chart' },
  { path: '/dashboard/settings', label: 'Settings', icon: 'settings' },
];

const ICONS = {
  grid: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" />
    </svg>
  ),
  calendar: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="4" ry="4" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  briefcase: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="3" ry="3" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  clock: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  link: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  shield: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  'bar-chart': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  sun: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  moon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
  search: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  filter: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  ),
  bell: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  logout: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
};

export default function DashboardLayout() {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const provider = state.provider;

  const [timeStr, setTimeStr] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} · ${now.getFullYear()}`;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTimeStr(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} · ${now.getFullYear()}`);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    if (isSupabaseConfigured()) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.error('Logout error:', e);
      }
    }
    dispatch({ type: ACTIONS.LOGOUT });
    navigate('/login');
  };

  // Find current route title
  const currentNav = NAV_ITEMS.find(item => {
    if (item.end) return location.pathname === item.path;
    return location.pathname.startsWith(item.path);
  });
  const pageTitle = currentNav?.label || 'Dashboard';

  return (
    <div className="janjiyuk-dashboard-canvas">
      {/* Detached Black Rounded Icon Sidebar (Image 1) */}
      <aside className="janjiyuk-sidebar">
        <div className="janjiyuk-sidebar-top">
          <BrandLogo iconOnly size="sm" to="/dashboard" />
        </div>

        <nav className="janjiyuk-sidebar-nav">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) => `janjiyuk-nav-btn ${isActive ? 'active' : ''}`}
              title={item.label}
            >
              <span className="nav-icon-wrap">{ICONS[item.icon]}</span>
            </NavLink>
          ))}
        </nav>

        <div className="janjiyuk-sidebar-bottom">
          {/* Light/Dark Toggle Button */}
          <button
            type="button"
            className="janjiyuk-sidebar-tool-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? ICONS.sun : ICONS.moon}
          </button>

          {/* Logout button */}
          <button
            type="button"
            className="janjiyuk-sidebar-tool-btn"
            onClick={handleLogout}
            title="Log out"
          >
            {ICONS.logout}
          </button>

          {/* Avatar at bottom */}
          <div
            className="janjiyuk-avatar-pill"
            title={`${provider?.name || 'User'} (${provider?.email || ''})`}
            onClick={() => navigate('/dashboard/settings')}
          >
            {getInitials(provider?.name || 'User')}
          </div>
        </div>
      </aside>

      {/* Main Workspace Frame (Large Rounded Container) */}
      <div className="janjiyuk-workspace-frame">
        {/* Top Header Bar */}
        <header className="janjiyuk-topbar">
          <div className="topbar-left-col">
            <h1 className="janjiyuk-page-title">{pageTitle}</h1>
            <p className="janjiyuk-page-sub">
              {provider?.businessName ? `${provider.businessName} · ` : ''}
              Schedule, track, and manage your client appointments.
            </p>
          </div>

          <div className="topbar-right-col">
            {/* Date / Time Chip */}
            <div className="janjiyuk-time-chip hide-mobile">
              {timeStr}
            </div>

            {/* Pill Search Input */}
            <div className="janjiyuk-search-pill hide-mobile">
              <span className="search-icon">{ICONS.search}</span>
              <input type="text" placeholder="Search for anything..." />
              <button type="button" className="search-filter-icon" title="Filter">
                {ICONS.filter}
              </button>
            </div>

            {/* Notification Bell Circle */}
            <button
              type="button"
              className="janjiyuk-bell-btn"
              title="Notifications"
              onClick={() => navigate('/dashboard/appointments')}
            >
              {ICONS.bell}
              <span className="bell-badge-dot" />
            </button>

            {/* Theme Toggle Icon in Topbar on Mobile */}
            <button
              type="button"
              className="janjiyuk-bell-btn hide-desktop"
              onClick={toggleTheme}
              title="Toggle theme"
            >
              {theme === 'dark' ? ICONS.sun : ICONS.moon}
            </button>
          </div>
        </header>

        {/* Dynamic Nested Content */}
        <main className="janjiyuk-content-body">
          <Outlet />
        </main>
      </div>

      {/* Toast Container */}
      {state.toasts.length > 0 && (
        <div className="toast-container">
          {state.toasts.map(toast => (
            <div key={toast.id} className={`toast toast-${toast.type}`}>
              <span>{toast.message}</span>
              <button
                className="toast-close"
                onClick={() => dispatch({ type: ACTIONS.REMOVE_TOAST, payload: toast.id })}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
