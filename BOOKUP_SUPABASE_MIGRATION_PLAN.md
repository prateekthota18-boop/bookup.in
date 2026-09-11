# BOOKUP — SUPABASE BACKEND MIGRATION PLAN

## 1. Executive Summary
This document details the architectural migration of **BookUp** from a client-side prototype (relying on `localStorage` and simulated state) into a production-ready, multi-tenant scheduling application powered by **Supabase**.

The core objective is to allow a provider to register, configure services and availability, and have a public customer on an incognito window or separate device open `/book/:slug`, generate real-time collision-free slots, and confirm a booking that immediately persists to Supabase and displays on the provider's dashboard.

---

## 2. Current Architecture & Codebase Inspection

### 2.1 Current State Management & localStorage Usage
* **Single Storage Key**: `STORAGE_KEY = 'bookup_state'` in `src/data/store.jsx`.
* **Reducer & Context**: `StoreProvider` wraps the entire app in `src/App.jsx`.
* **Persistence Loop**: Every state change triggers a `useEffect` serializing the entire state object into `localStorage.setItem('bookup_state', ...)`.
* **Limitation**: Data is confined to the specific browser and origin. A customer on an incognito window or external phone opening `/book/:slug` cannot see custom services or real provider availability created on the provider's machine.

### 2.2 Existing Store Actions & Data Models

| Action Type | Current Purpose | Target Persistence |
| :--- | :--- | :--- |
| `LOGIN` | Sets `auth.isAuthenticated` | Supabase Auth (`supabase.auth.signInWithPassword`) |
| `SIGNUP` | Sets provider placeholder | Supabase Auth + `providers` table insertion |
| `LOGOUT` | Clears `localStorage` | Supabase Auth (`supabase.auth.signOut`) |
| `ENTER_DEMO` | Seeds mock data into store | Kept in local memory (isolated from Supabase) |
| `UPDATE_PROVIDER` | Updates provider bio, names, slug | `providers` table `UPDATE` |
| `ADD_SERVICE` | Appends service to local array | `services` table `INSERT` |
| `UPDATE_SERVICE` | Modifies service in local array | `services` table `UPDATE` |
| `DELETE_SERVICE` | Filters out service | `services` table `DELETE` / soft delete |
| `TOGGLE_SERVICE` | Inverts `isActive` | `services` table `UPDATE active = !active` |
| `UPDATE_AVAILABILITY` | Updates weekly schedule & buffers | `availability` table + `providers` buffer columns |
| `ADD_BOOKING` | Adds booking to local array | Supabase RPC / `bookings` + `customers` tables |
| `UPDATE_BOOKING` | Updates booking in local array | `bookings` table `UPDATE` |
| `CANCEL_BOOKING` | Sets status = 'cancelled' | `bookings` table `UPDATE status = 'cancelled'` |
| `RESCHEDULE_BOOKING` | Updates date, start/end time | `bookings` table `UPDATE` (with conflict check) |
| `MARK_COMPLETED` | Sets status = 'completed', early end | `bookings` table `UPDATE` |
| `MARK_NO_SHOW` | Sets status = 'no-show', deposit forfeited | `bookings` table `UPDATE` |
| `MARK_LATE_CANCELLATION`| Sets status = 'late-cancellation' | `bookings` table `UPDATE` |
| `DELETE_BOOKING` | Removes booking from array | `bookings` table `DELETE` |
| `UPDATE_POLICIES` | Updates cancellation window & fees | `cancellation_policies` table `UPSERT` |
| `SET_ONBOARDING_STEP` | Tracks wizard progress | Local UI state |
| `COMPLETE_ONBOARDING` | Marks onboarding done | Local UI state / provider flag |
| `ADD_TOAST` / `REMOVE_TOAST` | Flash notification queue | Local UI state |

### 2.3 Existing Entities & Schemas

1. **Provider**:
   * Current fields: `id`, `name`, `businessName`, `slug`, `email`, `phone`, `bio`, `createdAt`.
2. **Service**:
   * Current fields: `id`, `providerId`, `name`, `description`, `price`, `duration`, `depositAmount`, `isActive`, `createdAt`.
3. **Availability**:
   * Weekly schedule: `monday` through `sunday` with `{ available: boolean, start: 'HH:mm', end: 'HH:mm' }`.
   * Scheduling rules: `bufferTime` (mins), `minNotice` (hours), `maxAdvanceBooking` (days).
4. **Booking**:
   * Current fields: `id`, `providerId`, `serviceId`, `serviceName`, `customerId`, `customerName`, `customerPhone`, `customerEmail`, `customerWhatsApp`, `date`, `startTime`, `endTime`, `duration`, `price`, `depositAmount`, `depositStatus`, `status`, `actualEndTime`, `notes`, `createdAt`.
