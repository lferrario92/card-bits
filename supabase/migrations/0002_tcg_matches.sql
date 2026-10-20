-- ===========================================================================
-- 0002_tcg_matches.sql
-- One row per PvP match: lobby (code + seats), authoritative battle state,
-- and the final result.
--
-- HOW TO RUN: Supabase Dashboard > SQL Editor > New query > paste > Run.
-- Run AFTER 0001_tcg_profiles.sql (see supabase/README.md).
-- ===========================================================================

create table if not exists public.tcg_matches (
  id          uuid primary key default gen_random_uuid(),
  -- Short code typed by the joining player (uppercase, e.g. "K7QX2M").
  code        text        not null unique,
  -- waiting  : host created it, nobody joined yet
  -- playing  : both seats filled, battle in progress
  -- finished : winner recorded
  status      text        not null default 'waiting'
              check (status in ('waiting', 'playing', 'finished')),
  host_id     uuid        not null references auth.users (id) on delete cascade,
  host_name   text        not null default '',
  guest_id    uuid        references auth.users (id) on delete set null,
  guest_name  text,
  -- Full serialised BattleState written by the HOST after every action.
  state       jsonb,
  -- Which seat currently holds the turn: 'host' | 'guest'.
  turn        text        check (turn in ('host', 'guest')),
  -- Winning user id (winner seat disconnects are recorded as a normal win for
  -- the remaining player). NULL + status = 'finished' means a draw.
  winner      uuid,
  winner_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists tcg_matches_status_idx on public.tcg_matches (status);
create index if not exists tcg_matches_host_idx   on public.tcg_matches (host_id);
create index if not exists tcg_matches_guest_idx  on public.tcg_matches (guest_id);
create index if not exists tcg_matches_code_idx   on public.tcg_matches (code);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
drop trigger if exists tcg_matches_touch on public.tcg_matches;
create trigger tcg_matches_touch
  before update on public.tcg_matches
  for each row execute function public.tcg_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Join by code. SECURITY DEFINER so a not-yet-participant may claim a waiting
-- match without needing SELECT rights on every waiting row (which would leak
-- codes). The WHERE clause makes the claim atomic: a second joiner finds
-- guest_id already set and gets 0 rows.
-- ---------------------------------------------------------------------------
create or replace function public.tcg_join_match(p_code text, p_guest_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.tcg_matches
     set guest_id    = auth.uid(),
         guest_name  = coalesce(nullif(trim(p_guest_name), ''), 'Opponent'),
         status      = 'playing',
         updated_at  = now()
   where code = upper(trim(p_code))
     and status = 'waiting'
     and guest_id is null
     and host_id <> auth.uid()
  returning id into v_id;

  if v_id is null then
    raise exception 'Match not found, already full, or it is your own match.';
  end if;

  return v_id;
end;
$$;

revoke all on function public.tcg_join_match(text, text) from public;
grant execute on function public.tcg_join_match(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Authority guard.
--
-- This app uses HOST-CLIENT authority: the host's browser runs the battle and
-- writes `state`. The guard makes sure only the host can write the outcome,
-- while the only thing a guest may ever do is claim a waiting match.
-- ---------------------------------------------------------------------------
create or replace function public.tcg_matches_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Claiming a free match: the join path goes through tcg_join_match.
  if old.status = 'waiting'
     and old.guest_id is null
     and new.guest_id is not null
     and new.guest_id = v_uid
     and new.host_id = old.host_id then
    return new;
  end if;

  if v_uid <> old.host_id then
    raise exception 'Only the match host may write battle state';
  end if;

  return new;
end;
$$;

drop trigger if exists tcg_matches_guard on public.tcg_matches;
create trigger tcg_matches_guard
  before update on public.tcg_matches
  for each row execute function public.tcg_matches_guard();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.tcg_matches enable row level security;

drop policy if exists "tcg_matches_select_participants" on public.tcg_matches;
create policy "tcg_matches_select_participants"
  on public.tcg_matches for select
  to authenticated
  using (host_id = auth.uid() or guest_id = auth.uid());

drop policy if exists "tcg_matches_insert_host" on public.tcg_matches;
create policy "tcg_matches_insert_host"
  on public.tcg_matches for insert
  to authenticated
  with check (host_id = auth.uid());

drop policy if exists "tcg_matches_update_participants" on public.tcg_matches;
create policy "tcg_matches_update_participants"
  on public.tcg_matches for update
  to authenticated
  using (host_id = auth.uid() or guest_id = auth.uid())
  with check (host_id = auth.uid() or guest_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime. Required for `postgres_changes` row subscriptions (used as the
-- safety net when the guest claims a match, and for reconnect recovery).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname    = 'supabase_realtime'
       and schemaname = 'public'
       and tablename  = 'tcg_matches'
  ) then
    alter publication supabase_realtime add table public.tcg_matches;
  end if;
end $$;

-- Deliver the full old row on UPDATE so clients can diff status/state changes.
alter table public.tcg_matches replica identity full;
