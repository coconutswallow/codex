-- Migration: Insert global card_point_cost setting
-- Run this in the Supabase SQL Editor

INSERT INTO "public"."CCS_system" ("setting", "value")
VALUES ('card_point_cost', '10')
ON CONFLICT DO NOTHING;
