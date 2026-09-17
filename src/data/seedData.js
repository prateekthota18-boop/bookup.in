/**
 * CalUp — Seed Data
 * Realistic demo data for the prototype
 */

// Helper to generate dates relative to today
const today = new Date();
const formatDate = (d) => d.toISOString().split('T')[0];
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const subDays = (d, n) => addDays(d, -n);

export const DEMO_PROVIDER = {
  id: 'provider-1',
  email: 'priya@alexfitness.in',
  phone: '+919876543210',
  name: 'Priya Sharma',
  businessName: 'Alex Fitness Studio',
  slug: 'priya-sharma',
  bio: 'Certified personal trainer and fitness consultant with 6+ years of experience. Specialising in strength training, HIIT, and nutrition planning. Based in Mumbai.',
  avatar: null, // Will use initials
  createdAt: '2026-03-15T10:00:00Z',
};

export const DEMO_SERVICES = [
  {
    id: 'svc-1',
    providerId: 'provider-1',
    name: 'Personal Training',
    description: 'One-on-one personal training session focused on your goals — weight loss, muscle building, or general fitness.',
    price: 1000,
    duration: 60,
    depositAmount: 200,
    isActive: true,
    createdAt: '2026-03-15T10:30:00Z',
  },
  {
    id: 'svc-2',
    providerId: 'provider-1',
    name: 'Fitness Consultation',
    description: 'Initial consultation to discuss your fitness goals, assess current fitness level, and create a personalised workout plan.',
    price: 750,
    duration: 45,
    depositAmount: 0,
    isActive: true,
    createdAt: '2026-03-15T10:35:00Z',
  },
  {
    id: 'svc-3',
    providerId: 'provider-1',
    name: 'Follow-up Session',
    description: 'Check-in session to review progress, adjust your workout plan, and address any concerns.',
    price: 500,
    duration: 30,
    depositAmount: 0,
    isActive: true,
    createdAt: '2026-03-15T10:40:00Z',
  },
];

export const DEMO_AVAILABILITY = {
  providerId: 'provider-1',
  schedule: {
    monday:    { available: true, start: '09:00', end: '18:00' },
    tuesday:   { available: true, start: '09:00', end: '18:00' },
    wednesday: { available: true, start: '09:00', end: '18:00' },
    thursday:  { available: true, start: '09:00', end: '18:00' },
    friday:    { available: true, start: '09:00', end: '17:00' },
    saturday:  { available: true, start: '10:00', end: '14:00' },
    sunday:    { available: false, start: '09:00', end: '18:00' },
  },
  bufferTime: 15,           // minutes between appointments
  minNotice: 2,             // hours minimum scheduling notice
  maxAdvanceBooking: 30,    // days ahead clients can book
};

export const DEMO_POLICIES = {
  providerId: 'provider-1',
  cancellationWindow: 12,   // hours before appointment
  depositAmount: 200,       // default deposit in ₹
  depositType: 'fixed',     // 'fixed' or 'percentage'
  lateCancellationFee: 200, // ₹
  noShowFee: 200,           // ₹ (deposit forfeiture by default)
  policyText: 'Cancel more than 12 hours before your appointment: full deposit refund. Late cancellation or no-show: deposit forfeited (₹200).',
};

export const DEMO_REMINDER_SETTINGS = {
  providerId: 'provider-1',
  bookingConfirmation: true,
  reminder24h: true,
  reminder2h: true,
  cancellationReminder: true,
};

// Generate demo customers
const DEMO_CUSTOMERS = [
  { id: 'cust-1', name: 'Rahul Sharma', phone: '+919812345001', whatsapp: '+919812345001', email: 'rahul.sharma@email.com' },
  { id: 'cust-2', name: 'Anita Patel', phone: '+919812345002', whatsapp: '+919812345002', email: 'anita.patel@email.com' },
  { id: 'cust-3', name: 'Vikram Singh', phone: '+919812345003', whatsapp: '+919812345003', email: 'vikram.singh@email.com' },
  { id: 'cust-4', name: 'Sneha Gupta', phone: '+919812345004', whatsapp: '+919812345004', email: 'sneha.gupta@email.com' },
  { id: 'cust-5', name: 'Arjun Reddy', phone: '+919812345005', whatsapp: '+919812345005', email: 'arjun.reddy@email.com' },
  { id: 'cust-6', name: 'Meera Nair', phone: '+919812345006', whatsapp: '+919812345006', email: 'meera.nair@email.com' },
  { id: 'cust-7', name: 'Karan Malhotra', phone: '+919812345007', whatsapp: '+919812345007', email: 'karan.m@email.com' },
  { id: 'cust-8', name: 'Priya Iyer', phone: '+919812345008', whatsapp: '+919812345008', email: 'priya.iyer@email.com' },
  { id: 'cust-9', name: 'Rohan Desai', phone: '+919812345009', whatsapp: '+919812345009', email: 'rohan.desai@email.com' },
  { id: 'cust-10', name: 'Kavita Joshi', phone: '+919812345010', whatsapp: '+919812345010', email: 'kavita.j@email.com' },
];

