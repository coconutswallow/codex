-- Migration: Force mixed-case table names and update logic with quoted identifiers
-- Phase: 6
-- Date: 2026-04-13

-- 1. Rename Tables to force mixed-case
ALTER TABLE IF EXISTS ccs_discord_users RENAME TO "CCS_discord_users";
ALTER TABLE IF EXISTS ccs_discord_role_map RENAME TO "CCS_discord_role_map";
ALTER TABLE IF EXISTS ccs_system RENAME TO "CCS_system";
ALTER TABLE IF EXISTS ccs_errors RENAME TO "CCS_errors";
ALTER TABLE IF EXISTS ccs_avrae_sessions RENAME TO "CCS_avrae_sessions";
ALTER TABLE IF EXISTS ccs_tokens RENAME TO "CCS_tokens";
ALTER TABLE IF EXISTS ccs_battlemaps RENAME TO "CCS_battlemaps";
ALTER TABLE IF EXISTS ccs_freehost_images RENAME TO "CCS_freehost_images";
ALTER TABLE IF EXISTS ccs_session_images RENAME TO "CCS_session_images";
ALTER TABLE IF EXISTS ccs_location_maps RENAME TO "CCS_location_maps";
ALTER TABLE IF EXISTS ccs_locations RENAME TO "CCS_locations";

-- 2. Update RPC archive_map with quoted identifier
CREATE OR REPLACE FUNCTION public.archive_map(map_id integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  -- Must use double-quotes for case-sensitive table names
  update public."CCS_battlemaps" 
  set is_approved = false 
  where id = map_id;
$$;

-- 3. Update Trigger Function check_auto_approvals with quoted identifier
CREATE OR REPLACE FUNCTION public.check_auto_approvals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
begin
  if exists (
    select 1 from public."CCS_discord_users" 
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
