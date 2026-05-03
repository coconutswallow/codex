-- Migration to add unique constraint back to discord_id on CCS_discord_users table
-- Run this in the Supabase SQL Editor

ALTER TABLE "public"."CCS_discord_users" 
ADD CONSTRAINT "CCS_discord_users_discord_id_key" UNIQUE ("discord_id");
