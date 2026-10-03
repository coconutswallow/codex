-- Migration: Legacy Table Compatibility Views
-- Purpose: Provide backward-compatibility views for legacy edge functions or external tools
--          that query 'freehost_images' or 'tokens' without the CCS_ prefix.
-- Date: 2026-10-03

-- 1. Create compatibility view for freehost_images pointing to CCS_freehost_images
CREATE OR REPLACE VIEW public.freehost_images AS
    SELECT * FROM public."CCS_freehost_images";

-- 2. Create compatibility view for tokens pointing to CCS_tokens
CREATE OR REPLACE VIEW public.tokens AS
    SELECT * FROM public."CCS_tokens";

-- Grant appropriate permissions so PostgREST and authenticated/service roles can access views
GRANT ALL ON public.freehost_images TO authenticated, anon, service_role;
GRANT ALL ON public.tokens TO authenticated, anon, service_role;
