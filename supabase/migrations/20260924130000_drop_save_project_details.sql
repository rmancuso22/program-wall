-- The quick look (live since 9b3a364) saves one field at a time; nothing
-- calls the side panel's save_project_details() any more, and it would reset
-- every risk date on the project it saved.
drop function public.save_project_details(uuid, text, public.project_rag, text, date, date, date, date, date, text[], jsonb);
