-- Trei functii mostenite ruleaza cu SECURITY DEFINER dar fara search_path fixat.
-- Restul schemei foloseste consecvent `set search_path = public, pg_temp`.
-- Fara el, un rol care poate crea obiecte intr-o schema aflata mai devreme pe
-- calea de cautare poate deturna numele necalificate din corpul functiei si
-- executa cod cu privilegiile proprietarului.
--
-- ALTER FUNCTION este suficient: nu rescrie corpul, doar fixeaza contextul.

begin;

alter function public.current_user_role() set search_path = public, pg_temp;
alter function public.is_admin()          set search_path = public, pg_temp;
alter function public.touch_last_login()  set search_path = public, pg_temp;

commit;
