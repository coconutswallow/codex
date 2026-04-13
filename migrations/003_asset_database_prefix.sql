-- Migration: Rename Asset tables to add CCS_ prefix
-- Phase: 3
-- Date: 2026-04-13

ALTER TABLE IF EXISTS public.battlemaps RENAME TO CCS_battlemaps;
ALTER TABLE IF EXISTS public.freehost_images RENAME TO CCS_freehost_images;
ALTER TABLE IF EXISTS public.session_images RENAME TO CCS_session_images;
