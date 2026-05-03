-- Migration: Create CCS_cards table (V2 Simplified)
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS "public"."CCS_cards" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "monster_type" text NOT NULL,
    "name" text NOT NULL,
    "card_number" smallint NOT NULL,
    "rarity" text,
    "flavor_text" text,
    "bonus_description" text NOT NULL,
    "passive_bonus_text" text,
    "mega_bonus_text" text,
    "image_url" text,
    "image_credit" text,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_by" uuid,
    PRIMARY KEY ("id")
);

-- Foreign key to CCS_discord_users.user_id
ALTER TABLE "public"."CCS_cards"
ADD CONSTRAINT "CCS_cards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."CCS_discord_users"("user_id") ON DELETE SET NULL;
