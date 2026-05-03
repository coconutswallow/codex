-- Migration: Update CCS_cards to support passive and mega bonuses
-- Run this in the Supabase SQL Editor

ALTER TABLE "public"."CCS_cards" 
RENAME COLUMN "set_bonus_text" TO "passive_bonus_text";

ALTER TABLE "public"."CCS_cards" 
ADD COLUMN "mega_bonus_text" text;
