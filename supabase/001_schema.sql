-- =====================================================================
-- Chariot v2: database schema (Supabase / Postgres + PostGIS)
-- Run once in the Supabase SQL Editor on a new project.
-- =====================================================================

-- PostGIS gives us geography points and distance queries.
create extension if not exists postgis;

-- ---------- 1. SJSU-only sign-up ----------
-- Runs before a new auth user is saved; rejects any non-@sjsu.edu email.
create or replace function public.enforce_sjsu_email()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.email is null or lower(new.email) not like '%@sjsu.edu' then
    raise exception 'Chariot is only open to @sjsu.edu email addresses';
  end if;
  return new;
end;
$$;

create trigger sjsu_email_only
  before insert on auth.users
  for each row execute function public.enforce_sjsu_email();

-- ---------- 2. Profiles ----------
-- One row per user, created automatically after sign-up.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  is_driver   boolean not null default false,
  car_desc    text,                       -- e.g. "Blue Honda Civic, 7ABC123"
  seats       int check (seats between 1 and 7),
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 3. Rides ----------
create type public.ride_status as enum
  ('requested', 'accepted', 'in_progress', 'completed', 'cancelled');

create table public.rides (
  id             uuid primary key default gen_random_uuid(),
  rider_id       uuid not null references public.profiles (id),
  driver_id      uuid references public.profiles (id),   -- null until accepted
  status         public.ride_status not null default 'requested',
  pickup         geography(Point, 4326) not null,
  dropoff        geography(Point, 4326) not null,
  pickup_label   text not null,                          -- e.g. "MLK Library"
  dropoff_label  text not null,
  requested_at   timestamptz not null default now(),
  accepted_at    timestamptz,
  completed_at   timestamptz
);

create index rides_pickup_idx on public.rides using gist (pickup);
create index rides_status_idx on public.rides (status);

-- ---------- 4. Live driver locations ----------
-- One row per driver, overwritten every few seconds while online.
create table public.driver_locations (
  driver_id   uuid primary key references public.profiles (id) on delete cascade,
  location    geography(Point, 4326) not null,
  is_online   boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- ---------- 5. Row Level Security ----------
alter table public.profiles         enable row level security;
alter table public.rides            enable row level security;
alter table public.driver_locations enable row level security;

-- Profiles: any signed-in student can read; you can only edit your own.
create policy "profiles readable by signed-in users"
  on public.profiles for select to authenticated using (true);
create policy "edit own profile"
  on public.profiles for update to authenticated using (id = auth.uid());

-- Rides: riders see their own; drivers see open requests and rides they took.
create policy "see own or open rides"
  on public.rides for select to authenticated
  using (
    rider_id = auth.uid()
    or driver_id = auth.uid()
    or (status = 'requested'
        and exists (select 1 from public.profiles p
                    where p.id = auth.uid() and p.is_driver))
  );
create policy "riders create their own rides"
  on public.rides for insert to authenticated
  with check (rider_id = auth.uid() and status = 'requested');
create policy "rider can cancel own ride"
  on public.rides for update to authenticated
  using (rider_id = auth.uid())
  with check (status = 'cancelled');
-- Drivers do NOT update rides directly; they go through accept_ride() below.

-- Driver locations: drivers write their own; riders read their driver's.
create policy "drivers upsert own location"
  on public.driver_locations for all to authenticated
  using (driver_id = auth.uid()) with check (driver_id = auth.uid());
create policy "rider sees assigned driver location"
  on public.driver_locations for select to authenticated
  using (exists (
    select 1 from public.rides r
    where r.driver_id = driver_locations.driver_id
      and r.rider_id = auth.uid()
      and r.status in ('accepted', 'in_progress')));

-- ---------- 6. Matching functions ----------
-- Open requests within radius_m meters of the driver, closest first.
create or replace function public.nearby_requests(lat float, lng float, radius_m int default 5000)
returns table (id uuid, pickup_label text, dropoff_label text, distance_m float, requested_at timestamptz)
language sql stable
as $$
  select r.id, r.pickup_label, r.dropoff_label,
         st_distance(r.pickup, st_point(lng, lat)::geography) as distance_m,
         r.requested_at
  from public.rides r
  where r.status = 'requested'
    and st_dwithin(r.pickup, st_point(lng, lat)::geography, radius_m)
  order by distance_m;
$$;

-- Accept a ride atomically: only succeeds if nobody else got it first.
create or replace function public.accept_ride(ride uuid)
returns public.rides
language plpgsql security definer set search_path = ''
as $$
declare
  result public.rides;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_driver) then
    raise exception 'Only drivers can accept rides';
  end if;

  update public.rides
     set driver_id = auth.uid(), status = 'accepted', accepted_at = now()
   where id = ride and status = 'requested' and driver_id is null
  returning * into result;

  if result.id is null then
    raise exception 'Ride is no longer available';
  end if;
  return result;
end;
$$;

-- ---------- 7. Realtime ----------
-- Stream ride status changes and driver locations to the app.
alter publication supabase_realtime add table public.rides, public.driver_locations;
