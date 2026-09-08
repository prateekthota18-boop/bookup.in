/**
 * BookUp — Centralized Data Store
 * React Context + localStorage for persistent state
 */

import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { createSeedState } from './seedData';

const STORAGE_KEY = 'bookup_state';

// --- Initial State ---
const initialState = {
  auth: {
    isAuthenticated: false,
    isDemoMode: false,
    user: null,
  },
  provider: null,
  services: [],
  availability: null,
  bookings: [],
  customers: [],
  policies: null,
  reminderSettings: null,
  analytics: null,
  googleCalendar: {
    isConnected: false,
    email: null,
  },
  onboarding: {
    completed: false,
    currentStep: 0,
  },
  toasts: [],
};

// --- Action Types ---
export const ACTIONS = {
  // Auth
  LOGIN: 'LOGIN',
  SIGNUP: 'SIGNUP',
  LOGOUT: 'LOGOUT',
  ENTER_DEMO: 'ENTER_DEMO',
  
  // Provider
  UPDATE_PROVIDER: 'UPDATE_PROVIDER',
  
  // Services
  ADD_SERVICE: 'ADD_SERVICE',
  UPDATE_SERVICE: 'UPDATE_SERVICE',
  DELETE_SERVICE: 'DELETE_SERVICE',
  TOGGLE_SERVICE: 'TOGGLE_SERVICE',
  
  // Availability
  UPDATE_AVAILABILITY: 'UPDATE_AVAILABILITY',
  
  // Bookings
  ADD_BOOKING: 'ADD_BOOKING',
  UPDATE_BOOKING: 'UPDATE_BOOKING',
  CANCEL_BOOKING: 'CANCEL_BOOKING',
  RESCHEDULE_BOOKING: 'RESCHEDULE_BOOKING',
  MARK_COMPLETED: 'MARK_COMPLETED',
  MARK_NO_SHOW: 'MARK_NO_SHOW',
  MARK_LATE_CANCELLATION: 'MARK_LATE_CANCELLATION',
  
  // Google Calendar
  CONNECT_GOOGLE_CALENDAR: 'CONNECT_GOOGLE_CALENDAR',
  DISCONNECT_GOOGLE_CALENDAR: 'DISCONNECT_GOOGLE_CALENDAR',
  
  // Policies
  UPDATE_POLICIES: 'UPDATE_POLICIES',
  
  // Reminders
  UPDATE_REMINDERS: 'UPDATE_REMINDERS',
  
  // Onboarding
  SET_ONBOARDING_STEP: 'SET_ONBOARDING_STEP',
  COMPLETE_ONBOARDING: 'COMPLETE_ONBOARDING',
  
  // Toasts
  ADD_TOAST: 'ADD_TOAST',
  REMOVE_TOAST: 'REMOVE_TOAST',

  // Full state
  LOAD_STATE: 'LOAD_STATE',
};

