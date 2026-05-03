-- Migration: Create CCS_card_participants table (V2 Simplified)
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS "public"."CCS_card_participants" (
    "user_id" uuid NOT NULL,
    "points" integer DEFAULT 0 NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
    "enrolled_by" uuid,
    PRIMARY KEY ("user_id")
);

-- Foreign keys
ALTER TABLE "public"."CCS_card_participants"
ADD CONSTRAINT "CCS_card_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."CCS_discord_users"("user_id") ON DELETE CASCADE;

ALTER TABLE "public"."CCS_card_participants"
ADD CONSTRAINT "CCS_card_participants_enrolled_by_fkey" FOREIGN KEY ("enrolled_by") REFERENCES "public"."CCS_discord_users"("user_id") ON DELETE SET NULL;
