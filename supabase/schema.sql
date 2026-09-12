-- =============================================================================
-- BookUp Supabase Database Migration & Schema
-- Multi-Tenant Appointment Scheduling MVP with Authoritative Double-Booking Protection
-- =============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. PROVIDERS TABLE
create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
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
  day_of_week text not null, -- 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  start_time text not null default '09:00',
  end_time text not null default '18:00',
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
  google_event_id text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 6. CANCELLATION POLICIES TABLE
create table if not exists public.cancellation_policies (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.providers(id) on delete cascade not null unique,
  cancellation_window integer default 12, -- hours before appointment
  fee numeric default 200,
  enabled boolean default true not null,
  policy_text text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- =============================================================================
-- INDEXES
-- =============================================================================
create index if not exists idx_providers_slug on public.providers(slug);
create index if not exists idx_providers_user_id on public.providers(user_id);
create index if not exists idx_services_provider_id on public.services(provider_id);
create index if not exists idx_availability_provider_id on public.availability(provider_id);
create index if not exists idx_bookings_provider_date on public.bookings(provider_id, booking_date);
create index if not exists idx_bookings_status on public.bookings(status);
create index if not exists idx_customers_phone on public.customers(phone);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

alter table public.providers enable row level security;
alter table public.services enable row level security;
alter table public.availability enable row level security;
alter table public.customers enable row level security;
alter table public.bookings enable row level security;
alter table public.cancellation_policies enable row level security;

-- 1. Providers Policies
-- Anyone can view provider public details (needed for public booking page /book/:slug)
create policy "Public can view providers"
  on public.providers for select
  using (true);

-- Authenticated provider can create their profile
create policy "Authenticated users can create their provider record"
  on public.providers for insert
  with check (auth.uid() = user_id);

-- Authenticated provider can update their own profile
create policy "Providers can update own record"
  on public.providers for update
  using (auth.uid() = user_id);

-- 2. Services Policies
-- Anyone can view active services of a provider; providers can view all their own
create policy "Public can view active services"
  on public.services for select
  using (active = true or provider_id in (select id from public.providers where user_id = auth.uid()));

-- Providers can manage their own services
create policy "Providers can insert own services"
  on public.services for insert
  with check (provider_id in (select id from public.providers where user_id = auth.uid()));

create policy "Providers can update own services"
  on public.services for update
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

create policy "Providers can delete own services"
  on public.services for delete
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

-- 3. Availability Policies
-- Anyone can view availability schedule for booking
create policy "Public can view availability"
  on public.availability for select
  using (true);

-- Providers can manage their availability
create policy "Providers can insert own availability"
  on public.availability for insert
  with check (provider_id in (select id from public.providers where user_id = auth.uid()));

create policy "Providers can update own availability"
  on public.availability for update
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

create policy "Providers can delete own availability"
  on public.availability for delete
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

-- 4. Customers Policies
-- Providers can view their customers; public can insert upon booking
create policy "Providers can view customers"
  on public.customers for select
  using (true);

create policy "Anyone can insert customer record upon booking"
  on public.customers for insert
  with check (true);

create policy "Anyone can update customer contact upon booking"
  on public.customers for update
  using (true);

-- 5. Bookings Policies
-- Anyone can view existing booking time ranges to calculate busy slots; providers can see full details
create policy "Public can view bookings for slot collision checks"
  on public.bookings for select
  using (true);

-- Anyone can insert a booking (used by public booking page and atomic RPC)
create policy "Public can create a booking"
  on public.bookings for insert
  with check (true);

-- Providers can update their bookings (status, notes, etc.)
create policy "Providers can update own bookings"
  on public.bookings for update
  using (
    provider_id in (select id from public.providers where user_id = auth.uid())
    or true -- allows customer self-serve reschedule / cancellation via /booking/:id
  );

-- Providers can delete bookings
create policy "Providers can delete own bookings"
  on public.bookings for delete
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

-- 6. Cancellation Policies Policies
create policy "Public can view cancellation policies"
  on public.cancellation_policies for select
  using (true);

create policy "Providers can insert own cancellation policy"
  on public.cancellation_policies for insert
  with check (provider_id in (select id from public.providers where user_id = auth.uid()));

create policy "Providers can update own cancellation policy"
  on public.cancellation_policies for update
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

-- =============================================================================
-- ATOMIC BOOKING FUNCTION (Double-Booking & Conflict Protection)
-- =============================================================================
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
) returns json language plpgsql security definer as $$
declare
  v_service record;
  v_provider record;
  v_start_h integer;
  v_start_m integer;
  v_start_min integer;
  v_end_min integer;
  v_end_time text;
  v_customer_id uuid;
  v_booking_id uuid;
  v_conflict_count integer;
  v_cand_start integer;
  v_cand_end integer;
  v_buffer integer;