// --- Reducer ---
function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.LOAD_STATE:
      return { ...action.payload, toasts: [] };

    case ACTIONS.LOGIN:
      return {
        ...state,
        auth: { isAuthenticated: true, isDemoMode: false, user: action.payload },
      };

    case ACTIONS.SIGNUP:
      return {
        ...state,
        auth: { isAuthenticated: true, isDemoMode: false, user: action.payload },
        provider: action.payload,
      };

    case ACTIONS.LOGOUT:
      localStorage.removeItem(STORAGE_KEY);
      return { ...initialState };

    case ACTIONS.ENTER_DEMO: {
      const seed = createSeedState();
      return { ...seed, onboarding: { completed: true, currentStep: 8 }, toasts: [] };
    }

    case ACTIONS.UPDATE_PROVIDER:
      return {
        ...state,
        provider: { ...state.provider, ...action.payload },
        auth: { ...state.auth, user: { ...state.auth.user, ...action.payload } },
      };

    case ACTIONS.ADD_SERVICE:
      return { ...state, services: [...state.services, action.payload] };

    case ACTIONS.UPDATE_SERVICE:
      return {
        ...state,
        services: state.services.map(s => s.id === action.payload.id ? { ...s, ...action.payload } : s),
      };

    case ACTIONS.DELETE_SERVICE:
      return { ...state, services: state.services.filter(s => s.id !== action.payload) };

    case ACTIONS.TOGGLE_SERVICE:
      return {
        ...state,
        services: state.services.map(s => s.id === action.payload ? { ...s, isActive: !s.isActive } : s),
      };

    case ACTIONS.UPDATE_AVAILABILITY:
      return { ...state, availability: { ...state.availability, ...action.payload } };

    case ACTIONS.ADD_BOOKING: {
      const newCustomer = action.payload.customer;
      const existingCustomer = state.customers.find(c => c.phone === newCustomer.phone);
      const isGcalConnected = state.googleCalendar?.isConnected;
      const bookingToAdd = {
        ...action.payload.booking,
        ...(isGcalConnected ? { syncedToGoogleCalendar: true } : {}),
      };
      return {
        ...state,
        bookings: [...state.bookings, bookingToAdd],
        customers: existingCustomer ? state.customers : [...state.customers, newCustomer],
      };
    }

    case ACTIONS.UPDATE_BOOKING:
      return {
        ...state,
        bookings: state.bookings.map(b => b.id === action.payload.id ? { ...b, ...action.payload } : b),
      };

    case ACTIONS.CANCEL_BOOKING:
      return {
        ...state,
        bookings: state.bookings.map(b =>
          b.id === action.payload
            ? { ...b, status: 'cancelled', depositStatus: b.depositAmount > 0 ? 'refunded' : b.depositStatus }
            : b
        ),
      };

    case ACTIONS.RESCHEDULE_BOOKING:
      return {
        ...state,
        bookings: state.bookings.map(b =>
          b.id === action.payload.id
            ? { ...b, date: action.payload.date, startTime: action.payload.startTime, endTime: action.payload.endTime }
            : b
        ),
      };

    case ACTIONS.MARK_COMPLETED: {
      const bookingId = typeof action.payload === 'object' ? action.payload.id : action.payload;
      const actualEndTime = typeof action.payload === 'object' ? action.payload.actualEndTime : undefined;
      return {
        ...state,
        bookings: state.bookings.map(b =>
          b.id === bookingId
            ? {
                ...b,
                status: 'completed',
                ...(actualEndTime ? { actualEndTime } : {}),
              }
            : b
        ),
      };
    }

    case ACTIONS.CONNECT_GOOGLE_CALENDAR:
      return {
        ...state,
        googleCalendar: {
          isConnected: true,
          email: action.payload?.email || state.provider?.email || 'priya.sharma@gmail.com',
          connectedAt: new Date().toISOString(),
        },
      };

    case ACTIONS.DISCONNECT_GOOGLE_CALENDAR:
      return {
        ...state,
        googleCalendar: {
          isConnected: false,
          email: null,
        },
      };

    case ACTIONS.MARK_NO_SHOW:
      return {
        ...state,
        bookings: state.bookings.map(b =>
          b.id === action.payload
            ? { ...b, status: 'no-show', depositStatus: b.depositAmount > 0 ? 'forfeited' : b.depositStatus }
            : b
        ),
      };

    case ACTIONS.MARK_LATE_CANCELLATION:
      return {
        ...state,
        bookings: state.bookings.map(b =>
          b.id === action.payload
            ? { ...b, status: 'late-cancellation', depositStatus: b.depositAmount > 0 ? 'forfeited' : b.depositStatus }
            : b
        ),
      };

    case ACTIONS.UPDATE_POLICIES:
      return { ...state, policies: { ...state.policies, ...action.payload } };

    case ACTIONS.UPDATE_REMINDERS:
      return { ...state, reminderSettings: { ...state.reminderSettings, ...action.payload } };

    case ACTIONS.SET_ONBOARDING_STEP:
      return { ...state, onboarding: { ...state.onboarding, currentStep: action.payload } };

    case ACTIONS.COMPLETE_ONBOARDING:
      return { ...state, onboarding: { completed: true, currentStep: 8 } };

    case ACTIONS.ADD_TOAST:
      return { ...state, toasts: [...state.toasts, action.payload] };

    case ACTIONS.REMOVE_TOAST:
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };

    default:
      return state;
  }
}

