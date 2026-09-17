/**
 * CalUp — Appointments Page
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
import StatCard from '../../components/ui/StatCard';
import PillButton from '../../components/ui/PillButton';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'payment-pending', label: 'Payment Pending' },
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

  // Payment verification state
  const [rejectModalBooking, setRejectModalBooking] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingPaymentId, setProcessingPaymentId] = useState(null);
  const [viewScreenshotUrl, setViewScreenshotUrl] = useState(null);

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

  // Payment verification handlers
  const handleConfirmPayment = async (booking) => {
    if (!booking) return;
    setProcessingPaymentId(booking.id);
    try {
      if (!state.auth?.isDemoMode && isSupabaseConfigured() && booking.id && !booking.id.startsWith('booking-')) {
        try {
          await dbService.confirmPayment(booking.id);
        } catch (apiErr) {
          console.warn('[Appointments] Backend confirmPayment API notice:', apiErr.message);
        }
      }
      dispatch({
        type: ACTIONS.UPDATE_BOOKING,
        payload: {
          id: booking.id,
          paymentStatus: 'confirmed',
          paymentConfirmedAt: new Date().toISOString(),
        },
      });
      addToast(`Payment confirmed for ${booking.customerName} ✓`);
    } catch (err) {
      addToast(err.message || 'Failed to confirm payment.', 'error');
    } finally {
      setProcessingPaymentId(null);
    }
  };

  const handleOpenRejectPayment = (booking) => {
    setRejectModalBooking(booking);
    setRejectReason('');
  };

  const handleConfirmRejectPayment = async () => {
    if (!rejectModalBooking || !rejectReason.trim()) return;
    const booking = rejectModalBooking;
    setProcessingPaymentId(booking.id);
    try {
      if (!state.auth?.isDemoMode && isSupabaseConfigured() && booking.id && !booking.id.startsWith('booking-')) {
        try {
          await dbService.rejectPayment(booking.id, rejectReason.trim());
        } catch (apiErr) {
          console.warn('[Appointments] Backend rejectPayment API notice:', apiErr.message);
        }
      }

      if (state.googleCalendar?.isConnected && booking.googleEventId) {
        const providerId = state.provider?.id || 'provider-1';
        realGoogleCalendarService.deleteEvent(booking.googleEventId, providerId);
      }

      dispatch({
        type: ACTIONS.UPDATE_BOOKING,
        payload: {
          id: booking.id,
          paymentStatus: 'rejected',
          paymentRejectedAt: new Date().toISOString(),
          paymentRejectedReason: rejectReason.trim(),
          status: 'cancelled',
        },
      });

      addToast(`Payment rejected for ${booking.customerName}. Slot freed.`);
      setRejectModalBooking(null);
      setRejectReason('');
      if (selectedBooking === booking.id) {
        setSelectedBooking(null);
      }
    } catch (err) {
      addToast(err.message || 'Failed to reject payment.', 'error');
    } finally {
      setProcessingPaymentId(null);
    }
  };

  const renderPaymentBadge = (b) => {
    if (b.price <= 0 || b.paymentStatus === 'not_required') {
      return null;
    }
    if (b.paymentStatus === 'confirmed') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '9999px',
            fontSize: '11px',
            fontWeight: 700,
            background: '#DCFCE7',
            color: '#166534',
            border: '1px solid #86EFAC',
          }}
        >
          Paid ✓
        </span>
      );
    }
    if (b.paymentStatus === 'verification_pending') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '9999px',
            fontSize: '11px',
            fontWeight: 700,
            background: '#EFF6FF',
            color: '#1E40AF',
            border: '1px solid #BFDBFE',
          }}
        >
          ⚡ Verification Pending
        </span>
      );
    }
    if (b.paymentStatus === 'rejected') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '9999px',
            fontSize: '11px',
            fontWeight: 700,
            background: '#FEE2E2',
            color: '#991B1B',
            border: '1px solid #FECACA',
          }}
          title={b.paymentRejectedReason || 'Payment rejected'}
        >
          Payment Rejected
        </span>
      );
    }
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '9999px',
          fontSize: '11px',
          fontWeight: 600,
          background: '#FEF3C7',
          color: '#92400E',
          border: '1px solid #FDE68A',
        }}
      >
        Awaiting Payment
      </span>
    );
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
      'payment-pending': state.bookings.filter(b => b.paymentStatus === 'verification_pending').length,
      completed: state.bookings.filter(b => b.status === 'completed').length,
      cancelled: state.bookings.filter(b => b.status === 'cancelled' || b.status === 'late-cancellation').length,
      'no-show': state.bookings.filter(b => b.status === 'no-show').length,
    };
  }, [state.bookings, today]);

  // Pending payment confirmations for coach alert section
  const pendingPaymentBookings = useMemo(() => {
    return state.bookings.filter(b => b.paymentStatus === 'verification_pending');
  }, [state.bookings]);

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
        } else if (activeTab === 'payment-pending') {
          if (b.paymentStatus !== 'verification_pending') return false;
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
          if (filterStatus === 'payment-pending') {
            if (b.paymentStatus !== 'verification_pending') return false;
          } else if (filterStatus === 'cancelled') {
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

            {/* Payment verification actions */}
            {booking.paymentStatus === 'verification_pending' && (
              <>
                <button
                  type="button"
                  className="actions-dropdown-item"
                  style={{ color: '#16A34A', fontWeight: 600 }}
                  onClick={() => {
                    setOpenDropdownId(null);
                    handleConfirmPayment(booking);
                  }}
                >
                  <span className="item-icon">✓</span>
                  <span>Confirm Payment</span>
                </button>
                <button
                  type="button"
                  className="actions-dropdown-item"
                  style={{ color: '#DC2626' }}
                  onClick={() => {
                    setOpenDropdownId(null);
                    handleOpenRejectPayment(booking);
                  }}
                >
                  <span className="item-icon">✕</span>
                  <span>Reject Payment</span>
                </button>
              </>
            )}

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
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Status</div>
                <span className={`badge ${getStatusBadgeClass(b.status)}`}>{getStatusLabel(b.status)}</span>
              </div>
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Calendar Sync</div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: isSyncedToGcal ? 'var(--color-primary-600)' : 'var(--color-text-secondary)' }}>
                  {isSyncedToGcal ? '✓ Event synced to provider Google Calendar' : 'Local booking only'}
                </div>
              </div>
            </div>
          </div>

          {/* Payment Information */}
          {b.price > 0 && (
            <div className="card card-padding">
              <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>Payment</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Verification Status</div>
                  <div style={{ marginTop: 4 }}>{renderPaymentBadge(b)}</div>
                </div>
                {b.paymentMarkedPaidAt && (
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Marked Paid At</div>
                    <div style={{ fontSize: 'var(--font-size-sm)' }}>{new Date(b.paymentMarkedPaidAt).toLocaleString()}</div>
                  </div>
                )}
                {b.paymentConfirmedAt && (
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Confirmed At</div>
                    <div style={{ fontSize: 'var(--font-size-sm)' }}>{new Date(b.paymentConfirmedAt).toLocaleString()}</div>
                  </div>
                )}
                {b.paymentRejectedReason && (
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: '#DC2626', fontWeight: 600 }}>Rejection Reason</div>
                    <div style={{ fontSize: 'var(--font-size-sm)', color: '#DC2626' }}>{b.paymentRejectedReason}</div>
                  </div>
                )}
                {b.paymentScreenshotUrl && (
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 6 }}>Proof Screenshot</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img
                        src={b.paymentScreenshotUrl}
                        alt="Proof of payment"
                        style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--theme-border)', cursor: 'pointer' }}
                        onClick={() => setViewScreenshotUrl(b.paymentScreenshotUrl)}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setViewScreenshotUrl(b.paymentScreenshotUrl)}
                      >
                        🔍 View Full Proof
                      </button>
                    </div>
                  </div>
                )}
                {b.paymentStatus === 'verification_pending' && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: 'var(--space-2)' }}>
                    <button
                      type="button"
                      className="btn btn-success btn-sm"
                      disabled={processingPaymentId === b.id}
                      onClick={() => handleConfirmPayment(b)}
                    >
                      ✓ Confirm Payment
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ color: '#DC2626', borderColor: '#FCA5A5' }}
                      disabled={processingPaymentId === b.id}
                      onClick={() => handleOpenRejectPayment(b)}
                    >
                      ✕ Reject Payment
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
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
        {renderPaymentModals()}
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: Appointments Main Table View
  // =========================================================================
  return (
    <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '20px', fontWeight: 800, margin: 0, color: 'var(--color-text)' }}>
            Appointments
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)', margin: '4px 0 0' }}>
            Manage and track all your client sessions in one place.
          </p>
        </div>
        <PillButton variant="primary" onClick={openManualBookingModal}>
          + New Appointment
        </PillButton>
      </div>

      {/* Pending Payment Confirmations Alert Block */}
      {pendingPaymentBookings.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(245, 158, 11, 0.02) 100%)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: 'var(--radius-card)',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: '0 4px 14px rgba(245, 158, 11, 0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.4rem' }}>⚡</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#92400E', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Pending Payment Confirmations
                  <span style={{
                    background: '#F59E0B',
                    color: '#FFFFFF',
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontWeight: 800,
                  }}>
                    {pendingPaymentBookings.length}
                  </span>
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#B45309' }}>
                  These customers marked their payment as paid via UPI. Verify in your UPI app, then confirm or reject.
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
            {pendingPaymentBookings.map(b => (
              <div key={b.id} style={{
                background: 'var(--theme-bg-card)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                    <div>
                      <div
                        onClick={() => setSelectedBooking(b.id)}
                        style={{ fontWeight: 700, fontSize: '15px', color: 'var(--color-text)', cursor: 'pointer' }}
                        title="View details"
                      >
                        {b.customerName}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--theme-text-muted)', marginTop: '1px' }}>
                        {b.customerEmail || b.customerPhone || '—'}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--color-text)' }}>
                      {formatCurrency(b.price)}
                    </div>
                  </div>

                  <div style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div>
                      <span style={{ opacity: 0.8 }}>Session:</span> <strong>{b.serviceName}</strong> ({b.duration} min)
                    </div>
                    <div>
                      <span style={{ opacity: 0.8 }}>Scheduled:</span> 📅 {formatDate(b.date)} at {formatTime(b.startTime)}
                    </div>
                    {b.paymentMarkedPaidAt && (
                      <div style={{ fontSize: '11.5px', color: '#B45309', marginTop: '2px' }}>
                        ⏱️ Marked paid {new Date(b.paymentMarkedPaidAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({formatDate(b.paymentMarkedPaidAt.split('T')[0])})
                      </div>
                    )}
                  </div>

                  {/* Screenshot Thumbnail */}
                  <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {b.paymentScreenshotUrl ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <img
                          src={b.paymentScreenshotUrl}
                          alt="Screenshot"
                          style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--theme-border)', cursor: 'pointer' }}
                          onClick={() => setViewScreenshotUrl(b.paymentScreenshotUrl)}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                          onClick={() => setViewScreenshotUrl(b.paymentScreenshotUrl)}
                        >
                          🔍 View Proof
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '11.5px', color: 'var(--theme-text-muted)', fontStyle: 'italic' }}>
                        No screenshot uploaded
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', paddingTop: '10px', borderTop: '1px solid var(--theme-border)' }}>
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    style={{ flex: 1 }}
                    disabled={processingPaymentId === b.id}
                    onClick={() => handleConfirmPayment(b)}
                  >
                    {processingPaymentId === b.id ? 'Confirming...' : '✓ Confirm'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ color: '#DC2626', borderColor: '#FCA5A5' }}
                    disabled={processingPaymentId === b.id}
                    onClick={() => handleOpenRejectPayment(b)}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Summary Metrics Cards */}
      <div className="appointments-metrics-grid">
        <StatCard
          icon="📅"
          label="Upcoming"
          value={summaryMetrics.upcoming}
          subtext="Active confirmed bookings"
          isActive={activeTab === 'upcoming'}
          onClick={() => setActiveTab('upcoming')}
        />
        <StatCard
          icon="✓"
          label="Completed"
          value={summaryMetrics.completed}
          subtext="Concluded sessions"
          isActive={activeTab === 'completed'}
          onClick={() => setActiveTab('completed')}
        />
        <StatCard
          icon="✕"
          label="Cancelled"
          value={summaryMetrics.cancelled}
          subtext="Cancelled & late cancellations"
          isActive={activeTab === 'cancelled'}
          onClick={() => setActiveTab('cancelled')}
        />
        <StatCard
          icon="🛡️"
          label="No-shows"
          value={summaryMetrics.noShows}
          subtext="Missed appointments"
          isActive={activeTab === 'no-show'}
          onClick={() => setActiveTab('no-show')}
        />
      </div>

      {/* Toolbar: Tabs + Search + Multi-dropdown filters */}
      <div style={{
        background: 'var(--theme-bg-card)',
        borderRadius: 'var(--radius-card)',
        border: '1px solid var(--theme-border)',
        padding: '18px 20px',
        boxShadow: 'var(--shadow-card)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}>
        {/* Status Tabs */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid var(--theme-border)', paddingBottom: '14px' }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                borderRadius: 'var(--radius-pill)',
                padding: '6px 14px',
                border: '1px solid',
                borderColor: activeTab === tab.key ? 'var(--color-lime)' : 'var(--theme-border)',
                background: activeTab === tab.key ? 'var(--color-lime-soft)' : 'var(--theme-input-bg)',
                color: activeTab === tab.key ? '#0E0E0E' : 'var(--theme-text-muted)',
                fontWeight: activeTab === tab.key ? 700 : 500,
                fontSize: '12.5px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all var(--transition-fast)',
              }}
            >
              <span>{tab.label}</span>
              <span style={{
                background: activeTab === tab.key ? '#0E0E0E' : 'rgba(0,0,0,0.06)',
                color: activeTab === tab.key ? '#FFFFFF' : 'var(--color-text)',
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '10px',
                fontWeight: 700,
              }}>
                {tabCounts[tab.key] || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Filter controls row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', flex: '1 1 100%', minWidth: '160px', width: '100%' }}>
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '38px', height: '40px', fontSize: '13px' }}
              placeholder="Search by customer or service..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none' }}>
              🔍
            </span>
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
              className="form-input"
              style={{ height: '40px', fontSize: '13px', padding: '6px 14px', width: 'auto', minWidth: '130px' }}
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
              className="form-input"
              style={{ height: '40px', fontSize: '13px', padding: '6px 14px', width: 'auto', minWidth: '130px' }}
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="payment-pending">Payment pending</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no-show">No-show</option>
              <option value="late-cancellation">Late cancellation</option>
            </select>
          </div>

          {/* Date Dropdown */}
          <div className="filter-select-wrapper">
            <select
              className="form-input"
              style={{ height: '40px', fontSize: '13px', padding: '6px 14px', width: 'auto', minWidth: '120px' }}
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
              className="form-input"
              style={{ height: '40px', fontSize: '13px', padding: '6px 14px', width: 'auto' }}
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
              className="btn btn-ghost btn-sm"
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
          {/* Desktop Table Container (Matching Overview Today's Schedule) */}
          <div className="appointments-desktop-table" style={{
            background: 'var(--theme-bg-card)',
            borderRadius: 'var(--radius-card)',
            border: '1px solid var(--theme-border)',
            padding: '24px',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px' }}>
                <thead>
                  <tr style={{ color: 'var(--theme-text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600 }}>Customer</th>
                    <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600 }}>Service</th>
                    <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600 }}>Date & Time</th>
                    <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600 }}>Amount</th>
                    <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 600, width: '48px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedBookings.map((b, idx) => {
                    const isNearBottom = idx >= paginatedBookings.length - 2 && paginatedBookings.length > 3;
                    return (
                      <tr key={b.id} className={idx % 2 === 1 ? 'highlighted-lime' : ''} style={{ transition: 'all var(--transition-fast)' }}>
                        {/* Customer */}
                        <td style={{ padding: '14px', fontWeight: 600 }}>
                          <div
                            onClick={() => setSelectedBooking(b.id)}
                            title="Click to view details"
                            style={{ cursor: 'pointer', color: 'var(--color-text)' }}
                          >
                            {b.customerName}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--theme-text-muted)', fontWeight: 400, marginTop: 2 }}>
                            {b.customerEmail || b.customerPhone || '—'}
                          </div>
                        </td>

                        {/* Service */}
                        <td style={{ padding: '14px' }}>
                          <div style={{ fontWeight: 600 }}>{b.serviceName}</div>
                          <div style={{ fontSize: '11.5px', color: 'var(--theme-text-muted)', marginTop: 2 }}>{b.duration} min</div>
                        </td>

                        {/* Date & Time */}
                        <td style={{ padding: '14px' }}>
                          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ opacity: 0.7 }}>📅</span>
                            {formatDate(b.date)}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--theme-text-muted)', marginTop: 2 }}>
                            {formatTime(b.startTime)} – {formatTime(b.endTime)}
                            {b.actualEndTime && (
                              <span style={{ marginLeft: 6, color: '#16A34A', fontWeight: 500 }}>
                                (wrapped {formatTime(b.actualEndTime)})
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Amount */}
                        <td style={{ padding: '14px', fontWeight: 700 }}>
                          {formatCurrency(b.price)}
                        </td>

                        {/* Status */}
                        <td style={{ padding: '14px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                            <span className={`badge ${getStatusBadgeClass(b.status)}`}>
                              {getStatusLabel(b.status)}
                            </span>
                            {renderPaymentBadge(b)}
                          </div>
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '14px', textAlign: 'center' }}>
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
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className={`badge ${getStatusBadgeClass(b.status)}`}>
                        <span className="badge-dot" />
                        {getStatusLabel(b.status)}
                      </span>
                      {renderPaymentBadge(b)}
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
      {renderPaymentModals()}

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

  // Helper to render payment verification modals (Reject reason modal, Screenshot preview modal)
  function renderPaymentModals() {
    return (
      <>
        {/* Reject Payment Modal */}
        {rejectModalBooking && (
          <div className="modal-overlay" onClick={() => !processingPaymentId && setRejectModalBooking(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 style={{ color: '#DC2626' }}>Reject Payment</h3>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => !processingPaymentId && setRejectModalBooking(null)}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-gray-50)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-md)' }}>{rejectModalBooking.customerName}</div>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {rejectModalBooking.serviceName} · {formatCurrency(rejectModalBooking.price)}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--theme-text-muted)', marginTop: 4 }}>
                    📅 {formatDate(rejectModalBooking.date)} at {formatTime(rejectModalBooking.startTime)}
                  </div>
                </div>

                <p style={{ fontSize: '13px', color: '#B45309', background: '#FEF3C7', padding: '10px 12px', borderRadius: '8px', marginBottom: '14px' }}>
                  ⚠️ <strong>Slot will be freed</strong>: Rejecting this payment will cancel the booking and immediately release the time slot so other clients can book it.
                </p>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Reason for Rejection *</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    placeholder="e.g., Payment not received in UPI account, incorrect reference ID, amount mismatch..."
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    disabled={processingPaymentId === rejectModalBooking.id}
                  />
                  <span className="form-hint">This explanation will be visible to the customer on their booking status page.</span>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setRejectModalBooking(null)}
                  disabled={processingPaymentId === rejectModalBooking.id}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleConfirmRejectPayment}
                  disabled={processingPaymentId === rejectModalBooking.id || !rejectReason.trim()}
                >
                  {processingPaymentId === rejectModalBooking.id ? 'Rejecting...' : 'Reject Payment & Free Slot'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Screenshot Viewer Modal */}
        {viewScreenshotUrl && (
          <div className="modal-overlay" onClick={() => setViewScreenshotUrl(null)}>
            <div className="modal modal-md" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px', padding: '16px' }}>
              <div className="modal-header" style={{ marginBottom: '12px' }}>
                <h3 style={{ fontSize: '16px' }}>Payment Proof Screenshot</h3>
                <button type="button" className="modal-close" onClick={() => setViewScreenshotUrl(null)}>✕</button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000', borderRadius: '8px', overflow: 'hidden', maxHeight: '70vh' }}>
                <img
                  src={viewScreenshotUrl}
                  alt="Payment proof screenshot"
                  style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setViewScreenshotUrl(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }
}
