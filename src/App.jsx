/**
 * BookUp — Main Application
 * Routing, providers, and app shell
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { StoreProvider, useAuth } from './data/store';

// Pages
import Landing from './pages/Landing';
import { Login, Signup } from './pages/Auth';
import Onboarding from './pages/Onboarding';

// Dashboard
import DashboardLayout from './layouts/DashboardLayout';
import Overview from './pages/dashboard/Overview';
import Appointments from './pages/dashboard/Appointments';
import Services from './pages/dashboard/Services';
import Availability from './pages/dashboard/Availability';
import BookingPageMgmt from './pages/dashboard/BookingPageMgmt';
import Policies from './pages/dashboard/Policies';
import Analytics from './pages/dashboard/Analytics';
import Settings from './pages/dashboard/Settings';

// Booking
import PublicBookingPage from './pages/booking/BookingPage';
import CustomerBooking from './pages/booking/CustomerBooking';

// Styles
import './styles/global.css';
import './styles/components.css';

function ProtectedRoute({ children }) {
  const auth = useAuth();
  if (auth.loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg-subtle, #f8fafc)'
      }}>
        <div className="spinner" />
      </div>
    );
  }
  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AuthRoute({ children }) {
  const auth = useAuth();
  if (auth.loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg-subtle, #f8fafc)'
      }}>
        <div className="spinner" />
      </div>
    );
  }
  if (auth.isAuthenticated && !auth.isDemoMode) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
      <Route path="/signup" element={<AuthRoute><Signup /></AuthRoute>} />
      <Route path="/onboarding" element={
        <ProtectedRoute>
          <Onboarding />
        </ProtectedRoute>
      } />

      {/* Public booking page & Customer management */}
      <Route path="/book/:slug" element={<PublicBookingPage />} />
      <Route path="/booking/:id" element={<CustomerBooking />} />

      {/* Dashboard (protected) */}
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route index element={<Overview />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="services" element={<Services />} />
        <Route path="availability" element={<Availability />} />
        <Route path="booking-page" element={<BookingPageMgmt />} />
        <Route path="policies" element={<Policies />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </StoreProvider>
  );
}
