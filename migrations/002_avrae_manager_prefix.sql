-- Migration: Rename Avrae/Monster tables to add CCS_ prefix
-- Phase: 2
-- Date: 2026-04-13

ALTER TABLE IF EXISTS public.avrae_sessions RENAME TO CCS_avrae_sessions;
ALTER TABLE IF EXISTS public.tokens RENAME TO CCS_tokens;
