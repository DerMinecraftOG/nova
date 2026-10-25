-- Nova: Ergänzungen für Antworten und Profilbilder.
-- Diese Datei ist zusätzlich zu den Tabellen/RLS-Regeln aus deinem bisherigen Setup gedacht.

alter table public.profiles
  add column if not exists avatar_url text;

create table if not exists public.replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 280),
  created_at timestamptz not null default now()
);

create index if not exists replies_post_id_idx
  on public.replies(post_id, created_at);

alter table public.profiles enable row level security;
alter table public.replies enable row level security;

grant update (avatar_url) on public.profiles to authenticated;
grant select, insert, delete on public.replies to authenticated;
grant select on public.replies to anon;

drop policy if exists "Update own profile avatar" on public.profiles;
create policy "Update own profile avatar"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "Read replies" on public.replies;
create policy "Read replies"
on public.replies for select to anon, authenticated
using (true);

drop policy if exists "Create own replies" on public.replies;
create policy "Create own replies"
on public.replies for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.posts where posts.id = replies.post_id)
);

drop policy if exists "Delete own replies" on public.replies;
create policy "Delete own replies"
on public.replies for delete to authenticated
using (user_id = (select auth.uid()));

-- Storage-Bucket "avatars" zuerst im Dashboard erstellen und als Public markieren.
drop policy if exists "Users upload own avatar folder" on storage.objects;
create policy "Users upload own avatar folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users update own avatar folder" on storage.objects;
create policy "Users update own avatar folder"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users delete own avatar folder" on storage.objects;
create policy "Users delete own avatar folder"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Anyone can view avatars" on storage.objects;
create policy "Anyone can view avatars"
on storage.objects for select to anon, authenticated
using (bucket_id = 'avatars');
