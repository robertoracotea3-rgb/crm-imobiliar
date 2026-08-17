-- Revine la starea de dinainte de 20260818_380_secdef_search_path.sql.
-- Nu este recomandat: reintroduce riscul de deturnare a caii de cautare.

begin;

alter function public.current_user_role() reset search_path;
alter function public.is_admin()          reset search_path;
alter function public.touch_last_login()  reset search_path;

commit;