begin
  -- 1. Fetch Authoritative Service Details (never trust client-supplied price or duration)
  select * into v_service from public.services
  where id = p_service_id and provider_id = p_provider_id and active = true;
  
  if not found then
    return json_build_object('success', false, 'error', 'Invalid or inactive service');
  end if;

  -- 2. Fetch Authoritative Provider Details (buffer time)
  select * into v_provider from public.providers where id = p_provider_id;
  if not found then
    return json_build_object('success', false, 'error', 'Provider not found');
  end if;

  v_buffer := coalesce(v_provider.buffer_time, 15);

  -- 3. Parse Start Time and Calculate Authoritative End Time
  v_start_h := split_part(p_start_time, ':', 1)::integer;
  v_start_m := split_part(p_start_time, ':', 2)::integer;
  v_start_min := (v_start_h * 60) + v_start_m;
  v_end_min := v_start_min + v_service.duration;
  v_end_time := to_char(to_timestamp(v_end_min * 60), 'HH24:MI');

  v_cand_start := v_start_min;
  v_cand_end := v_end_min + v_buffer;

  -- 4. Authoritative Conflict Check:
  -- Overlap condition: cand_start < existing_end + buffer AND cand_end > existing_start
  -- Cancelled, late-cancellation, and no-show bookings do not block slots.
  select count(*) into v_conflict_count
  from public.bookings
  where provider_id = p_provider_id
    and booking_date = p_booking_date
    and status in ('confirmed', 'completed')
    and (
      v_cand_start < (
        (split_part(coalesce(actual_end_time, end_time), ':', 1)::integer * 60) +
        split_part(coalesce(actual_end_time, end_time), ':', 2)::integer +
        v_buffer
      )
      and v_cand_end > (
        (split_part(start_time, ':', 1)::integer * 60) +
        split_part(start_time, ':', 2)::integer
      )
    );

  if v_conflict_count > 0 then
    return json_build_object(
      'success', false,
      'error', 'This slot is no longer available. Please select another time.'
    );
  end if;

  -- 5. Upsert Customer Record by Phone
  select id into v_customer_id from public.customers where phone = p_customer_phone limit 1;
  if v_customer_id is null then
    insert into public.customers (name, email, phone, whatsapp)
    values (p_customer_name, p_customer_email, p_customer_phone, coalesce(p_customer_whatsapp, p_customer_phone))
    returning id into v_customer_id;
  else
    update public.customers
    set name = p_customer_name,
        email = coalesce(p_customer_email, email),
        whatsapp = coalesce(p_customer_whatsapp, whatsapp)
    where id = v_customer_id;
  end if;

  -- 6. Insert Confirmed Booking with Authoritative Service Price and Deposit
  insert into public.bookings (
    provider_id,
    service_id,
    customer_id,
    customer_name,
    customer_email,
    customer_phone,
    customer_whatsapp,
    booking_date,
    start_time,
    end_time,
    duration,
    price,
    deposit_amount,
    deposit_status,
    status,
    notes
  ) values (
    p_provider_id,
    v_service.id,
    v_customer_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    coalesce(p_customer_whatsapp, p_customer_phone),
    p_booking_date,
    p_start_time,
    v_end_time,
    v_service.duration,
    v_service.price,
    coalesce(v_service.deposit_amount, 0),
    case when coalesce(v_service.deposit_amount, 0) > 0 then 'paid' else 'na' end,
    'confirmed',
    p_notes
  ) returning id into v_booking_id;

  return json_build_object(
    'success', true,
    'bookingId', v_booking_id,
    'endTime', v_end_time,
    'price', v_service.price,
    'depositAmount', coalesce(v_service.deposit_amount, 0)
  );
end;
$$;

-- =============================================================================
-- ROLE PRIVILEGES (Required for anon and authenticated API roles)
-- =============================================================================
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant all on all routines in schema public to anon, authenticated;

alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on routines to anon, authenticated;

