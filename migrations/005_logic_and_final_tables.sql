-- Migration: Update database logic for archive_map and check_auto_approvals
-- Phase: 5
-- Date: 2026-04-13

-- 1. Update RPC archive_map
-- This function is used by root/edit.html to "archive" an old battlemap version.
-- Target changed from 'maps' (legacy) to 'CCS_battlemaps'.
CREATE OR REPLACE FUNCTION public.archive_map(map_id integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  update public.CCS_battlemaps 
  set is_approved = false 
  where id = map_id;
$$;

-- 2. Update Trigger Function check_auto_approvals
-- This function is used to automatically approve submissions from admin users.
-- Target changed from 'admin_users' (legacy) to 'CCS_discord_users'.
CREATE OR REPLACE FUNCTION public.check_auto_approvals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
begin
  -- Check if the submitter exists in CCS_discord_users and has the 'Admin' role
  -- Note: roles is a jsonb array of strings.
  if exists (
    select 1 from public.CCS_discord_users 
    where user_id = NEW.submitted_by
    and roles @> '["Admin"]'::jsonb
  ) then
    NEW.is_approved := true;
  else
    NEW.is_approved := false;
  end if;
  return NEW;
end;
$$;
