alter table public.words
  add column definitions jsonb,
  add column definition_status text check (definition_status in ('found', 'not_found'));

-- Users can only fill in these two columns, and only on their own words.
grant update (definitions, definition_status) on public.words to authenticated;

create policy "Users add definitions to their own words"
  on public.words for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
