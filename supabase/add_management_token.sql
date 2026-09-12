-- =============================================================================
-- BookUp — Add Management Token Column to Bookings Table (Optional Enhancement)
-- Run this in your Supabase SQL Editor if you wish to index tokens directly:
-- =============================================================================

alter table public.bookings add column if not exists management_token text;
create index if not exists idx_bookings_management_token on public.bookings(management_token);

-- Table permissions for anon and service_role
grant select, update on public.bookings to anon, authenticated, service_role;