5. **Customer**:
   * Current fields: `id`, `name`, `phone`, `whatsapp`, `email`.
6. **Cancellation Policy**:
   * Current fields: `cancellationWindow`, `depositAmount`, `depositType`, `lateCancellationFee`, `noShowFee`, `policyText`.

### 2.4 Existing Slot Generation & Double-Booking Logic
* Implemented in `src/utils/helpers.js` (`generateTimeSlotsDetailed` and `getTimeSlotsDetailedForDate`).
* Computes candidate intervals `[T, T + duration + buffer)` at 15-minute granularity.
* Eliminates times earlier than `minNotice` on current date.
* Eliminates times exceeding provider closing time.
* Checks overlap against active bookings (`confirmed` and `completed` accounting for `actualEndTime` and `bufferTime`).
* Cancelled, no-show, and late-cancellation bookings do not block slots.

### 2.5 Demo Mode & Google Calendar Isolation
* **Demo Mode**: Triggered by `ACTIONS.ENTER_DEMO` or navigating to demo slugs (`priya-sharma`, `alex-johnson`, `demo`). Must be completely isolated: in demo mode, state reads from `createSeedState()` and NEVER executes Supabase mutations.
* **Google Calendar**: Exists in `server/services/googleCalendar.js` and `src/services/calendar/`. It will remain completely untouched and preserved.

---

## 3. Proposed Supabase Architecture & Schema

### 3.1 PostgreSQL Tables

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. PROVIDERS TABLE
create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  name text not null,
  business_name text,
  slug text not null unique,
  email text,
  phone text,
  timezone text default 'Asia/Kolkata',
  bio text,
  buffer_time integer default 15,
  min_notice integer default 2,
  max_advance_booking integer default 30,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 2. SERVICES TABLE
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.providers(id) on delete cascade not null,
  name text not null,
  description text,
  duration integer not null default 60, -- minutes
  price numeric not null default 0,
  deposit_amount numeric default 0,
  active boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 3. AVAILABILITY TABLE
create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.providers(id) on delete cascade not null,
  day_of_week text not null, -- 'monday', 'tuesday', ..., 'sunday'
  start_time time not null default '09:00',
  end_time time not null default '18:00',
  active boolean default true not null,
  created_at timestamptz default now() not null,
  unique (provider_id, day_of_week)
);

-- 4. CUSTOMERS TABLE
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text not null,
  whatsapp text,
  created_at timestamptz default now() not null
);

