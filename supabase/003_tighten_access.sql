-- =====================================================================
-- Chariot v2: migration 003 - tighten access (code review fixes)
-- Run in the Supabase SQL Editor AFTER 002_driver_verification.sql.
--
-- Addresses three issues from a code review:
--   1. License/insurance paths lived on the world-readable profiles table.
--   2. apply_as_driver() accepted any file path (path tampering).
--   3. Riders could edit more than status when cancelling a ride.
-- (A fourth issue, the home screen ignoring load errors, is fixed in the app.)
-- =====================================================================

-- ---------- 1. Move driver documents off the public profiles table ----------
-- profiles is readable by every signed-in user (so riders can see driver
-- names), which means document paths stored there leak to everyone. Give the
-- documents their own table that only the owner and admins can read.
create table public.driver_documents (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  license_path   text not null,
  insurance_path text not null,
  updated_at     timestamptz not null default now()
);

alter table public.driver_documents enable row level security;

create policy "owner or admin reads driver documents"
  on public.driver_documents for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.is_admin)
  );
-- No insert/update policy on purpose: users never write this table directly.
-- Only apply_as_driver() (SECURITY DEFINER) writes it, after validation.

-- Carry over any rows that already exist, then drop the leaky columns.
insert into public.driver_documents (user_id, license_path, insurance_path)
  select id, license_path, insurance_path
  from public.profiles
  where license_path is not null and insurance_path is not null
  on conflict (user_id) do nothing;

alter table public.profiles
  drop column if exists license_path,
  drop column if exists insurance_path;

-- ---------- 2. apply_as_driver(): validate paths + write the new table ----------
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
  prefix text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to apply.';
  end if;
  if p_seats is null or p_seats < 1 or p_seats > 7 then
    raise exception 'Seats must be between 1 and 7.';
  end if;

  -- Files must live inside THIS user's own storage folder: <uid>/...
  -- This stops a user pointing their application at someone else's files.
  prefix := auth.uid()::text || '/';
  if coalesce(p_license_path, '') not like prefix || '%'
     or coalesce(p_insurance_path, '') not like prefix || '%' then
    raise exception 'Document paths must be inside your own folder.';
  end if;

  update public.profiles
     set car_desc      = p_car_desc,
         plate         = p_plate,
         seats         = p_seats,
         driver_status = 'pending',
         applied_at    = now()
   where id = auth.uid()
     and driver_status in ('none', 'rejected')
  returning * into result;

  if result.id is null then
    raise exception 'You already have a driver application in progress.';
  end if;

  insert into public.driver_documents (user_id, license_path, insurance_path)
  values (auth.uid(), p_license_path, p_insurance_path)
  on conflict (user_id) do update
    set license_path   = excluded.license_path,
        insurance_path = excluded.insurance_path,
        updated_at     = now();

  return result;
end;
$$;

-- ---------- 3. Riders may only change a ride's status ----------
-- The cancel policy checked the new status, but a rider could still edit other
-- columns (driver_id, pickup, labels) in the same update. Column privileges
-- make status the only column a rider can write; accept_ride() (SECURITY
-- DEFINER) still sets driver_id and timestamps on the driver's behalf.
revoke update on public.rides from authenticated;
grant update (status) on public.rides to authenticated;
