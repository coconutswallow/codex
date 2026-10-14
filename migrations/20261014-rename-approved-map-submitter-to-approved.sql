-- Migration: Rename approved_map_submitter to approved (boolean, default false) on CCS_discord_users
-- Date: 2026-10-14
-- Target: public.CCS_discord_users
-- Description: Renames approved_map_submitter to approved, sets default to false, and scopes access for DM Tools.
-- Run this script in the Supabase SQL Editor.

-- 1. Rename column from approved_map_submitter to approved, or add it if neither exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'CCS_discord_users'
          AND column_name = 'approved_map_submitter'
    ) THEN
        ALTER TABLE "public"."CCS_discord_users"
        RENAME COLUMN "approved_map_submitter" TO "approved";
    ELSIF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'CCS_discord_users'
          AND column_name = 'approved'
    ) THEN
        ALTER TABLE "public"."CCS_discord_users"
        ADD COLUMN "approved" BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 2. Ensure default value is false
ALTER TABLE "public"."CCS_discord_users"
ALTER COLUMN "approved" SET DEFAULT false;

-- 3. Populate any existing null values with false
UPDATE "public"."CCS_discord_users"
SET "approved" = false
WHERE "approved" IS NULL;

-- 4. Document column purpose
COMMENT ON COLUMN "public"."CCS_discord_users"."approved" IS 'Access flag for My DM Tools. Must be true for user to access DM Tools pages.';
