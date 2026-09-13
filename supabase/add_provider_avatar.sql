-- =============================================================================
-- Migration: Add avatar_url to providers and create public avatars storage bucket
-- =============================================================================

-- 1. Add avatar_url column to providers table
alter table public.providers
add column if not exists avatar_url text;

-- 2. Create public storage bucket for avatars if not exists
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB limit
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 3. Storage Policies: Allow public read access to avatars
create policy if not exists "Public Read Avatars"
on storage.objects for select
using (bucket_id = 'avatars');

-- 4. Storage Policies: Allow authenticated users to upload avatars
create policy if not exists "Allow Avatar Uploads"
on storage.objects for insert
with check (bucket_id = 'avatars');

-- 5. Storage Policies: Allow avatar updates
create policy if not exists "Allow Avatar Updates"
on storage.objects for update
using (bucket_id = 'avatars');
