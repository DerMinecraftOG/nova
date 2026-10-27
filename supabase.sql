-- Nova Social Plus – Supabase setup
-- Run in Supabase SQL Editor. Review any existing policies before replacing them.

create extension if not exists pgcrypto;

-- Public profile data
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  avatar_url text,
  bio text not null default '',
  verified boolean not null default false,
  red_verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles add column if not exists verified boolean not null default false;
alter table public.profiles add column if not exists red_verified boolean not null default false;
alter table public.profiles add column if not exists avatar_url text;

-- Posts support text and an optional image URL.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  image_url text,
  created_at timestamptz not null default now(),
  constraint posts_content_or_image check (length(trim(content)) > 0 or image_url is not null)
);
alter table public.posts add column if not exists image_url text;

create table if not exists public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id,user_id)
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id,following_id),
  constraint follows_not_self check (follower_id <> following_id)
);

-- Create a profile when a new auth account is created.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  chosen_username text;
begin
  chosen_username := lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));
  chosen_username := regexp_replace(chosen_username, '[^a-z0-9_]', '', 'g');
  if length(chosen_username) < 3 then
    chosen_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  insert into public.profiles (id, username)
  values (new.id, chosen_username)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_nova on auth.users;
create trigger on_auth_user_created_nova
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Protect verification flags: users cannot change their own badge fields through the browser.
-- SQL Editor/admin operations (where auth.uid() is null) can update these fields.
create or replace function public.protect_nova_badges()
returns trigger language plpgsql
as $$
begin
  if auth.uid() is not null and auth.uid() = old.id
     and (new.verified is distinct from old.verified
       or new.red_verified is distinct from old.red_verified) then
    raise exception 'Verification badges can only be changed by an administrator.';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_nova_badges_trigger on public.profiles;
create trigger protect_nova_badges_trigger
before update on public.profiles
for each row execute procedure public.protect_nova_badges();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.follows enable row level security;

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable" on public.profiles for select using (true);
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Posts are publicly readable" on public.posts;
create policy "Posts are publicly readable" on public.posts for select using (true);
drop policy if exists "Authenticated users can create own posts" on public.posts;
create policy "Authenticated users can create own posts" on public.posts for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can delete own posts" on public.posts;
create policy "Users can delete own posts" on public.posts for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Likes are publicly readable" on public.likes;
create policy "Likes are publicly readable" on public.likes for select using (true);
drop policy if exists "Users can like as themselves" on public.likes;
create policy "Users can like as themselves" on public.likes for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can remove own likes" on public.likes;
create policy "Users can remove own likes" on public.likes for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Follows are publicly readable" on public.follows;
create policy "Follows are publicly readable" on public.follows for select using (true);
drop policy if exists "Users can follow as themselves" on public.follows;
create policy "Users can follow as themselves" on public.follows for insert to authenticated with check (auth.uid() = follower_id and follower_id <> following_id);
drop policy if exists "Users can unfollow as themselves" on public.follows;
create policy "Users can unfollow as themselves" on public.follows for delete to authenticated using (auth.uid() = follower_id);

-- Storage buckets. Public read allows everyone to view uploaded profile/post images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Public can view Nova images" on storage.objects;
create policy "Public can view Nova images" on storage.objects for select using (bucket_id in ('avatars','post-images'));
drop policy if exists "Users upload images to own folder" on storage.objects;
create policy "Users upload images to own folder" on storage.objects for insert to authenticated
with check (bucket_id in ('avatars','post-images') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users update own Nova images" on storage.objects;
create policy "Users update own Nova images" on storage.objects for update to authenticated
using (bucket_id in ('avatars','post-images') and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id in ('avatars','post-images') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users delete own Nova images" on storage.objects;
create policy "Users delete own Nova images" on storage.objects for delete to authenticated
using (bucket_id in ('avatars','post-images') and (storage.foldername(name))[1] = auth.uid()::text);

-- Admin-only badge changes: run these statements manually in SQL Editor.
-- UPDATE public.profiles SET verified = true WHERE username = 'username';
-- UPDATE public.profiles SET verified = false WHERE username = 'username';
-- UPDATE public.profiles SET red_verified = true WHERE username = 'username';
-- UPDATE public.profiles SET red_verified = false WHERE username = 'username';
