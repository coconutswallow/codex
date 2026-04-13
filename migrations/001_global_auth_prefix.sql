-- Migration: Rename Global and Authentication tables to add CCS_ prefix
-- Phase: 1
-- Date: 2026-04-13

-- Rename Tables
ALTER TABLE IF EXISTS public.discord_users RENAME TO CCS_discord_users;
ALTER TABLE IF EXISTS public.discord_role_map RENAME TO CCS_discord_role_map;
ALTER TABLE IF EXISTS public.system RENAME TO CCS_system;
ALTER TABLE IF EXISTS public.errors RENAME TO CCS_errors;

-- Note: Standard RENAME in PostgreSQL updates indexes and foreign keys automatically.
-- Ensure RLS policies are updated if they were tied specifically to the table name string.
