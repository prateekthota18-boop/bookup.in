/**
 * BookUp — Centralized Data Store
 * React Context + localStorage for persistent state
 */

import { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { createSeedState } from './seedData';
import { ACTIONS } from './actions';
import { supabase, isSupabaseConfigured } from '../services/supabase/supabaseClient';
import { dbService } from '../services/supabase/dbService';

const STORAGE_KEY = 'bookup_state';

// --- Initial State ---
const initialState = {
  auth: {
    isAuthenticated: false,
    isDemoMode: false,
    user: null,
    loading: true,
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

// --- Reducer ---
function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.LOAD_STATE:
      return { ...action.payload, toasts: [] };

    case ACTIONS.HYDRATE_DASHBOARD:
      return {
        ...state,
        auth: {
          isAuthenticated: true,
          isDemoMode: false,
          user: action.payload.user,
          loading: false,
        },
        provider: action.payload.provider,
        services: action.payload.services || [],
        availability: action.payload.availability || state.availability,
        bookings: action.payload.bookings || [],
        policies: action.payload.policies || state.policies,
        onboarding: { completed: true, currentStep: 8 },
      };

    case ACTIONS.SET_AUTH_LOADING:
      return {
        ...state,
        auth: { ...state.auth, loading: action.payload },
      };

    case ACTIONS.LOGIN:
      return {
        ...state,
        auth: { isAuthenticated: true, isDemoMode: false, user: action.payload, loading: false },
      };

    case ACTIONS.SIGNUP:
      return {
        ...state,
        auth: { isAuthenticated: true, isDemoMode: false, user: action.payload, loading: false },
        provider: action.payload,
      };

    case ACTIONS.LOGOUT:
      localStorage.removeItem(STORAGE_KEY);
      return {
        ...initialState,
        auth: { isAuthenticated: false, isDemoMode: false, user: null, loading: false },
      };

    case ACTIONS.ENTER_DEMO: {
      const seed = createSeedState();
      return {
        ...seed,
        auth: { isAuthenticated: true, isDemoMode: true, user: seed.provider, loading: false },
        onboarding: { completed: true, currentStep: 8 },
        toasts: []
      };
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

    case ACTIONS.DELETE_BOOKING:
      return {
        ...state,
        bookings: state.bookings.filter(b => b.id !== action.payload),
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
        // ONLY restore from localStorage if the user was explicitly in Demo Mode
        if (parsed?.auth?.isDemoMode) {
          return { ...parsed, auth: { ...parsed.auth, loading: false }, toasts: [] };
        }
      }
    } catch (e) {
      console.error('Failed to load demo state from localStorage:', e);
    }
    // For real Supabase users, start with initialState (loading: true)
    return initialState;
  });

  // Persist state to localStorage ONLY when in Demo Mode
  useEffect(() => {
    try {
      if (state.auth?.isDemoMode) {
        const { toasts: _t, ...persistState } = state;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persistState));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.error('Failed to manage localStorage:', e);
    }
  }, [state.auth?.isDemoMode, state]);

  const isHydratingRef = useRef(false);

  // Synchronize with Supabase Auth & Hydrate Provider Dashboard
  const refreshFromSupabase = useCallback(async (userId = null) => {
    if (!isSupabaseConfigured()) {
      dispatch({ type: ACTIONS.SET_AUTH_LOADING, payload: false });
      return;
    }

    if (isHydratingRef.current) return;
    isHydratingRef.current = true;

    try {
      let uid = userId;
      if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id;
      }

      if (!uid) {
        dispatch({ type: ACTIONS.SET_AUTH_LOADING, payload: false });
        isHydratingRef.current = false;
        return;
      }

      let dashData = await dbService.getDashboardData(uid);
      if (!dashData?.provider) {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          const provName = currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'Provider';
          const baseSlug = (provName || 'provider').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'provider';
          const provSlug = `${baseSlug}-${currentUser.id.slice(0, 5)}`;
          try {
            await dbService.createProviderProfile({
              userId: currentUser.id,
              name: provName,
              slug: provSlug,
              email: currentUser.email,
            });
            dashData = await dbService.getDashboardData(uid);
          } catch {}
        }
      }

      if (dashData && dashData.provider) {
        dispatch({
          type: ACTIONS.HYDRATE_DASHBOARD,
          payload: {
            user: {
              id: uid,
              email: dashData.provider.email,
              name: dashData.provider.name,
              ...dashData.provider,
            },
            provider: dashData.provider,
            services: dashData.services || [],
            availability: dashData.availability,
            bookings: dashData.bookings || [],
            policies: dashData.policies,
          },
        });
      } else {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        dispatch({
          type: ACTIONS.LOGIN,
          payload: currentUser
            ? { id: currentUser.id, email: currentUser.email, name: currentUser.user_metadata?.name || 'Provider' }
            : { id: uid },
        });
      }
    } catch (err) {
      console.error('Failed to hydrate from Supabase:', err);
      dispatch({ type: ACTIONS.SET_AUTH_LOADING, payload: false });
    } finally {
      isHydratingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      dispatch({ type: ACTIONS.SET_AUTH_LOADING, payload: false });
      return;
    }

    // Check existing Supabase session on boot/refresh
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        refreshFromSupabase(session.user.id);
      } else {
        dispatch({ type: ACTIONS.SET_AUTH_LOADING, payload: false });
      }
    }).catch(err => {
      console.error('getSession error:', err);
      dispatch({ type: ACTIONS.SET_AUTH_LOADING, payload: false });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
        refreshFromSupabase(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        dispatch({ type: ACTIONS.LOGOUT });
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [refreshFromSupabase]);

  const addToast = useCallback((message, type = 'success', duration = 4000) => {
    const id = `toast-${Date.now()}`;
    dispatch({ type: ACTIONS.ADD_TOAST, payload: { id, message, type } });
    setTimeout(() => {
      dispatch({ type: ACTIONS.REMOVE_TOAST, payload: id });
    }, duration);
  }, []);

  return (
    <StoreContext.Provider value={{ state, dispatch, addToast, refreshFromSupabase }}>
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
  if (!timeStr) return '';
  if (typeof timeStr === 'string' && (timeStr.includes('AM') || timeStr.includes('PM'))) {
    return timeStr;
  }
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m || 0).padStart(2, '0')} ${period}`;
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
