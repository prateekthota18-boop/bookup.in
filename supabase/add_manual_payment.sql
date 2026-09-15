-- ==============================================================================
-- BookUp — Manual Payment Verification Migration
-- Adds UPI payment fields to providers, payment verification tracking to bookings,
-- RLS policies for payment status transitions, and a private storage bucket for
-- payment screenshot uploads.
--
-- This migration is additive only. It does NOT modify existing slot-reservation
-- behavior, booking status values, or any other existing columns/functions.
-- ==============================================================================

-- =============================================================================
-- 1. PROVIDER TABLE: Add UPI payment fields
-- =============================================================================

alter table public.providers
  add column if not exists upi_id text default null,
  add column if not exists qr_code_url text default null;

comment on column public.providers.upi_id is
  'Provider UPI ID (e.g. name@upi) for direct customer-to-coach payments. Displayed on the customer booking confirmation page.';

comment on column public.providers.qr_code_url is
  'URL of the provider UPI QR code image stored in Supabase Storage. Displayed alongside upi_id on the customer booking page.';

-- =============================================================================
-- 2. BOOKINGS TABLE: Add payment verification tracking columns
-- =============================================================================

alter table public.bookings
  add column if not exists payment_status text default 'awaiting_payment',
  add column if not exists payment_screenshot_url text default null,
  add column if not exists payment_marked_paid_at timestamptz default null,
  add column if not exists payment_confirmed_at timestamptz default null,
  add column if not exists payment_rejected_at timestamptz default null,
  add column if not exists payment_rejected_reason text default null;

comment on column public.bookings.payment_status is
  'Payment verification state: not_required (free), awaiting_payment (default for paid), verification_pending (customer clicked I''ve Paid), confirmed (provider verified), rejected (provider rejected).';

comment on column public.bookings.payment_screenshot_url is
  'URL of customer-uploaded payment screenshot stored in private Supabase Storage bucket payment-screenshots.';

comment on column public.bookings.payment_marked_paid_at is
  'Timestamp when customer marked the booking as paid (clicked I''ve Paid).';

comment on column public.bookings.payment_confirmed_at is
  'Timestamp when provider confirmed the payment was received.';

comment on column public.bookings.payment_rejected_at is
  'Timestamp when provider rejected the payment claim.';

comment on column public.bookings.payment_rejected_reason is
  'Provider-supplied reason for rejecting the payment claim.';

-- =============================================================================
-- 3. INDEXES for efficient dashboard queries
-- =============================================================================

create index if not exists idx_bookings_payment_status
  on public.bookings (provider_id, payment_status);

-- =============================================================================
-- 4. BACKFILL: Set payment_status for existing bookings
-- =============================================================================

-- Free bookings (price = 0) -> 'not_required'
update public.bookings
  set payment_status = 'not_required'
  where price = 0 and payment_status = 'awaiting_payment';

-- Existing confirmed/completed paid bookings that predate this feature -> 'not_required'
-- (they were already confirmed without this flow, so they don't need payment verification)
update public.bookings
  set payment_status = 'not_required'
  where price > 0
    and status in ('confirmed', 'completed')
    and payment_status = 'awaiting_payment';

-- Cancelled/no-show bookings -> 'not_required' (irrelevant)
update public.bookings
  set payment_status = 'not_required'
  where status in ('cancelled', 'late-cancellation', 'no-show')
    and payment_status = 'awaiting_payment';

-- =============================================================================
-- 5. STORAGE BUCKET: Private bucket for payment screenshots
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-screenshots',
  'payment-screenshots',
  false,
  10485760, -- 10MB limit
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Storage Policies: service_role can upload (server-side only; customers upload via backend API)
-- Authenticated providers can read screenshots for their own bookings
create policy if not exists "Service role can manage payment screenshots"
  on storage.objects for all
  using (bucket_id = 'payment-screenshots')
  with check (bucket_id = 'payment-screenshots');

-- =============================================================================
-- 6. CHECK CONSTRAINT: Valid payment_status values
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'bookings_payment_status_check'
  ) then
    alter table public.bookings
      add constraint bookings_payment_status_check
      check (payment_status in ('not_required', 'awaiting_payment', 'verification_pending', 'confirmed', 'rejected'));
  end if;
end $$;
