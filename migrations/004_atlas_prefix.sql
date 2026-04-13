-- Migration: Rename Atlas tables to add CCS_ prefix
-- Phase: 4 (Final)
-- Date: 2026-04-13

ALTER TABLE IF EXISTS public.location_maps RENAME TO CCS_location_maps;
ALTER TABLE IF EXISTS public.locations RENAME TO CCS_locations;
