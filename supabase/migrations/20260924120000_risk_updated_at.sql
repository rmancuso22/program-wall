-- Liftoff: dated key risks.
--
-- Each risk carries updated_at: set when it's added and whenever its text
-- actually changes (a save with the same text keeps the old date). A trigger
-- owns the value, so clients can't back- or forward-date a risk. Existing
-- risks take their created_at.
--
-- save_project_details() still rewrites every risk (resetting their dates);
-- it is dropped in a follow-up migration once the quick look, which saves one
-- field at a time, has replaced the side panel in production.

alter table public.project_risks add column updated_at timestamptz;
update public.project_risks set updated_at = created_at;
alter table public.project_risks
  alter column updated_at set not null,
  alter column updated_at set default now();

create function public.touch_project_risk()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.body is distinct from old.body then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

create trigger project_risks_touch before insert or update on public.project_risks
  for each row execute function public.touch_project_risk();
