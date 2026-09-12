-- =============================================================================
-- BookUp — Add Management Token Hash Column to Bookings Table
-- Run this in your Supabase SQL Editor:
-- =============================================================================

alter table public.bookings add column if not exists management_token_hash text;
create index if not exists idx_bookings_management_token_hash on public.bookings(management_token_hash);

alter table public.bookings add column if not exists management_token text;
create index if not exists idx_bookings_management_token on public.bookings(management_token);

-- Table permissions for anon, authenticated, and service_role
grant select, update on public.bookings to anon, authenticated, service_role;
