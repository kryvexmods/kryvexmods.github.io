-- Run this file in Supabase Dashboard > SQL Editor.
-- Public visitors can read published content. Only a signed-in user whose
-- app_metadata.role is "admin" can create, edit, or delete content and images.
-- Setup walkthrough: supabase-configuracion.html

create table if not exists public.mods (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  mega_url text not null check (mega_url ~ '^https://(www\.)?mega\.(nz|co\.nz)/'),
  image_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.work_photos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  image_path text not null,
  created_at timestamptz not null default now()
);

alter table public.mods enable row level security;
alter table public.work_photos enable row level security;

grant select on public.mods, public.work_photos to anon, authenticated;
grant insert, update, delete on public.mods, public.work_photos to authenticated;

drop policy if exists "Public can read mods" on public.mods;
create policy "Public can read mods"
  on public.mods for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins manage mods" on public.mods;
create policy "Admins manage mods"
  on public.mods for all
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Public can read work photos" on public.work_photos;
create policy "Public can read work photos"
  on public.work_photos for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins manage work photos" on public.work_photos;
create policy "Admins manage work photos"
  on public.work_photos for all
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-media',
  'site-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view site media" on storage.objects;
create policy "Public can view site media"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'site-media');

drop policy if exists "Admins manage site media" on storage.objects;
create policy "Admins manage site media"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'site-media'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    bucket_id = 'site-media'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- After creating your account in Authentication > Users, set your email here
-- and run this separately. Then sign out and back in to refresh your token.
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'TU_EMAIL_DE_ADMIN';
