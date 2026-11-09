-- =====================================================================
-- Chariot v2: migration 002 - driver verification + security gate
-- Run in the Supabase SQL Editor AFTER 001_schema.sql.
--
-- Goal: a user cannot drive riders around until a real person has checked
-- their license and insurance. "Driver" stops being a boolean a user can set
-- on themselves and becomes a reviewed status that only an admin can grant.
-- =====================================================================

-- ---------- 1. Driver status as a reviewed state, not a toggle ----------
-- none      = regular rider, has not applied
-- pending   = applied, documents uploaded, waiting on review
-- approved  = reviewed and allowed to drive
-- rejected  = reviewed and denied (may re-apply)
create type public.driver_status as enum ('none', 'pending', 'approved', 'rejected');

-- One policy on rides referenced the old is_driver column, so drop it before
-- we drop the column, then recreate it against the new status further down.
drop policy if exists "see own or open rides" on public.rides;

alter table public.profiles drop column if exists is_driver;

alter table public.profiles
  add column driver_status  public.driver_status not null default 'none',
  add column is_admin       boolean not null default false,
  add column plate          text,                 -- license plate, e.g. "7ABC123"
  add column license_path   text,                 -- path inside the driver-docs bucket
  add column insurance_path text,
  add column applied_at     timestamptz,
  add column reviewed_at    timestamptz;

-- Recreate the rides read policy: a driver only sees open requests once approved.
create policy "see own or open rides"
  on public.rides for select to authenticated
  using (
    rider_id = auth.uid()
    or driver_id = auth.uid()
    or (status = 'requested'
        and exists (select 1 from public.profiles p
                    where p.id = auth.uid() and p.driver_status = 'approved'))
  );

-- ---------- 2. Users may edit their info, but never their own status ----------
-- RLS controls which ROWS you may touch. Column privileges control which
-- COLUMNS. We remove blanket update, then grant back only the safe columns.
-- This makes it impossible for a user to set driver_status = 'approved' or
-- is_admin = true on themselves, even with a hand-crafted API call.
revoke update on public.profiles from authenticated;
grant update (full_name, car_desc, seats, plate) on public.profiles to authenticated;

-- ---------- 3. Apply to drive (user-initiated) ----------
-- A signed-in user submits their documents and moves themselves to 'pending'.
-- SECURITY DEFINER lets this function write driver_status even though the
-- user's own role cannot. It validates everything before writing.
create or replace function public.apply_as_driver(
  p_car_desc       text,
  p_plate          text,
  p_seats          int,
  p_license_path   text,
  p_insurance_path text
) returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare
  result public.profiles;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to apply.';
  end if;
  if p_seats is null or p_seats < 1 or p_seats > 7 then
    raise exception 'Seats must be between 1 and 7.';
  end if;
  if coalesce(trim(p_license_path), '') = ''
     or coalesce(trim(p_insurance_path), '') = '' then
    raise exception 'A license photo and an insurance photo are both required.';
  end if;

  update public.profiles
     set car_desc       = p_car_desc,
         plate          = p_plate,
         seats          = p_seats,
         license_path   = p_license_path,
         insurance_path = p_insurance_path,
         driver_status  = 'pending',
         applied_at     = now()
   where id = auth.uid()
     and driver_status in ('none', 'rejected')   -- block re-apply while pending/approved
  returning * into result;

  if result.id is null then
    raise exception 'You already have a driver application in progress.';
  end if;
  return result;
end;
$$;

-- ---------- 4. Review an application (admin-initiated) ----------
-- Only an admin may approve or reject. Bootstrap your own admin flag once in
-- the Supabase dashboard:
--   update public.profiles set is_admin = true where id = '<your-user-id>';
create or replace function public.review_driver(p_user uuid, p_approve boolean)
returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare
  result public.profiles;
begin
  if not exists (select 1 from public.profiles
                 where id = auth.uid() and is_admin) then
    raise exception 'Only an admin can review driver applications.';
  end if;

  update public.profiles
     set driver_status = case when p_approve then 'approved'::public.driver_status
                              else 'rejected'::public.driver_status end,
         reviewed_at   = now()
   where id = p_user
     and driver_status = 'pending'
  returning * into result;

  if result.id is null then
    raise exception 'That user does not have a pending application.';
  end if;
  return result;
end;
$$;

-- ---------- 5. Only approved drivers can accept rides or go online ----------
-- accept_ride() previously checked is_driver; now it requires 'approved'.
create or replace function public.accept_ride(ride uuid)
returns public.rides
language plpgsql security definer set search_path = ''
as $$
declare
  result public.rides;
begin
  if not exists (select 1 from public.profiles
                 where id = auth.uid() and driver_status = 'approved') then
    raise exception 'Only approved drivers can accept rides.';
  end if;

  update public.rides
     set driver_id = auth.uid(), status = 'accepted', accepted_at = now()
   where id = ride and status = 'requested' and driver_id is null
  returning * into result;

  if result.id is null then
    raise exception 'Ride is no longer available.';
  end if;
  return result;
end;
$$;

-- Going online (writing to driver_locations) now also requires approval.
drop policy if exists "drivers upsert own location" on public.driver_locations;
create policy "approved drivers upsert own location"
  on public.driver_locations for all to authenticated
  using (
    driver_id = auth.uid()
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.driver_status = 'approved')
  )
  with check (
    driver_id = auth.uid()
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.driver_status = 'approved')
  );

-- ---------- 6. Private bucket for license + insurance photos ----------
-- public = false means there are no public URLs; the app reaches these only
-- through short-lived signed URLs it requests on the fly.
insert into storage.buckets (id, name, public)
values ('driver-docs', 'driver-docs', false)
on conflict (id) do nothing;

-- Each user can read/write only their own folder: driver-docs/<their uid>/...
create policy "users manage own driver docs"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'driver-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'driver-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins may read everyone's docs so they can review applications.
create policy "admins read all driver docs"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'driver-docs'
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.is_admin)
  );

-- ---------- 7. Let signed-in users call the new functions ----------
grant execute on function public.apply_as_driver(text, text, int, text, text) to authenticated;
grant execute on function public.review_driver(uuid, boolean) to authenticated;
