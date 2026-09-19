-- =============================================================================
-- BookUp — Secure Management Token Hash & RLS Security Migration
-- Run this in your Supabase Dashboard -> SQL Editor
-- =============================================================================

-- 1. Ensure management_token_hash column and index exist
alter table public.bookings add column if not exists management_token_hash text;
create index if not exists idx_bookings_management_token_hash on public.bookings(management_token_hash);

-- 2. Drop insecure raw management_token column if previously added
alter table public.bookings drop column if exists management_token;
drop index if exists public.idx_bookings_management_token;

-- 3. Restrict Table-Level Permissions
-- Revoke direct SELECT, UPDATE, DELETE access on public.bookings from anon
revoke select, update, delete on public.bookings from anon;

-- Allow anon to create bookings (required for public booking page)
grant insert on public.bookings to anon;

-- Ensure authenticated providers and backend service_role have required access
grant select, insert, update, delete on public.bookings to authenticated, service_role;

-- 4. Enable Row Level Security (RLS) & Define Strict Policies
alter table public.bookings enable row level security;

-- Drop insecure legacy policies
drop policy if exists "Public can view bookings for slot collision checks" on public.bookings;
drop policy if exists "Providers can update own bookings" on public.bookings;
drop policy if exists "Public can update bookings" on public.bookings;
drop policy if exists "Public can view bookings" on public.bookings;
drop policy if exists "Providers can view own bookings" on public.bookings;
drop policy if exists "Public can create a booking" on public.bookings;
drop policy if exists "Providers can delete own bookings" on public.bookings;

-- Authenticated providers can view ONLY their own bookings
create policy "Providers can view own bookings"
  on public.bookings for select
  to authenticated
  using (
    provider_id in (select id from public.providers where user_id = auth.uid())
  );

-- Authenticated providers can update ONLY their own bookings
create policy "Providers can update own bookings"
  on public.bookings for update
  to authenticated
  using (
    provider_id in (select id from public.providers where user_id = auth.uid())
  )
  with check (
    provider_id in (select id from public.providers where user_id = auth.uid())
  );

-- Authenticated providers can delete ONLY their own bookings
create policy "Providers can delete own bookings"
  on public.bookings for delete
  to authenticated
  using (
    provider_id in (select id from public.providers where user_id = auth.uid())
  );

-- Public can insert new bookings
create policy "Public can create a booking"
  on public.bookings for insert
  to anon, authenticated
  with check (true);

-- 5. Helper Function for Provider Busy Slots (Sanitized, NO Customer PII)
create or replace function public.get_provider_busy_slots(
  p_provider_id uuid,
  p_booking_date date
)
returns table (
  start_time text,
  end_time text,
  actual_end_time text,
  status text
)
language sql
security definer
as $$
  select start_time, end_time, actual_end_time, status
  from public.bookings
  where provider_id = p_provider_id
    and booking_date = p_booking_date
    and status in ('confirmed', 'completed')
    and coalesce(payment_status, '') != 'rejected';
$$;

grant execute on function public.get_provider_busy_slots(uuid, date) to anon, authenticated, service_role;

-- 6. Updated Authoritative Atomic Booking Function Supporting management_token_hash
create or replace function public.create_booking_atomic(
  p_provider_id uuid,
  p_service_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_customer_whatsapp text,
  p_booking_date date,
  p_start_time text,
  p_notes text default '',
  p_management_token_hash text default null
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
  -- 1. Fetch Authoritative Service Details
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
  select count(*) into v_conflict_count
  from public.bookings
  where provider_id = p_provider_id
    and booking_date = p_booking_date
    and status in ('confirmed', 'completed')
    and coalesce(payment_status, '') != 'rejected'
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

  -- 6. Insert Confirmed Booking with management_token_hash (Never raw token)
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
    notes,
    management_token_hash
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
    p_notes,
    p_management_token_hash
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