// --- Context ---
const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState, () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...initialState, ...parsed, toasts: [] };
      }
    } catch (e) {
      console.error('Failed to load state from localStorage:', e);
    }
    return initialState;
  });

  // Persist state to localStorage (excluding toasts)
  useEffect(() => {
    try {
      const { toasts, ...persistState } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistState));
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }, [state]);

  const addToast = useCallback((message, type = 'success', duration = 4000) => {
    const id = `toast-${Date.now()}`;
    dispatch({ type: ACTIONS.ADD_TOAST, payload: { id, message, type } });
    setTimeout(() => {
      dispatch({ type: ACTIONS.REMOVE_TOAST, payload: id });
    }, duration);
  }, []);

  return (
    <StoreContext.Provider value={{ state, dispatch, addToast }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
}

// --- Utility selectors ---
export function useProvider() {
  const { state } = useStore();
  return state.provider;
}

export function useServices() {
  const { state } = useStore();
  return state.services;
}

export function useActiveServices() {
  const { state } = useStore();
  return state.services.filter(s => s.isActive);
}

export function useBookings() {
  const { state } = useStore();
  return state.bookings;
}

export function useAuth() {
  const { state } = useStore();
  return state.auth;
}

// --- Helper functions ---
export function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function formatCurrency(amount) {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().split('T')[0];
  
  if (dateStr === todayStr) return 'Today';
  if (dateStr === tomorrowStr) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

export function getStatusBadgeClass(status) {
  const map = {
    'confirmed': 'badge-confirmed',
    'completed': 'badge-completed',
    'cancelled': 'badge-cancelled',
    'no-show': 'badge-no-show',
    'late-cancellation': 'badge-late-cancellation',
  };
  return map[status] || 'badge-confirmed';
}

export function getDepositBadgeClass(status) {
  const map = {
    'paid': 'badge-deposit-paid',
    'pending': 'badge-deposit-pending',
    'forfeited': 'badge-deposit-forfeited',
    'refunded': 'badge-deposit-refunded',
    'na': 'badge-deposit-na',
  };
  return map[status] || 'badge-deposit-na';
}

export function getStatusLabel(status) {
  const map = {
    'confirmed': 'Confirmed',
    'completed': 'Completed',
    'cancelled': 'Cancelled',
    'no-show': 'No-show',
    'late-cancellation': 'Late cancellation',
  };
  return map[status] || status;
}

export function getDepositLabel(status) {
  const map = {
    'paid': 'Deposit paid',
    'pending': 'Pending',
    'forfeited': 'Forfeited',
    'refunded': 'Refunded',
    'na': 'No deposit',
  };
  return map[status] || status;
}

// Calculate dashboard metrics from bookings
export function calculateMetrics(bookings) {
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const upcoming = bookings.filter(b => b.date >= today && b.status === 'confirmed');
  const thisMonth = bookings.filter(b => {
    const d = new Date(b.date + 'T00:00:00');
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const completedOrConfirmed = bookings.filter(b => ['completed', 'confirmed'].includes(b.status));
  const noShows = bookings.filter(b => b.status === 'no-show');
  const lateCancellations = bookings.filter(b => b.status === 'late-cancellation');
  
  const totalRevenue = completedOrConfirmed.reduce((sum, b) => sum + b.price, 0);
  const depositsCollected = bookings.filter(b => b.depositStatus === 'paid' || b.depositStatus === 'forfeited')
    .reduce((sum, b) => sum + (b.depositAmount || 0), 0);
  const revenueProtected = [...noShows, ...lateCancellations]
    .reduce((sum, b) => sum + (b.depositAmount || 0), 0);
  
  const totalBookings = bookings.filter(b => b.status !== 'cancelled').length;
  const noShowRate = totalBookings > 0 ? ((noShows.length / totalBookings) * 100).toFixed(1) : '0.0';

  return {
    upcomingCount: upcoming.length,
    thisMonthCount: thisMonth.length,
    totalRevenue,
    noShowRate: parseFloat(noShowRate),
    depositsCollected,
    revenueProtected,
    noShowCount: noShows.length,
    lateCancellationCount: lateCancellations.length,
  };
}
