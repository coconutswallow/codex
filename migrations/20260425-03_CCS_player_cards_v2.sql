-- Migration: Create CCS_player_cards table (V2 Simplified)
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS "public"."CCS_player_cards" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "card_id" uuid NOT NULL,
    "state" text NOT NULL CHECK (state IN ('unrevealed', 'revealed')),
    "acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
    "revealed_at" timestamp with time zone,
    PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "public"."CCS_player_cards"
ADD CONSTRAINT "CCS_player_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."CCS_discord_users"("user_id") ON DELETE CASCADE;

ALTER TABLE "public"."CCS_player_cards"
ADD CONSTRAINT "CCS_player_cards_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."CCS_cards"("id") ON DELETE CASCADE;

-- Ensure no duplicate cards per user
CREATE UNIQUE INDEX "CCS_player_cards_user_card_unique" 
ON "public"."CCS_player_cards" ("user_id", "card_id");
