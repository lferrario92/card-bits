-- ===========================================================================
-- 0003_tcg_boosters.sql
-- Booster packs, card pools, user collections and the tcg_open_booster RPC.
-- Follows the reference project's open_booster logic.
--
-- HOW TO RUN: Supabase Dashboard > SQL Editor > New query > paste > Run.
-- Run AFTER 0001_tcg_profiles.sql (see supabase/README.md).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Add a credits balance to profiles so boosters have a price to pay with.
-- ---------------------------------------------------------------------------
alter table public.tcg_profiles
  add column if not exists credits integer not null default 0;

-- ---------------------------------------------------------------------------
-- tcg_cards : the master card catalogue (one row per unique card).
-- ---------------------------------------------------------------------------
create table if not exists public.tcg_cards (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  rarity      text        not null default 'Common',
  image       text,
  description text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tcg_boosters : purchasable booster pack definitions.
-- ---------------------------------------------------------------------------
create table if not exists public.tcg_boosters (
  id           uuid primary key default gen_random_uuid(),
  name         text        not null,
  description  text,
  price        integer     not null default 100,
  card_count   integer     not null default 5,
  cover_image  text,
  release_date timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tcg_booster_cards : which cards can appear in a booster, with a weight.
-- ---------------------------------------------------------------------------
create table if not exists public.tcg_booster_cards (
  id         uuid primary key default gen_random_uuid(),
  booster_id uuid not null references public.tcg_boosters (id) on delete cascade,
  card_id    uuid not null references public.tcg_cards (id) on delete cascade,
  weight     integer not null default 1,
  unique (booster_id, card_id)
);

-- ---------------------------------------------------------------------------
-- tcg_user_cards : a player's opened-card collection.
-- ---------------------------------------------------------------------------
create table if not exists public.tcg_user_cards (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  card_id   uuid not null references public.tcg_cards (id) on delete cascade,
  count     integer not null default 1,
  created_at timestamptz not null default now(),
  unique (user_id, card_id)
);

-- ---------------------------------------------------------------------------
-- tcg_open_booster(p_user_id, p_booster_id) -> jsonb
-- SECURITY DEFINER: deducts credits, rolls random cards from the booster's
-- weighted pool, inserts them into tcg_user_cards, returns the opened cards.
-- Mirrors the reference project's open_booster function.
-- ---------------------------------------------------------------------------
create or replace function public.tcg_open_booster(
  p_user_id    uuid,
  p_booster_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booster_id       uuid;
  v_booster_name     text;
  v_booster_price    integer := 100;
  v_card_count       integer := 5;
  v_user_credits     integer;
  v_card_ids         uuid[] := '{}';
  v_opened_cards     jsonb[] := '{}';
  v_rarity_weights   jsonb;
  v_rarity           text;
  v_i                integer;
  v_card_id          uuid;
  v_card_data        jsonb;
  v_error_message    text;
  v_random_value     float;
  v_total_weight     numeric;
  v_cumulative_weight numeric := 0;
  v_selected_rarity  text;
  v_booster_cards    jsonb;
  v_ce               jsonb;
  v_booster_total_weight numeric := 0;
  v_use_booster_cards boolean := false;
  v_j                integer;
begin
  -- Check the user exists and lock their profile row.
  select credits into v_user_credits
  from public.tcg_profiles
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'message', 'User not found',
      'error', 'User not found'
    );
  end if;

  -- If a booster id is provided, load its configuration.
  if p_booster_id is not null then
    select
      id,
      name,
      price,
      card_count
    into
      v_booster_id,
      v_booster_name,
      v_booster_price,
      v_card_count
    from public.tcg_boosters
    where id = p_booster_id;

    if not found then
      return jsonb_build_object(
        'success', false,
        'message', 'Booster not found',
        'error', 'Invalid booster id'
      );
    end if;

    -- Gather the booster's weighted card pool.
    select
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'rarity', c.rarity,
          'image', c.image,
          'description', c.description,
          'weight', coalesce(bc.weight, 1)
        )
      ) into v_booster_cards
    from public.tcg_booster_cards bc
    join public.tcg_cards c on bc.card_id = c.id
    where bc.booster_id = p_booster_id
      and c.id is not null;

    if v_booster_cards is not null and jsonb_array_length(v_booster_cards) > 0 then
      v_use_booster_cards := true;

      select sum((card->>'weight')::integer) into v_booster_total_weight
      from jsonb_array_elements(v_booster_cards) as card;

      if v_booster_total_weight <= 0 then
        v_booster_total_weight := 1;
      end if;
    end if;
  else
    v_booster_id := gen_random_uuid();
    v_booster_name := 'Standard Booster';
    v_booster_price := 100;
    v_card_count := 5;

    v_rarity_weights := jsonb_build_object(
      'Common', 10,
      'Uncommon', 5,
      'Rare', 3,
      'Epic', 2,
      'Legendary', 1,
      'Mythic', 0.5
    );
  end if;

  -- Ensure the user can afford it.
  if v_user_credits < v_booster_price then
    return jsonb_build_object(
      'success', false,
      'message', format('Not enough credits to open this booster. Needed: %s, Has: %s', v_booster_price, v_user_credits),
      'error', 'Insufficient credits',
      'booster_name', v_booster_name,
      'booster_price', v_booster_price,
      'current_credits', v_user_credits
    );
  end if;

  -- Deduct the price.
  update public.tcg_profiles
  set credits = credits - v_booster_price,
      updated_at = now()
  where id = p_user_id;

  -- Roll cards from the booster's weighted pool.
  if v_use_booster_cards then
    for i in 1..v_card_count loop
      v_random_value := random() * v_booster_total_weight;
      v_cumulative_weight := 0;

      -- Index-based iteration over the JSONB array (avoids FOR-over-query issues).
      for v_j in 0..jsonb_array_length(v_booster_cards) - 1 loop
        v_ce := v_booster_cards -> v_j;

        v_cumulative_weight := v_cumulative_weight + (v_ce->>'weight')::integer;

        if v_random_value <= v_cumulative_weight then
          v_card_data := v_ce;
          v_card_id := (v_ce->>'id')::uuid;

          if v_card_id is null then
            raise exception 'Invalid card id in booster %', v_booster_id;
          end if;

          insert into public.tcg_user_cards (user_id, card_id, count)
          values (p_user_id, v_card_id, 1)
          on conflict (user_id, card_id)
          do update set
            count = tcg_user_cards.count + 1,
            created_at = now();

          v_card_ids := array_append(v_card_ids, v_card_id);
          v_opened_cards := array_append(v_opened_cards, v_card_data);

          exit;
        end if;
      end loop;
    end loop;
  else
    -- Default rarity-weighted rolls.
    select sum(value::numeric) into v_total_weight
    from jsonb_each_text(v_rarity_weights);

    for i in 1..v_card_count loop
      v_random_value := random() * v_total_weight;
      v_cumulative_weight := 0;
      v_selected_rarity := 'Common';

      for v_rarity, v_cumulative_weight in
        select
          key as rarity,
          sum(value::numeric) over (order by key) as cumulative
        from jsonb_each_text(v_rarity_weights)
      loop
        if v_random_value <= v_cumulative_weight then
          v_selected_rarity := v_rarity;
          exit;
        end if;
      end loop;

      v_rarity := v_selected_rarity;

      select
        c.id,
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'rarity', c.rarity,
          'image', c.image,
          'description', c.description
        ) into v_card_id, v_card_data
      from public.tcg_cards c
      where c.rarity = v_rarity
      order by random()
      limit 1;

      if v_card_id is null then
        select
          c.id,
          jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'rarity', c.rarity,
            'image', c.image,
            'description', c.description
          ) into v_card_id, v_card_data
        from public.tcg_cards c
        order by random()
        limit 1;
      end if;

      if v_card_id is null then
        continue;
      end if;

      insert into public.tcg_user_cards (user_id, card_id, count)
      values (p_user_id, v_card_id, 1)
      on conflict (user_id, card_id)
      do update set
        count = tcg_user_cards.count + 1,
        created_at = now();

      v_card_ids := array_append(v_card_ids, v_card_id);
      v_opened_cards := array_append(v_opened_cards, v_card_data);
    end loop;
  end if;

  return jsonb_build_object(
    'success', true,
    'message', format('Successfully opened %s', v_booster_name),
    'cards', array_to_json(v_opened_cards)::jsonb,
    'card_ids', v_card_ids,
    'booster_id', v_booster_id,
    'booster_name', v_booster_name,
    'booster_price', v_booster_price,
    'new_balance', (select credits from public.tcg_profiles where id = p_user_id)
  );