export { DEMO_CUSTOMERS };

// Generate demo bookings
function generateBookings() {
  const bookings = [];

  // Past bookings (completed, some cancelled/no-show)
  const pastBookings = [
    { customer: DEMO_CUSTOMERS[0], service: DEMO_SERVICES[0], date: subDays(today, 28), time: '10:00', status: 'completed', depositStatus: 'paid' },
    { customer: DEMO_CUSTOMERS[1], service: DEMO_SERVICES[1], date: subDays(today, 27), time: '14:00', status: 'completed', depositStatus: 'na' },
    { customer: DEMO_CUSTOMERS[2], service: DEMO_SERVICES[0], date: subDays(today, 25), time: '11:00', status: 'no-show', depositStatus: 'forfeited' },
    { customer: DEMO_CUSTOMERS[3], service: DEMO_SERVICES[2], date: subDays(today, 22), time: '16:00', status: 'completed', depositStatus: 'na' },
    { customer: DEMO_CUSTOMERS[4], service: DEMO_SERVICES[0], date: subDays(today, 20), time: '09:00', status: 'completed', depositStatus: 'paid' },
    { customer: DEMO_CUSTOMERS[5], service: DEMO_SERVICES[1], date: subDays(today, 18), time: '15:00', status: 'cancelled', depositStatus: 'refunded' },
    { customer: DEMO_CUSTOMERS[6], service: DEMO_SERVICES[0], date: subDays(today, 15), time: '10:00', status: 'completed', depositStatus: 'paid' },
    { customer: DEMO_CUSTOMERS[7], service: DEMO_SERVICES[0], date: subDays(today, 12), time: '11:00', status: 'late-cancellation', depositStatus: 'forfeited' },
    { customer: DEMO_CUSTOMERS[8], service: DEMO_SERVICES[2], date: subDays(today, 10), time: '14:00', status: 'completed', depositStatus: 'na' },
    { customer: DEMO_CUSTOMERS[9], service: DEMO_SERVICES[0], date: subDays(today, 7), time: '10:00', status: 'completed', depositStatus: 'paid' },
    { customer: DEMO_CUSTOMERS[0], service: DEMO_SERVICES[0], date: subDays(today, 5), time: '09:00', status: 'completed', depositStatus: 'paid' },
    { customer: DEMO_CUSTOMERS[1], service: DEMO_SERVICES[1], date: subDays(today, 3), time: '16:00', status: 'completed', depositStatus: 'na' },
    { customer: DEMO_CUSTOMERS[3], service: DEMO_SERVICES[0], date: subDays(today, 2), time: '11:00', status: 'completed', depositStatus: 'paid' },
    { customer: DEMO_CUSTOMERS[4], service: DEMO_SERVICES[2], date: subDays(today, 1), time: '15:00', status: 'completed', depositStatus: 'na' },
  ];

  // Today's bookings
  const todayBookings = [
    { customer: DEMO_CUSTOMERS[0], service: DEMO_SERVICES[0], date: today, time: '10:00', status: 'confirmed', depositStatus: 'paid' },
    { customer: DEMO_CUSTOMERS[2], service: DEMO_SERVICES[1], date: today, time: '14:00', status: 'confirmed', depositStatus: 'na' },
  ];

  // Upcoming bookings
  const upcomingBookings = [
    { customer: DEMO_CUSTOMERS[1], service: DEMO_SERVICES[0], date: addDays(today, 1), time: '09:00', status: 'confirmed', depositStatus: 'paid' },
    { customer: DEMO_CUSTOMERS[5], service: DEMO_SERVICES[0], date: addDays(today, 1), time: '11:00', status: 'confirmed', depositStatus: 'paid' },
    { customer: DEMO_CUSTOMERS[6], service: DEMO_SERVICES[2], date: addDays(today, 2), time: '10:00', status: 'confirmed', depositStatus: 'na' },
    { customer: DEMO_CUSTOMERS[7], service: DEMO_SERVICES[1], date: addDays(today, 2), time: '14:00', status: 'confirmed', depositStatus: 'na' },
    { customer: DEMO_CUSTOMERS[8], service: DEMO_SERVICES[0], date: addDays(today, 3), time: '10:00', status: 'confirmed', depositStatus: 'paid' },
    { customer: DEMO_CUSTOMERS[9], service: DEMO_SERVICES[0], date: addDays(today, 4), time: '11:00', status: 'confirmed', depositStatus: 'paid' },
    { customer: DEMO_CUSTOMERS[3], service: DEMO_SERVICES[0], date: addDays(today, 5), time: '09:00', status: 'confirmed', depositStatus: 'paid' },
    { customer: DEMO_CUSTOMERS[4], service: DEMO_SERVICES[1], date: addDays(today, 5), time: '15:00', status: 'confirmed', depositStatus: 'na' },
    { customer: DEMO_CUSTOMERS[0], service: DEMO_SERVICES[0], date: addDays(today, 7), time: '10:00', status: 'confirmed', depositStatus: 'paid' },
    { customer: DEMO_CUSTOMERS[1], service: DEMO_SERVICES[2], date: addDays(today, 8), time: '16:00', status: 'confirmed', depositStatus: 'na' },
  ];

  const allBookings = [...pastBookings, ...todayBookings, ...upcomingBookings];

  allBookings.forEach((b, i) => {
    const endTime = (() => {
      const [h, m] = b.time.split(':').map(Number);
      const endMinutes = h * 60 + m + b.service.duration;
      return `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
    })();

    bookings.push({
      id: `booking-${i + 1}`,
      providerId: 'provider-1',
      serviceId: b.service.id,
      serviceName: b.service.name,
      customerId: b.customer.id,
      customerName: b.customer.name,
      customerPhone: b.customer.phone,
      customerWhatsApp: b.customer.whatsapp,
      customerEmail: b.customer.email,
      date: formatDate(b.date),
      startTime: b.time,
      endTime: endTime,
      duration: b.service.duration,
      price: b.service.price,
      depositAmount: b.service.depositAmount,
      depositStatus: b.depositStatus,
      status: b.status,
      source: 'CalUp booking page',
      notes: '',
      createdAt: new Date(b.date.getTime() - 86400000 * 2).toISOString(),
    });
  });

  return bookings;
}

export const DEMO_BOOKINGS = generateBookings();

// Analytics trend data (6 months)
export const DEMO_ANALYTICS = {
  monthlyData: [
    { month: 'Apr 2026', appointments: 22, revenue: 18500, cancellations: 2, noShows: 1, depositsCollected: 3200 },
    { month: 'May 2026', appointments: 31, revenue: 26800, cancellations: 3, noShows: 2, depositsCollected: 5400 },
    { month: 'Jun 2026', appointments: 38, revenue: 33200, cancellations: 2, noShows: 1, depositsCollected: 6800 },
    { month: 'Jul 2026', appointments: 42, revenue: 37500, cancellations: 4, noShows: 2, depositsCollected: 7800 },
    { month: 'Aug 2026', appointments: 45, revenue: 40200, cancellations: 3, noShows: 1, depositsCollected: 8600 },
    { month: 'Sep 2026', appointments: 48, revenue: 42500, cancellations: 2, noShows: 2, depositsCollected: 9600 },
  ],
};

export const DEMO_SLUGS = ['priya-sharma', 'alex-johnson', 'alex-fitness', 'demo', 'provider-1'];

export function isDemoSlug(slug) {
  if (!slug) return false;
  const s = slug.toLowerCase().trim();
  return DEMO_SLUGS.includes(s);
}

// Full seed state
export function createSeedState(slugOverride = null) {
  const isAlex = slugOverride === 'alex-johnson';
  const provider = isAlex
    ? {
        ...DEMO_PROVIDER,
        name: 'Alex Johnson',
        email: 'alex@alexfitness.in',
        businessName: 'Alex Fitness Studio',
        slug: 'alex-johnson',
      }
    : (slugOverride ? { ...DEMO_PROVIDER, slug: slugOverride } : DEMO_PROVIDER);

  return {
    auth: {
      isAuthenticated: true,
      isDemoMode: true,
      user: provider,
    },
    provider,
    services: DEMO_SERVICES,
    availability: DEMO_AVAILABILITY,
    bookings: DEMO_BOOKINGS,
    customers: DEMO_CUSTOMERS,
    policies: DEMO_POLICIES,
    reminderSettings: DEMO_REMINDER_SETTINGS,
    analytics: DEMO_ANALYTICS,
    googleCalendar: {
      isConnected: false,
      email: null,
    },
  };
}

