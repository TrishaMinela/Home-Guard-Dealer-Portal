-- Advisor: function_search_path_mutable on public.door_builder_appearance_is_valid(jsonb).
-- The function body uses only jsonb helpers from pg_catalog. This does not change grants or results.
-- Apply by name. Do not run supabase db push.

alter function public.door_builder_appearance_is_valid(jsonb) set search_path = pg_catalog;

/*
Rollback:

alter function public.door_builder_appearance_is_valid(jsonb) reset search_path;
*/
