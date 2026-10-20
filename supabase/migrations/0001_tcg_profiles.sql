-- ===========================================================================
-- 0001_tcg_profiles.sql
-- Public profile rows, one per Supabase auth user.
--
-- HOW TO RUN: Supabase Dashboard > SQL Editor > New query > paste > Run.
-- Run 0001 BEFORE 0002 (see supabase/README.md).
-- ===========================================================================

create table if not exists public.tcg_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text        not null default 'Player',
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Auto-create a profile whenever a new auth user is inserted.
-- The display name comes from the sign-up metadata (see useAuth.signUp) and
-- falls back to the part of the email before the "@".
-- ---------------------------------------------------------------------------
create or replace function public.tcg_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tcg_profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(coalesce(new.email, 'Player'), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists tcg_on_auth_user_created on auth.users;
create trigger tcg_on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.tcg_on_auth_user_created();

-- ---------------------------------------------------------------------------
-- Keep updated_at fresh.
-- ---------------------------------------------------------------------------
create or replace function public.tcg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tcg_profiles_touch on public.tcg_profiles;
create trigger tcg_profiles_touch
  before update on public.tcg_profiles
  for each row execute function public.tcg_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Profiles hold no email (that stays in auth.users), so any signed-in user
-- may read them. Writes are restricted to the owner.
-- ---------------------------------------------------------------------------
alter table public.tcg_profiles enable row level security;

drop policy if exists "tcg_profiles_select_authenticated" on public.tcg_profiles;
create policy "tcg_profiles_select_authenticated"
  on public.tcg_profiles for select
  to authenticated
  using (true);

drop policy if exists "tcg_profiles_insert_own" on public.tcg_profiles;
create policy "tcg_profiles_insert_own"
  on public.tcg_profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "tcg_profiles_update_own" on public.tcg_profiles;
create policy "tcg_profiles_update_own"
  on public.tcg_profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