exception when others then
  get stacked diagnostics v_error_message = message_text;
  return jsonb_build_object(
    'success', false,
    'message', 'Failed to open booster',
    'error', v_error_message,
    'booster_id', coalesce(v_booster_id, p_booster_id),
    'booster_name', coalesce(v_booster_name, 'Unknown')
  );
end;
$$;

revoke all on function public.tcg_open_booster(uuid, uuid) from public;
grant execute on function public.tcg_open_booster(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security.
-- ---------------------------------------------------------------------------
alter table public.tcg_cards enable row level security;
drop policy if exists "tcg_cards_select_authenticated" on public.tcg_cards;
create policy "tcg_cards_select_authenticated"
  on public.tcg_cards for select
  to authenticated
  using (true);

alter table public.tcg_boosters enable row level security;
drop policy if exists "tcg_boosters_select_authenticated" on public.tcg_boosters;
create policy "tcg_boosters_select_authenticated"
  on public.tcg_boosters for select
  to authenticated
  using (true);

alter table public.tcg_booster_cards enable row level security;
drop policy if exists "tcg_booster_cards_select_authenticated" on public.tcg_booster_cards;
create policy "tcg_booster_cards_select_authenticated"
  on public.tcg_booster_cards for select
  to authenticated
  using (true);

alter table public.tcg_user_cards enable row level security;
drop policy if exists "tcg_user_cards_select_own" on public.tcg_user_cards;
create policy "tcg_user_cards_select_own"
  on public.tcg_user_cards for select
  to authenticated
  using (auth.uid() = user_id);
drop policy if exists "tcg_user_cards_insert_own" on public.tcg_user_cards;
create policy "tcg_user_cards_insert_own"
  on public.tcg_user_cards for insert
  to authenticated
  with check (auth.uid() = user_id);
