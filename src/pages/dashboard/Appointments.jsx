/**
 * BookUp — Appointments Page
 * Redesigned high-density, Linear/Stripe-quality appointments dashboard
 * Context-aware row actions, unified multi-criteria filtering, search, sorting, and responsive cards
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  useStore,
  formatCurrency,
  formatDate,
  formatTime,
  getStatusBadgeClass,
  getDepositBadgeClass,
  getStatusLabel,
  getDepositLabel,
  generateId,
} from '../../data/store';
import { ACTIONS } from '../../data/actions';
import { timeToMinutes, minutesToTime, getTimeSlotsDetailedForDate } from '../../utils/helpers';
import { whatsAppService } from '../../services/notifications/MockWhatsAppProvider';
import { MOCK_GCAL_BUSY_EVENTS } from '../../services/calendar/MockGoogleCalendarProvider';
import { realGoogleCalendarService } from '../../services/calendar/RealGoogleCalendarProvider';
import { isSupabaseConfigured } from '../../services/supabase/supabaseClient';
import { dbService } from '../../services/supabase/dbService';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'no-show', label: 'No-show' },
];

export default function Appointments() {
  const { state, dispatch, addToast } = useStore();

  // Active view & detail selection
  const [selectedBooking, setSelectedBooking] = useState(null);

  // Tabs & Filters
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterService, setFilterService] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDatePreset, setFilterDatePreset] = useState('all');
  const [sortBy, setSortBy] = useState('date-newest');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Row dropdown & Action target
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [actionBooking, setActionBooking] = useState(null);

  // Modals
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completionEndTime, setCompletionEndTime] = useState('');

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showNoShowModal, setShowNoShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Manual booking modal state
  const [showManualModal, setShowManualModal] = useState(false);
  const activeServices = (state.services || []).filter(s => s.isActive);
  const today = new Date().toISOString().split('T')[0];
  const gcalConnected = Boolean(state.googleCalendar?.isConnected);

  // Maximum advance booking date window
  const maxAdvanceDays = state.availability?.maxAdvanceBooking ?? 30;
  const maxDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + maxAdvanceDays);
    return d.toISOString().split('T')[0];
  }, [maxAdvanceDays]);

  const [manualForm, setManualForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerWhatsApp: '',
    serviceId: '',
    date: today,
    startTime: '',
    depositStatus: 'paid',
    notes: '',
  });

  // Global click-outside & Escape key to close actions dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.actions-dropdown-anchor')) {
        setOpenDropdownId(null);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);



  const openManualBookingModal = () => {
    setManualForm({
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      customerWhatsApp: '',
      serviceId: activeServices[0]?.id || '',
      date: today,
      startTime: '',
      depositStatus: 'paid',
      notes: '',
    });
    setShowManualModal(true);
  };

  const getGcalBusyTimesForDate = useCallback((dateStr) => {
    if (!state.googleCalendar?.isConnected || !dateStr) return [];
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    return MOCK_GCAL_BUSY_EVENTS.filter(e => e.dayOfWeek === day);
  }, [state.googleCalendar?.isConnected]);

  // Active booking for modals (can be selected booking OR action target from table row)
  const activeModalTarget = useMemo(() => {
    if (actionBooking) return actionBooking;
    if (selectedBooking) return state.bookings.find(bk => bk.id === selectedBooking) || null;
    return null;
  }, [actionBooking, selectedBooking, state.bookings]);

  // Actions
  const handleOpenReschedule = (booking) => {
    setActionBooking(booking);
    setRescheduleDate(booking.date >= today ? booking.date : today);
    setRescheduleTime('');
    setShowRescheduleModal(true);
    setOpenDropdownId(null);
  };

  const handleConfirmReschedule = (booking) => {
    if (!rescheduleDate || !rescheduleTime) return;

    // Validate that slot is still available
    const availableSlots = getTimeSlotsDetailedForDate(
      rescheduleDate,
      state.availability,
      state.services,
      booking.serviceId,
      state.bookings,
      getGcalBusyTimesForDate(rescheduleDate),
      booking.id
    );

    const slotObj = availableSlots.find(s => s.time === rescheduleTime);
    if (!slotObj || !slotObj.available) {
      addToast('The selected time slot is no longer available. Please select another slot.', 'error');
      setRescheduleTime('');
      return;
    }

    const [h, m] = rescheduleTime.split(':').map(Number);
    const endMinutes = h * 60 + m + booking.duration;
    const newEndTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

    if (!state.auth?.isDemoMode && isSupabaseConfigured() && booking.id && !booking.id.startsWith('booking-')) {
      dbService.rescheduleBooking(booking.id, rescheduleDate, rescheduleTime, newEndTime).catch(err => {
        console.error('Failed to persist reschedule to Supabase:', err);
      });
    }

    dispatch({
      type: ACTIONS.RESCHEDULE_BOOKING,
      payload: {
        id: booking.id,
        date: rescheduleDate,
        startTime: rescheduleTime,
        endTime: newEndTime,
      },
    });

    // Sync reschedule to Google Calendar
    if (state.googleCalendar?.isConnected && booking.googleEventId) {
      const providerId = state.provider?.id || 'provider-1';
      realGoogleCalendarService.updateEvent(booking.googleEventId, {
        ...booking,
        date: rescheduleDate,
        startTime: rescheduleTime,
        endTime: newEndTime,
      }, providerId);
    }

    addToast('Appointment rescheduled successfully.');
    setShowRescheduleModal(false);
    setActionBooking(null);
  };

  const handleOpenComplete = (booking) => {
    setActionBooking(booking);
    setCompletionEndTime(booking.endTime);
    setShowCompleteModal(true);
    setOpenDropdownId(null);
  };

  const handleConfirmComplete = (booking) => {
    const scheduledEndMin = timeToMinutes(booking.endTime);
    const actualEndMin = timeToMinutes(completionEndTime);
    const freedMin = Math.max(0, scheduledEndMin - actualEndMin);

    const payload = {
      id: booking.id,
      actualEndTime: freedMin > 0 ? completionEndTime : undefined,
    };

    if (!state.auth?.isDemoMode && isSupabaseConfigured() && booking.id && !booking.id.startsWith('booking-')) {
      dbService.updateBookingStatus(booking.id, 'completed', {
        actual_end_time: freedMin > 0 ? completionEndTime : null,
      }).catch(err => console.error('Failed to persist complete to Supabase:', err));
    }

    dispatch({ type: ACTIONS.MARK_COMPLETED, payload });

    if (freedMin > 0) {
      addToast(`Freed up ${freedMin} min — now bookable by other clients. ✓`);
    } else {
      addToast('Appointment marked as completed ✓');
    }

    setShowCompleteModal(false);
    setActionBooking(null);
  };

  const handleOpenNoShow = (booking) => {
    setActionBooking(booking);
    setShowNoShowModal(true);
    setOpenDropdownId(null);
  };

  const handleConfirmNoShow = (id) => {
    if (!state.auth?.isDemoMode && isSupabaseConfigured() && id && !id.startsWith('booking-')) {
      dbService.updateBookingStatus(id, 'no-show', {
        deposit_status: 'forfeited',
      }).catch(err => console.error('Failed to persist no-show to Supabase:', err));
    }

    dispatch({ type: ACTIONS.MARK_NO_SHOW, payload: id });
    addToast('No-show recorded. Deposit forfeited. 🛡️');
    setShowNoShowModal(false);
    setActionBooking(null);
  };

  const handleOpenCancel = (booking) => {
    setActionBooking(booking);
    setShowCancelModal(true);
    setOpenDropdownId(null);
  };

  const handleConfirmCancel = (id) => {
    const target = state.bookings.find(b => b.id === id);
    if (state.googleCalendar?.isConnected && target?.googleEventId) {
      const providerId = state.provider?.id || 'provider-1';
      realGoogleCalendarService.deleteEvent(target.googleEventId, providerId);
    }

    if (!state.auth?.isDemoMode && isSupabaseConfigured() && id && !id.startsWith('booking-')) {
      dbService.updateBookingStatus(id, 'cancelled', {
        deposit_status: target?.depositAmount > 0 ? 'refunded' : target?.depositStatus,
      }).catch(err => console.error('Failed to persist cancel to Supabase:', err));
    }

    dispatch({ type: ACTIONS.CANCEL_BOOKING, payload: id });
    addToast('Appointment cancelled.');
    setShowCancelModal(false);
    setActionBooking(null);
  };

  const handleMarkLateCancellation = (booking) => {
    if (!state.auth?.isDemoMode && isSupabaseConfigured() && booking?.id && !booking.id.startsWith('booking-')) {
      dbService.updateBookingStatus(booking.id, 'late-cancellation', {
        deposit_status: 'forfeited',
      }).catch(err => console.error('Failed to persist late-cancellation to Supabase:', err));
    }

    dispatch({ type: ACTIONS.MARK_LATE_CANCELLATION, payload: booking.id });
    addToast('Late cancellation recorded. Deposit forfeited. ⚠️');
    setOpenDropdownId(null);
  };

  const handleOpenDelete = (booking) => {
    setActionBooking(booking);
    setShowDeleteModal(true);
    setOpenDropdownId(null);
  };

  const handleConfirmDelete = (id) => {
    const target = state.bookings.find(b => b.id === id);
    if (state.googleCalendar?.isConnected && target?.googleEventId) {
      const providerId = state.provider?.id || 'provider-1';
      realGoogleCalendarService.deleteEvent(target.googleEventId, providerId);
    }

    if (!state.auth?.isDemoMode && isSupabaseConfigured() && id && !id.startsWith('booking-')) {
      dbService.deleteBooking(id).catch(err => console.error('Failed to delete booking in Supabase:', err));
    }

    dispatch({ type: ACTIONS.DELETE_BOOKING, payload: id });
    addToast('Appointment deleted.');
    setShowDeleteModal(false);
    setActionBooking(null);
    if (selectedBooking === id) {
      setSelectedBooking(null);
    }
  };

  // Manual booking submission
  const manualSlotsDetailed = useMemo(() => {
    if (!manualForm.date || !manualForm.serviceId || !state.availability) return [];
    return getTimeSlotsDetailedForDate(
      manualForm.date,
      state.availability,
      state.services,
      manualForm.serviceId,
      state.bookings,
      getGcalBusyTimesForDate(manualForm.date)
    );
  }, [manualForm.date, manualForm.serviceId, state.availability, state.services, state.bookings, getGcalBusyTimesForDate]);

  const handleCreateManualBooking = (e) => {
    e.preventDefault();
    if (!manualForm.customerName.trim() || !manualForm.customerPhone.trim() || !manualForm.serviceId || !manualForm.date || !manualForm.startTime) {
      addToast('Please complete all required fields and select a valid time slot.', 'error');
      return;
    }

    const slotObj = manualSlotsDetailed.find(s => s.time === manualForm.startTime);
    if (!slotObj || !slotObj.available) {
      addToast('The selected time slot is not available. Please choose another slot.', 'error');
      return;
    }

    const selectedSvc = state.services.find(s => s.id === manualForm.serviceId);
    if (!selectedSvc) return;

    const [h, m] = manualForm.startTime.split(':').map(Number);
    const endMinutes = h * 60 + m + selectedSvc.duration;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
    const custId = generateId('cust');

    const newBooking = {
      id: generateId('booking'),
      providerId: state.provider?.id || 'provider-1',
      serviceId: selectedSvc.id,
      serviceName: selectedSvc.name,
      customerId: custId,
      customerName: manualForm.customerName.trim(),
      customerPhone: manualForm.customerPhone.trim(),
      customerWhatsApp: manualForm.customerWhatsApp.trim() || manualForm.customerPhone.trim(),
      customerEmail: manualForm.customerEmail.trim(),
      date: manualForm.date,
      startTime: manualForm.startTime,
      endTime,
      duration: selectedSvc.duration,
      price: selectedSvc.price,
      depositAmount: selectedSvc.depositAmount,
      depositStatus: selectedSvc.depositAmount > 0 ? manualForm.depositStatus : 'na',
      status: 'confirmed',
      source: 'Manual entry (Provider)',
      notes: manualForm.notes.trim(),
      createdAt: new Date().toISOString(),
      ...(gcalConnected ? { syncedToGoogleCalendar: true } : {}),
    };

    const customer = {
      id: custId,
      name: manualForm.customerName.trim(),
      phone: manualForm.customerPhone.trim(),
      whatsapp: manualForm.customerWhatsApp.trim() || manualForm.customerPhone.trim(),
      email: manualForm.customerEmail.trim(),
    };

    dispatch({ type: ACTIONS.ADD_BOOKING, payload: { booking: newBooking, customer } });
    addToast('Appointment created successfully.');
    setShowManualModal(false);
  };

  // Top summary metric counts
  const summaryMetrics = useMemo(() => {
    const upcoming = state.bookings.filter(b => b.date >= today && b.status === 'confirmed').length;
    const completed = state.bookings.filter(b => b.status === 'completed').length;
    const cancelled = state.bookings.filter(b => b.status === 'cancelled' || b.status === 'late-cancellation').length;
    const noShows = state.bookings.filter(b => b.status === 'no-show').length;
    return {
      upcoming,
      completed,
      cancelled,
      noShows,
      total: state.bookings.length,
    };
  }, [state.bookings, today]);

  // Tab counts
  const tabCounts = useMemo(() => {
    return {
      all: state.bookings.length,
      upcoming: state.bookings.filter(b => b.date >= today && b.status === 'confirmed').length,
      completed: state.bookings.filter(b => b.status === 'completed').length,
      cancelled: state.bookings.filter(b => b.status === 'cancelled' || b.status === 'late-cancellation').length,
      'no-show': state.bookings.filter(b => b.status === 'no-show').length,
    };
  }, [state.bookings, today]);

  // Comprehensive Filtering & Sorting
  const filteredBookings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    // Date presets calculation
    const next7Days = new Date();
    next7Days.setDate(next7Days.getDate() + 7);
    const next7Str = next7Days.toISOString().split('T')[0];

    const next30Days = new Date();
    next30Days.setDate(next30Days.getDate() + 30);
    const next30Str = next30Days.toISOString().split('T')[0];

    return state.bookings
      .filter(b => {
        // 1. Tab filter
        if (activeTab === 'upcoming') {
          if (!(b.date >= today && b.status === 'confirmed')) return false;
        } else if (activeTab === 'cancelled') {
          if (!(b.status === 'cancelled' || b.status === 'late-cancellation')) return false;
        } else if (activeTab !== 'all') {
          if (b.status !== activeTab) return false;
        }

        // 2. Search query filter
        if (query) {
          const matchName = b.customerName?.toLowerCase().includes(query);
          const matchEmail = b.customerEmail?.toLowerCase().includes(query);
          const matchPhone = b.customerPhone?.toLowerCase().includes(query);
          const matchService = b.serviceName?.toLowerCase().includes(query);
          if (!matchName && !matchEmail && !matchPhone && !matchService) return false;
        }

        // 3. Service dropdown filter
        if (filterService !== 'all' && b.serviceId !== filterService) {
          return false;
        }

        // 4. Status dropdown filter
        if (filterStatus !== 'all') {
          if (filterStatus === 'cancelled') {
            if (b.status !== 'cancelled' && b.status !== 'late-cancellation') return false;
          } else if (b.status !== filterStatus) {
            return false;
          }
        }

        // 5. Date preset filter
        if (filterDatePreset === 'today') {
          if (b.date !== today) return false;
        } else if (filterDatePreset === 'next7') {
          if (b.date < today || b.date > next7Str) return false;
        } else if (filterDatePreset === 'next30') {
          if (b.date < today || b.date > next30Str) return false;
        } else if (filterDatePreset === 'past') {
          if (b.date >= today) return false;
        }

        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'date-newest':
            return b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime);
          case 'date-oldest':
            return a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
          case 'customer-asc':
            return (a.customerName || '').localeCompare(b.customerName || '');
          case 'customer-desc':
            return (b.customerName || '').localeCompare(a.customerName || '');
          case 'amount-desc':
            return (b.price || 0) - (a.price || 0);
          case 'amount-asc':
            return (a.price || 0) - (b.price || 0);
          default:
            return b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime);
        }
      });
  }, [state.bookings, activeTab, searchQuery, filterService, filterStatus, filterDatePreset, sortBy, today]);

  // Active filters count
  const hasActiveFilters = searchQuery.trim() !== '' || filterService !== 'all' || filterStatus !== 'all' || filterDatePreset !== 'all' || sortBy !== 'date-newest';

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterService('all');
    setFilterStatus('all');
    setFilterDatePreset('all');
    setSortBy('date-newest');
    setActiveTab('all');
  };

  // Pagination calculation
  const totalCount = filteredBookings.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = totalCount === 0 ? 0 : (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalCount);
  const paginatedBookings = useMemo(() => {
    return filteredBookings.slice(startIndex, endIndex);
  }, [filteredBookings, startIndex, endIndex]);

  // Context-aware row action menu component
  const renderActionsMenu = (booking, isNearBottom = false) => {
    const isMenuOpen = openDropdownId === booking.id;
    const isConfirmed = booking.status === 'confirmed';

    return (
      <div className="actions-dropdown-anchor" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          aria-label="Actions"
          aria-expanded={isMenuOpen}
          className={`btn-table-action ${isMenuOpen ? 'active' : ''}`}
          onClick={() => setOpenDropdownId(isMenuOpen ? null : booking.id)}
        >
          ⋮
        </button>

        {isMenuOpen && (
          <div className={`actions-dropdown-menu ${isNearBottom ? 'actions-dropdown-menu-up' : ''}`}>
            {/* View Details */}
            <button
              type="button"
              className="actions-dropdown-item"
              onClick={() => {
                setOpenDropdownId(null);
                setSelectedBooking(booking.id);
              }}
            >
              <span className="item-icon">👁️</span>
              <span>View details</span>
            </button>

            {/* Confirmed actions */}
            {isConfirmed && (
              <>
                <button
                  type="button"
                  className="actions-dropdown-item"
                  onClick={() => handleOpenReschedule(booking)}
                >
                  <span className="item-icon">📅</span>
                  <span>Reschedule</span>
                </button>
                <button
                  type="button"
                  className="actions-dropdown-item"
                  onClick={() => handleOpenComplete(booking)}
                >
                  <span className="item-icon">✓</span>
                  <span>Mark as completed</span>
                </button>
                <button
                  type="button"
                  className="actions-dropdown-item"
                  onClick={() => handleOpenNoShow(booking)}
                >
                  <span className="item-icon">🚫</span>
                  <span>Mark as no-show</span>
                </button>
                <button
                  type="button"
                  className="actions-dropdown-item"
                  onClick={() => handleOpenCancel(booking)}
                >
                  <span className="item-icon">✕</span>
                  <span>Cancel appointment</span>
                </button>
              </>
            )}

            <div className="actions-dropdown-divider" />

            {/* Destructive Delete */}
            <button
              type="button"
              className="actions-dropdown-item actions-dropdown-item-danger"
              onClick={() => handleOpenDelete(booking)}
            >
              <span className="item-icon">🗑️</span>
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  // Reschedule slots detailed calculation for modal
  const rescheduleSlotsDetailed = useMemo(() => {
    if (!activeModalTarget || !rescheduleDate) return [];
    return getTimeSlotsDetailedForDate(
      rescheduleDate,
      state.availability,
      state.services,
      activeModalTarget.serviceId,
      state.bookings,
      getGcalBusyTimesForDate(rescheduleDate),
      activeModalTarget.id
    );
  }, [activeModalTarget, rescheduleDate, state.availability, state.services, state.bookings, getGcalBusyTimesForDate]);

  // =========================================================================
  // VIEW 1: Appointment Detail View (if selectedBooking is set)
  // =========================================================================
  if (selectedBooking) {
    const b = state.bookings.find(bk => bk.id === selectedBooking);
    if (!b) {
      setSelectedBooking(null);
      return null;
    }

    const isSyncedToGcal = gcalConnected || b.syncedToGoogleCalendar;
    const scheduledEndMin = timeToMinutes(b.endTime);
    const selectedEndMin = timeToMinutes(completionEndTime || b.endTime);
    const freedPreviewMin = Math.max(0, scheduledEndMin - selectedEndMin);

    // WhatsApp message preview text
    let waPreviewText = '';
    if (b.status === 'confirmed') {
      waPreviewText = whatsAppService.generateConfirmationMessage(b, state.provider);
    } else if (b.status === 'cancelled' || b.status === 'late-cancellation') {
      waPreviewText = whatsAppService.generateCancellationMessage(b, state.provider);
    } else {
      waPreviewText = `Hi ${b.customerName}! Thank you for attending your ${b.serviceName} session with ${state.provider?.name || 'us'}. We hope you had a great experience! ⭐`;
    }

    return (
      <div className="animate-fade-in-up">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setSelectedBooking(null)}
          style={{ marginBottom: 'var(--space-4)' }}
        >
          ← Back to appointments
        </button>

        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <h1 className="page-title">Appointment Details</h1>
            <p className="page-subtitle">Booking reference: {b.id}</p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            {isSyncedToGcal && (
              <span className="badge badge-active" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px' }}>
                <span>📅</span> Synced to Google Calendar
              </span>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ color: 'var(--color-error-600)', borderColor: 'var(--color-error-200)' }}
              onClick={() => handleOpenDelete(b)}
            >
              🗑️ Delete
            </button>
          </div>
        </div>

        <div className="appointment-details-grid">
          {/* Customer Info */}
          <div className="card card-padding">
            <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>Customer</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Name</div>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', color: 'var(--color-text)' }}>{b.customerName}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Phone / WhatsApp</div>
                <div>{b.customerPhone}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Email</div>
                <div>{b.customerEmail || '—'}</div>
              </div>
            </div>
          </div>

          {/* Appointment Info */}
          <div className="card card-padding">
            <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>Appointment</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Service</div>
                <div style={{ fontWeight: 600 }}>{b.serviceName}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Date & Scheduled Time</div>
                <div>{formatDate(b.date)} · {formatTime(b.startTime)} – {formatTime(b.endTime)}</div>
              </div>
              {b.actualEndTime && (
                <div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-success-700)', fontWeight: 600 }}>
                    ⚡ Completed Early
                  </div>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-success-700)' }}>
                    Finished at {formatTime(b.actualEndTime)} (released remaining time for bookings)
                  </div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Duration</div>
                <div>{b.duration} minutes</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Price</div>
                <div style={{ fontWeight: 700, fontSize: 'var(--font-size-md)', color: 'var(--color-text)' }}>{formatCurrency(b.price)}</div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                <div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Status</div>
                  <span className={`badge ${getStatusBadgeClass(b.status)}`}>{getStatusLabel(b.status)}</span>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Deposit</div>
                  <span className={`badge ${getDepositBadgeClass(b.depositStatus)}`}>{getDepositLabel(b.depositStatus)}</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Calendar Sync</div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: isSyncedToGcal ? 'var(--color-primary-600)' : 'var(--color-text-secondary)' }}>
                  {isSyncedToGcal ? '✓ Event synced to provider Google Calendar' : 'Local booking only'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* WhatsApp Message Preview Panel */}
        <div className="card card-padding" style={{ marginTop: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <span style={{ fontSize: '1.25rem' }}>💬</span>
            <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, margin: 0 }}>WhatsApp Message Preview</h4>
            <span className="badge badge-active" style={{ fontSize: 'var(--font-size-xs)' }}>Simulated WhatsApp</span>
          </div>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
            Message generated and dispatched to client's phone ({b.customerPhone}):
          </p>

          <div style={{
            background: '#DCF8C6',
            borderRadius: '0 12px 12px 12px',
            padding: 'var(--space-4)',
            maxWidth: 480,
            fontSize: 'var(--font-size-sm)',
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid rgba(0,0,0,0.06)',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.5,
            color: '#111b21',
          }}>
            {waPreviewText}
            <div style={{ textAlign: 'right', fontSize: 11, color: '#667781', marginTop: 6 }}>
              {formatTime(b.startTime)} ✓✓
            </div>
          </div>
        </div>

        {/* Actions bar inside detail view */}
        {b.status === 'confirmed' && (
          <div className="card card-padding" style={{ marginTop: 'var(--space-6)' }}>
            <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>Actions</h4>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <button className="btn btn-success btn-sm" onClick={() => handleOpenComplete(b)}>
                ✓ Mark Completed
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleOpenReschedule(b)}>
                📅 Reschedule
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleOpenCancel(b)}>
                ✕ Cancel Appointment
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => handleOpenNoShow(b)}>
                🚫 Mark No-show
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleMarkLateCancellation(b)}>
                ⚠️ Mark Late Cancellation
              </button>
            </div>
          </div>
        )}

        {/* Render shared modals */}
        {renderModals(b, scheduledEndMin, freedPreviewMin)}
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: Appointments Main Table View
  // =========================================================================
  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="section-header" style={{ marginBottom: 'var(--space-4)' }}>
        <div>
          <h1 className="page-title">Appointments</h1>
          <p className="page-subtitle">Manage all your bookings in one place.</p>
        </div>
        <button className="btn btn-primary" onClick={openManualBookingModal}>
          + New Appointment
        </button>
      </div>

      {/* Top Summary Metrics Cards */}
      <div className="appointments-stats-grid">
        <div
          className={`appointment-stat-card ${activeTab === 'upcoming' ? 'active-filter' : ''}`}
          onClick={() => setActiveTab('upcoming')}
        >
          <div className="stat-card-header">
            <span className="stat-card-label">Upcoming</span>
            <div className="stat-icon-badge badge-blue">📅</div>
          </div>
          <div className="stat-card-value">{summaryMetrics.upcoming}</div>
          <div className="stat-card-sub">Active confirmed bookings</div>
        </div>

        <div
          className={`appointment-stat-card ${activeTab === 'completed' ? 'active-filter' : ''}`}
          onClick={() => setActiveTab('completed')}
        >
          <div className="stat-card-header">
            <span className="stat-card-label">Completed</span>
            <div className="stat-icon-badge badge-green">✓</div>
          </div>
          <div className="stat-card-value">{summaryMetrics.completed}</div>
          <div className="stat-card-sub">Concluded sessions</div>
        </div>

        <div
          className={`appointment-stat-card ${activeTab === 'cancelled' ? 'active-filter' : ''}`}
          onClick={() => setActiveTab('cancelled')}
        >
          <div className="stat-card-header">
            <span className="stat-card-label">Cancelled</span>
            <div className="stat-icon-badge badge-gray">✕</div>
          </div>
          <div className="stat-card-value">{summaryMetrics.cancelled}</div>
          <div className="stat-card-sub">Cancelled & late cancellations</div>
        </div>

        <div
          className={`appointment-stat-card ${activeTab === 'no-show' ? 'active-filter' : ''}`}
          onClick={() => setActiveTab('no-show')}
        >
          <div className="stat-card-header">
            <span className="stat-card-label">No-shows</span>
            <div className="stat-icon-badge badge-red">🛡️</div>
          </div>
          <div className="stat-card-value">{summaryMetrics.noShows}</div>
          <div className="stat-card-sub">Deposits forfeited</div>
        </div>
      </div>

      {/* Toolbar: Tabs + Search + Multi-dropdown filters */}
      <div className="appointments-toolbar-card">
        {/* Status Tabs */}
        <div className="appointments-tabs">
          {TABS.map(tab => (
            <button
              key={tab.key}
              type="button"
              className={`tab ${activeTab === tab.key ? 'tab-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span>{tab.label}</span>
              <span className="tab-count-badge">{tabCounts[tab.key] || 0}</span>
            </button>
          ))}
        </div>

        {/* Search & Filter controls row */}
        <div className="appointments-filter-bar">
          {/* Search Input */}
          <div className="appointments-search-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="appointments-search-input"
              placeholder="Search by customer or service..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Service Dropdown */}
          <div className="filter-select-wrapper">
            <select
              className="filter-select"
              value={filterService}
              onChange={e => setFilterService(e.target.value)}
            >
              <option value="all">All services</option>
              {state.services?.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Status Dropdown */}
          <div className="filter-select-wrapper">
            <select
              className="filter-select"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no-show">No-show</option>
              <option value="late-cancellation">Late cancellation</option>
            </select>
          </div>

          {/* Date Dropdown */}
          <div className="filter-select-wrapper">
            <select
              className="filter-select"
              value={filterDatePreset}
              onChange={e => setFilterDatePreset(e.target.value)}
            >
              <option value="all">All dates</option>
              <option value="today">Today</option>
              <option value="next7">Next 7 days</option>
              <option value="next30">Next 30 days</option>
              <option value="past">Past dates</option>
            </select>
          </div>

          {/* Sort By Dropdown */}
          <div className="filter-select-wrapper sort-select-wrapper">
            <select
              className="filter-select sort-select"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              <option value="date-newest">Sort: Date — newest</option>
              <option value="date-oldest">Sort: Date — oldest</option>
              <option value="customer-asc">Sort: Customer A–Z</option>
              <option value="customer-desc">Sort: Customer Z–A</option>
              <option value="amount-desc">Sort: Amount — highest</option>
              <option value="amount-asc">Sort: Amount — lowest</option>
            </select>
          </div>

          {/* Clear Filters button */}
          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-clear-filters"
              onClick={handleResetFilters}
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* Appointments List View */}
      {paginatedBookings.length > 0 ? (
        <>
          {/* Desktop Table */}
          <div className="appointments-table-card">
            <div className="table-container">
              <table className="appointments-data-table">
                <thead>
                  <tr>
                    <th style={{ width: '24%' }}>Customer</th>
                    <th style={{ width: '22%' }}>Service</th>
                    <th style={{ width: '20%' }}>Date & Time</th>
                    <th style={{ width: '12%' }}>Amount</th>
                    <th style={{ width: '11%' }}>Deposit</th>
                    <th style={{ width: '11%' }}>Status</th>
                    <th style={{ width: '48px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedBookings.map((b, idx) => {
                    const isNearBottom = idx >= paginatedBookings.length - 2 && paginatedBookings.length > 3;
                    return (
                      <tr key={b.id} className="appointment-table-row">
                        {/* Customer */}
                        <td>
                          <div
                            className="table-customer-name"
                            onClick={() => setSelectedBooking(b.id)}
                            title="Click to view details"
                          >
                            {b.customerName}
                          </div>
                          <div className="table-secondary-sub">
                            {b.customerEmail || b.customerPhone || '—'}
                          </div>
                        </td>

                        {/* Service */}
                        <td>
                          <div className="table-service-name">{b.serviceName}</div>
                          <div className="table-secondary-sub">{b.duration} min</div>
                        </td>

                        {/* Date & Time */}
                        <td>
                          <div className="table-datetime-primary">
                            <span style={{ marginRight: 4, opacity: 0.7 }}>📅</span>
                            {formatDate(b.date)}
                          </div>
                          <div className="table-datetime-secondary">
                            {formatTime(b.startTime)} – {formatTime(b.endTime)}
                            {b.actualEndTime && (
                              <span style={{ marginLeft: 6, color: 'var(--color-success-700)', fontWeight: 500 }}>
                                (wrapped {formatTime(b.actualEndTime)})
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Amount */}
                        <td>
                          <div className="table-amount-text">{formatCurrency(b.price)}</div>
                        </td>

                        {/* Deposit */}
                        <td>
                          <span className={`badge ${getDepositBadgeClass(b.depositStatus)}`}>
                            {getDepositLabel(b.depositStatus)}
                          </span>
                        </td>

                        {/* Status */}
                        <td>
                          <span className={`badge ${getStatusBadgeClass(b.status)}`}>
                            <span className="badge-dot" />
                            {getStatusLabel(b.status)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'center' }}>
                          {renderActionsMenu(b, isNearBottom)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="table-pagination">
              <div className="pagination-info">
                Showing <strong>{startIndex + 1}</strong>–<strong>{endIndex}</strong> of <strong>{totalCount}</strong> appointments
              </div>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="pagination-nav-btn"
                  disabled={safeCurrentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  ←
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                  <button
                    key={pageNum}
                    type="button"
                    className={`pagination-page-btn ${safeCurrentPage === pageNum ? 'active' : ''}`}
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                ))}
                <button
                  type="button"
                  className="pagination-nav-btn"
                  disabled={safeCurrentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                >
                  →
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Cards View */}
          <div className="appointments-mobile-cards">
            {paginatedBookings.map((b, idx) => {
              const isNearBottom = idx >= paginatedBookings.length - 2 && paginatedBookings.length > 3;
              return (
                <div key={b.id} className="appointment-card-mobile card card-padding">
                  <div className="mobile-card-top">
                    <div>
                      <div
                        className="mobile-card-customer"
                        onClick={() => setSelectedBooking(b.id)}
                      >
                        {b.customerName}
                      </div>
                      <div className="mobile-card-sub">
                        {b.customerEmail || b.customerPhone || '—'}
                      </div>
                    </div>
                    {renderActionsMenu(b, isNearBottom)}
                  </div>

                  <div className="mobile-card-service-row">
                    <span className="service-name">{b.serviceName}</span>
                    <span className="service-duration">({b.duration} min)</span>
                  </div>

                  <div className="mobile-card-datetime">
                    📅 {formatDate(b.date)} · {formatTime(b.startTime)}
                    {b.actualEndTime && (
                      <span style={{ color: 'var(--color-success-700)', fontWeight: 500, marginLeft: 4 }}>
                        (early {formatTime(b.actualEndTime)})
                      </span>
                    )}
                  </div>

                  <div className="mobile-card-bottom">
                    <div className="mobile-card-price">{formatCurrency(b.price)}</div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <span className={`badge ${getDepositBadgeClass(b.depositStatus)}`}>
                        {getDepositLabel(b.depositStatus)}
                      </span>
                      <span className={`badge ${getStatusBadgeClass(b.status)}`}>
                        <span className="badge-dot" />
                        {getStatusLabel(b.status)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Mobile Pagination */}
            {totalPages > 1 && (
              <div className="table-pagination" style={{ marginTop: 'var(--space-4)' }}>
                <div className="pagination-info">
                  Page <strong>{safeCurrentPage}</strong> of <strong>{totalPages}</strong> ({totalCount} total)
                </div>
                <div className="pagination-controls">
                  <button
                    type="button"
                    className="pagination-nav-btn"
                    disabled={safeCurrentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="pagination-nav-btn"
                    disabled={safeCurrentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  >
                    →
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="card">
          <div className="empty-state">
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>📭</div>
            <div className="empty-state-title">No appointments found</div>
            <div className="empty-state-description">
              {hasActiveFilters
                ? 'No appointments match the selected filters or search query.'
                : activeTab === 'upcoming'
                ? 'No upcoming appointments. Share your booking link to get booked!'
                : 'No appointments in this category yet.'}
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 'var(--space-4)' }}
                onClick={handleResetFilters}
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {renderModals(activeModalTarget, activeModalTarget ? timeToMinutes(activeModalTarget.endTime) : 0, 0)}

      {/* Manual Booking Modal */}
      {showManualModal && (
        <div className="modal-overlay" onClick={() => setShowManualModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create New Appointment</h3>
              <button className="modal-close" onClick={() => setShowManualModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateManualBooking}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Customer Name *</label>
                    <input
                      className="form-input"
                      placeholder="e.g. Rahul Sharma"
                      value={manualForm.customerName}
                      onChange={e => setManualForm({ ...manualForm, customerName: e.target.value })}
                      required
                      autoFocus
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone Number *</label>
                    <input
                      className="form-input"
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={manualForm.customerPhone}
                      onChange={e => setManualForm({ ...manualForm, customerPhone: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">WhatsApp Number</label>
                    <input
                      className="form-input"
                      type="tel"
                      placeholder="Same as phone"
                      value={manualForm.customerWhatsApp}
                      onChange={e => setManualForm({ ...manualForm, customerWhatsApp: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                      className="form-input"
                      type="email"
                      placeholder="customer@email.com"
                      value={manualForm.customerEmail}
                      onChange={e => setManualForm({ ...manualForm, customerEmail: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Select Service *</label>
                  <select
                    className="form-input"
                    value={manualForm.serviceId}
                    onChange={e => setManualForm({ ...manualForm, serviceId: e.target.value, startTime: '' })}
                    required
                  >
                    {activeServices.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.duration} min · {formatCurrency(s.price)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Date *</label>
                    <input
                      type="date"
                      className="form-input"
                      min={today}
                      max={maxDate}
                      value={manualForm.date}
                      onChange={e => setManualForm({ ...manualForm, date: e.target.value, startTime: '' })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Deposit Status</label>
                    <select
                      className="form-input"
                      value={manualForm.depositStatus}
                      onChange={e => setManualForm({ ...manualForm, depositStatus: e.target.value })}
                    >
                      <option value="paid">Deposit Paid</option>
                      <option value="pending">Deposit Pending</option>
                      <option value="na">No Deposit</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Select Time Slot *</label>
                  {manualSlotsDetailed.length > 0 ? (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(85px, 1fr))',
                      gap: 'var(--space-2)',
                      maxHeight: 160,
                      overflowY: 'auto',
                      padding: 2,
                    }}>
                      {manualSlotsDetailed.map(slot => (
                        <button
                          key={slot.time}
                          type="button"
                          disabled={!slot.available}
                          className={`btn btn-sm ${manualForm.startTime === slot.time ? 'btn-primary' : 'btn-secondary'}`}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 'var(--font-size-xs)',
                            padding: '6px 4px',
                            opacity: slot.available ? 1 : 0.45,
                            cursor: slot.available ? 'pointer' : 'not-allowed',
                          }}
                          onClick={() => slot.available && setManualForm({ ...manualForm, startTime: slot.time })}
                        >
                          <span>{formatTime(slot.time)}</span>
                          {!slot.available && (
                            <span style={{ fontSize: '0.625rem', opacity: 0.85, fontWeight: 500 }}>
                              {slot.reason === 'booked' ? 'Booked' : 'Unavailable'}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: 'var(--space-3)', background: 'var(--color-warning-50)', borderRadius: 'var(--radius-md)', color: 'var(--color-warning-700)', fontSize: 'var(--font-size-xs)' }}>
                      No available time slots on this date according to your availability rules and existing bookings.
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Notes (optional)</label>
                  <textarea
                    className="form-input form-textarea"
                    rows={2}
                    placeholder="Walk-in, booked over phone, special requests..."
                    value={manualForm.notes}
                    onChange={e => setManualForm({ ...manualForm, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowManualModal(false)}>Cancel</button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!manualForm.startTime}
                >
                  Create Appointment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  // Helper to render shared action modals (Reschedule, Complete, Cancel, No-Show, Delete)
  function renderModals(target, scheduledEndMin, freedPreviewMin) {
    if (!target) return null;

    const currentScheduledEndMin = scheduledEndMin || timeToMinutes(target.endTime);
    const currentSelectedEndMin = timeToMinutes(completionEndTime || target.endTime);
    const currentFreedMin = freedPreviewMin || Math.max(0, currentScheduledEndMin - currentSelectedEndMin);

    return (
      <>
        {/* Reschedule Modal */}
        {showRescheduleModal && (
          <div className="modal-overlay" onClick={() => setShowRescheduleModal(false)}>
            <div className="modal modal-md" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Reschedule Appointment</h3>
                <button className="modal-close" onClick={() => setShowRescheduleModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-gray-50)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Appointment</div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-md)', marginTop: 2 }}>{target.customerName}</div>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {target.serviceName} ({target.duration} mins)
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary-700)', fontWeight: 500, marginTop: 4 }}>
                    📅 {formatDate(target.date)} · ⏰ {formatTime(target.startTime)} – {formatTime(target.endTime)}
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="form-label">Select New Date</label>
                  <input
                    type="date"
                    className="form-input"
                    min={today}
                    max={maxDate}
                    value={rescheduleDate}
                    onChange={e => {
                      setRescheduleDate(e.target.value);
                      setRescheduleTime('');
                    }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="form-label">Select Available Time</label>
                  {rescheduleSlotsDetailed.length > 0 ? (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                      gap: 'var(--space-2)',
                      maxHeight: 180,
                      overflowY: 'auto',
                      padding: 2,
                    }}>
                      {rescheduleSlotsDetailed.map(slot => (
                        <button
                          key={slot.time}
                          type="button"
                          disabled={!slot.available}
                          className={`btn btn-sm ${rescheduleTime === slot.time ? 'btn-primary' : 'btn-secondary'}`}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 'var(--font-size-xs)',
                            padding: '6px 4px',
                            opacity: slot.available ? 1 : 0.45,
                            cursor: slot.available ? 'pointer' : 'not-allowed',
                          }}
                          onClick={() => slot.available && setRescheduleTime(slot.time)}
                        >
                          <span>{formatTime(slot.time)}</span>
                          {!slot.available && (
                            <span style={{ fontSize: '0.625rem', opacity: 0.85, fontWeight: 500 }}>
                              {slot.reason === 'booked' ? 'Booked' : 'Unavailable'}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: 'var(--space-3)', background: 'var(--color-warning-50)', borderRadius: 'var(--radius-md)', color: 'var(--color-warning-700)', fontSize: 'var(--font-size-xs)' }}>
                      No available time slots on this date according to your availability rules and buffers. Please choose another date.
                    </div>
                  )}
                </div>

                {rescheduleTime && (
                  <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-primary-900)' }}>
                    New scheduled time: <strong>{formatDate(rescheduleDate)} at {formatTime(rescheduleTime)}</strong>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowRescheduleModal(false)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  disabled={!rescheduleDate || !rescheduleTime}
                  onClick={() => handleConfirmReschedule(target)}
                >
                  Confirm Reschedule
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Complete Modal */}
        {showCompleteModal && (
          <div className="modal-overlay" onClick={() => setShowCompleteModal(false)}>
            <div className="modal modal-md" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Complete Appointment</h3>
                <button className="modal-close" onClick={() => setShowCompleteModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                  Mark session with <strong>{target.customerName}</strong> ({target.serviceName}) as finished.
                </p>

                <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-gray-50)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Scheduled Slot</div>
                  <div style={{ fontWeight: 600 }}>{formatTime(target.startTime)} – {formatTime(target.endTime)} ({target.duration} mins)</div>
                </div>

                <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="form-label">Actual Wrap-up Time</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                    <input
                      type="time"
                      className="form-input"
                      style={{ width: 140 }}
                      value={completionEndTime}
                      onChange={e => setCompletionEndTime(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setCompletionEndTime(target.endTime)}
                    >
                      On Schedule ({target.endTime})
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {[15, 20, 30].map(mins => {
                      const earlyMin = currentScheduledEndMin - mins;
                      if (earlyMin <= timeToMinutes(target.startTime)) return null;
                      const earlyTime = minutesToTime(earlyMin);
                      return (
                        <button
                          key={mins}
                          type="button"
                          className="btn btn-ghost btn-xs"
                          style={{ border: '1px solid var(--color-border)', fontSize: 'var(--font-size-xs)' }}
                          onClick={() => setCompletionEndTime(earlyTime)}
                        >
                          {mins} min early ({earlyTime})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {currentFreedMin > 0 ? (
                  <div style={{
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'var(--color-success-50)',
                    border: '1px solid var(--color-success-200)',
                    borderRadius: 'var(--radius-lg)',
                    color: 'var(--color-success-700)',
                    fontSize: 'var(--font-size-sm)',
                  }}>
                    ⚡ <strong>Freed up {currentFreedMin} min</strong> — will automatically become bookable by other clients on your public page.
                  </div>
                ) : (
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                    Completed on schedule. Remaining calendar slots remain as currently scheduled.
                  </p>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowCompleteModal(false)}>Cancel</button>
                <button className="btn btn-success" onClick={() => handleConfirmComplete(target)}>
                  Confirm & Complete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Modal */}
        {showCancelModal && (
          <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Cancel Appointment?</h3>
                <button className="modal-close" onClick={() => setShowCancelModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: 'var(--space-3)' }}>
                  Are you sure you want to cancel this appointment with <strong>{target.customerName}</strong>?
                </p>
                {target.depositAmount > 0 && (
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                    The {formatCurrency(target.depositAmount)} deposit will be refunded (demo).
                  </p>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowCancelModal(false)}>Keep Appointment</button>
                <button className="btn btn-danger" onClick={() => handleConfirmCancel(target.id)}>Cancel Appointment</button>
              </div>
            </div>
          </div>
        )}

        {/* No-show Modal */}
        {showNoShowModal && (
          <div className="modal-overlay" onClick={() => setShowNoShowModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Record No-show</h3>
                <button className="modal-close" onClick={() => setShowNoShowModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: 'var(--space-4)' }}>
                  Are you sure you want to mark this appointment with <strong>{target.customerName}</strong> as a no-show?
                </p>
                {target.depositAmount > 0 && (
                  <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-error-50)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-error-100)' }}>
                    <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-error-700)', fontWeight: 500, marginBottom: 4 }}>
                      🛡️ Forfeit {formatCurrency(target.depositAmount)} deposit and charge no-show fee?
                    </p>
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-error-600)' }}>
                      Demo payment (simulated UPI) — no real charges will be made.
                    </p>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowNoShowModal(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => handleConfirmNoShow(target.id)}>Confirm & Charge</button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Modal */}
        {showDeleteModal && (
          <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Delete Appointment</h3>
                <button className="modal-close" onClick={() => setShowDeleteModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: 'var(--space-3)' }}>
                  Are you sure you want to permanently delete the appointment for <strong>{target.customerName}</strong> ({target.serviceName})?
                </p>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-error-600)' }}>
                  This action cannot be undone.
                </p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => handleConfirmDelete(target.id)}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }
}