-- 5. BOOKINGS TABLE
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.providers(id) on delete cascade not null,
  service_id uuid references public.services(id) on delete restrict not null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  customer_email text,
  customer_phone text not null,
  customer_whatsapp text,
  booking_date date not null,
  start_time text not null, -- 'HH:mm'
  end_time text not null,   -- 'HH:mm'
  actual_end_time text,     -- 'HH:mm' for early completions
  duration integer not null default 60,
  price numeric not null default 0,
  deposit_amount numeric default 0,
  deposit_status text default 'paid',
  status text not null default 'confirmed', -- 'confirmed', 'completed', 'cancelled', 'no-show', 'late-cancellation'
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 6. CANCELLATION POLICIES TABLE
create table if not exists public.cancellation_policies (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.providers(id) on delete cascade not null unique,
  cancellation_window integer default 12, -- hours
  fee numeric default 200,
  enabled boolean default true not null,
  policy_text text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
```

### 3.2 Performance Indexes
```sql
create index if not exists idx_providers_slug on public.providers(slug);
create index if not exists idx_services_provider_id on public.services(provider_id);
create index if not exists idx_availability_provider_id on public.availability(provider_id);
create index if not exists idx_bookings_provider_date on public.bookings(provider_id, booking_date);
create index if not exists idx_bookings_status on public.bookings(status);
create index if not exists idx_customers_phone on public.customers(phone);
```

### 3.3 Authoritative Double-Booking Protection (PostgreSQL Function)
To prevent race conditions where two customers attempt to book the exact same slot simultaneously:
```sql
create or replace function public.create_booking_atomic(
  p_provider_id uuid,
  p_service_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_customer_whatsapp text,
  p_booking_date date,
  p_start_time text,
  p_notes text default ''
) returns json language plpgsql as $$
declare
  v_service record;
  v_provider record;
  v_start_min integer;
  v_end_min integer;
  v_end_time text;
  v_customer_id uuid;
  v_booking_id uuid;
  v_conflict_count integer;
  v_cand_start integer;
  v_cand_end integer;
begin
  -- 1. Fetch Authoritative Service Details
  select * into v_service from public.services
  where id = p_service_id and provider_id = p_provider_id and active = true;
  if not found then
    return json_build_object('success', false, 'error', 'Invalid or inactive service');
  end if;

  -- 2. Fetch Authoritative Provider Details
  select * into v_provider from public.providers where id = p_provider_id;
  if not found then
    return json_build_object('success', false, 'error', 'Provider not found');
  end if;

  -- 3. Calculate start & end minutes
  v_start_min := (split_part(p_start_time, ':', 1)::integer * 60) + split_part(p_start_time, ':', 2)::integer;
  v_end_min := v_start_min + v_service.duration;
  v_end_time := to_char(to_timestamp(v_end_min * 60), 'HH24:MI');

  v_cand_start := v_start_min;
  v_cand_end := v_end_min + coalesce(v_provider.buffer_time, 15);

  -- 4. Enforce Lock & Conflict Check
  -- Check any overlapping active bookings on this date for this provider
  select count(*) into v_conflict_count
  from public.bookings
  where provider_id = p_provider_id
    and booking_date = p_booking_date
    and status in ('confirmed', 'completed')
    and (
      v_cand_start < (
        (split_part(coalesce(actual_end_time, end_time), ':', 1)::integer * 60) +
        split_part(coalesce(actual_end_time, end_time), ':', 2)::integer +
        coalesce(v_provider.buffer_time, 15)
      )
      and v_cand_end > (
        (split_part(start_time, ':', 1)::integer * 60) +
        split_part(start_time, ':', 2)::integer
      )
    );

  if v_conflict_count > 0 then
    return json_build_object('success', false, 'error', 'This slot is no longer available. Please choose another time.');
  end if;

  -- 5. Upsert Customer
  select id into v_customer_id from public.customers where phone = p_customer_phone limit 1;
  if v_customer_id is null then
    insert into public.customers (name, email, phone, whatsapp)
    values (p_customer_name, p_customer_email, p_customer_phone, coalesce(p_customer_whatsapp, p_customer_phone))
    returning id into v_customer_id;
  else
    update public.customers
    set name = p_customer_name, email = coalesce(p_customer_email, email), whatsapp = coalesce(p_customer_whatsapp, whatsapp)
    where id = v_customer_id;
  end if;

  -- 6. Insert Authoritative Booking
  insert into public.bookings (
    provider_id, service_id, customer_id, customer_name, customer_email,
    customer_phone, customer_whatsapp, booking_date, start_time, end_time,
    duration, price, deposit_amount, deposit_status, status, notes
  ) values (
    p_provider_id, v_service.id, v_customer_id, p_customer_name, p_customer_email,
    p_customer_phone, coalesce(p_customer_whatsapp, p_customer_phone), p_booking_date, p_start_time, v_end_time,
    v_service.duration, v_service.price, coalesce(v_service.deposit_amount, 0),
    case when coalesce(v_service.deposit_amount, 0) > 0 then 'paid' else 'na' end,
    'confirmed', p_notes
  ) returning id into v_booking_id;

  return json_build_object('success', true, 'bookingId', v_booking_id);
end;
$$;
```

### 3.4 Row Level Security (RLS) Policies
1. **`providers`**:
   - `SELECT`: Public can read safe provider info (by slug or id).
   - `INSERT / UPDATE / DELETE`: Authenticated user where `auth.uid() = user_id`.
2. **`services`**:
   - `SELECT`: Public can read where `active = true`. Providers can read all their own.
   - `INSERT / UPDATE / DELETE`: Authenticated user where `provider_id in (select id from providers where user_id = auth.uid())`.
3. **`availability`**:
   - `SELECT`: Public can read.
   - `INSERT / UPDATE / DELETE`: Authenticated user matching `provider_id`.
4. **`bookings`**:
   - `SELECT`: Public can read booking times (anonymized for busy checks) or by reference ID for `/booking/:id`. Authenticated provider can read all own bookings.
   - `INSERT`: Allowed via RPC or public insert for new appointments.
   - `UPDATE`: Authenticated provider can update any status; public can cancel/reschedule their specific appointment ID if within policy window.
5. **`cancellation_policies`**:
   - `SELECT`: Public can read.
   - `INSERT / UPDATE`: Authenticated provider.

---

## 4. Files Requiring Modification & Creation

| File | Nature of Change | Details |
| :--- | :--- | :--- |
| `package.json` | Modification | Add `@supabase/supabase-js` dependency. |
| `.env.example` & `.env` | Modification | Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. |
| `src/services/supabase/supabaseClient.js` | **New File** | Initialize and export standard Supabase client with environment variables. |
| `src/services/supabase/dbService.js` | **New File** | Clean abstraction layer wrapping all Supabase queries, RPC calls, provider hydration, and appointment updates. |
| `supabase/schema.sql` | **New File** | Complete SQL migration script containing table definitions, RLS, indexes, and atomic booking RPC. |
| `src/data/store.jsx` | Modification | Support dual-mode state: Demo mode continues using local reducer state, while Real mode syncs and updates from Supabase. |
| `src/pages/Auth.jsx` | Modification | Connect Login and Signup forms to `supabase.auth.signInWithPassword` and `signUp`. |
| `src/pages/Onboarding.jsx` | Modification | Persist newly onboarded provider, initial service, availability schedule, and policies to Supabase. |
| `src/pages/booking/BookingPage.jsx` | Modification | Fetch live provider, active services, availability, and existing bookings directly from Supabase by slug for non-demo visits. |
| `src/pages/booking/CustomerBooking.jsx`| Modification | Fetch booking details by ID from Supabase and allow self-serve reschedule/cancellation in the database. |
| `src/pages/dashboard/Appointments.jsx`| Modification | Execute status changes (complete, reschedule, cancel, no-show, delete) against Supabase. |
| `src/pages/dashboard/Services.jsx` | Modification | Create, update, delete, and toggle services against Supabase. |
| `src/pages/dashboard/Availability.jsx`| Modification | Save availability schedule and buffer settings to Supabase. |
| `src/pages/dashboard/Policies.jsx` | Modification | Save cancellation policies and deposit rules to Supabase. |
| `src/layouts/DashboardLayout.jsx` | Modification | Handle Supabase session logout and provider profile display. |

---

## 5. Migration Strategy & Step-by-Step Implementation

1. **Step 1 — Environment & Supabase Client Setup**:
   - Install `@supabase/supabase-js`.
   - Setup `src/services/supabase/supabaseClient.js` with fallback error warnings if env variables are unset.
2. **Step 2 — Schema Definition**:
   - Provide the complete `supabase/schema.sql` file ready to execute in Supabase SQL editor.
3. **Step 3 — Database Service Layer (`dbService.js`)**:
   - Implements methods for:
     - `getProviderBySlug(slug)`
     - `getProviderDataForDashboard(userId)`
     - `createBookingAtomic(bookingData)`
     - `updateBookingStatus(bookingId, status, extra)`
     - `rescheduleBooking(bookingId, newDate, newStartTime, newEndTime)`
     - `saveServices(providerId, services)`
     - `saveAvailability(providerId, availability)`
     - `savePolicies(providerId, policies)`
4. **Step 4 — Auth Integration**:
   - Replace simulated submit in `Auth.jsx` with real Supabase Auth calls.
   - On login, fetch provider record and hydrate the store.
5. **Step 5 — Public Booking Page Hydration**:
   - In `BookingPage.jsx`, if `slug` is not a demo slug, fetch live data from Supabase.
   - Feed fetched data into the existing `getTimeSlotsDetailedForDate` engine without altering visual layout or UX.
6. **Step 6 — Authoritative Booking & Conflict Prevention**:
   - Connect booking form submission to `dbService.createBookingAtomic`.
   - In case of slot collision, notify client gracefully using the existing toast system.
7. **Step 7 — Dashboard Synchronization**:
   - On provider dashboard mount, subscribe to or load data from Supabase.
   - Propagate appointments, services, availability, and cancellation policies.
8. **Step 8 — Verification & Testing**:
   - Run `npm run build` and `npm run lint`.
   - Verify that demo mode remains functional while real mode operates against Supabase.

---

## 6. Risks & Mitigations

1. **Risk: Breaking Existing Demo Mode**
   - *Mitigation*: Isolate demo mode strictly using `isDemoMode` and `isDemoSlug(slug)`. If active, bypass all Supabase calls and use `createSeedState()` in-memory.
2. **Risk: Frontend Slot Calculation Mismatch with Database**
   - *Mitigation*: The database function (`create_booking_atomic`) mirrors the exact buffer and duration logic from `helpers.js` (`generateTimeSlotsDetailed`), ensuring 100% consistency.
3. **Risk: Missing Environment Variables in Production**
   - *Mitigation*: Provide helpful fallback logs and clear `.env.example` guidance.
4. **Risk: Overwriting Unsaved Local Data**
   - *Mitigation*: Existing localStorage keys are retained during demo mode; Supabase is used when a real user logs in or a public booking URL is accessed.
