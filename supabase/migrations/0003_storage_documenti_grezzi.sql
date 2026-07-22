-- Bucket privato per l'archivio grezzo (XML IBKR, PDF utenze/introiti).
-- Path convention: {user_id}/{sezione}/... (vedi docs/archiviazione-file-supporto.md).
-- Scrittura normale via edge function (service_role, bypassa RLS); le policy qui sotto
-- servono per l'eventuale accesso diretto futuro lato client (download del proprio file).

insert into storage.buckets (id, name, public)
values ('documenti-grezzi', 'documenti-grezzi', false)
on conflict (id) do nothing;

create policy documenti_grezzi_storage_select_own
  on storage.objects for select
  using (
    bucket_id = 'documenti-grezzi'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy documenti_grezzi_storage_insert_own
  on storage.objects for insert
  with check (
    bucket_id = 'documenti-grezzi'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy documenti_grezzi_storage_delete_own
  on storage.objects for delete
  using (
    bucket_id = 'documenti-grezzi'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
