alter table public.words
  add column spelling_suggestions text[],
  add column kept_as_typed boolean not null default false;

grant update (spelling_suggestions, kept_as_typed) on public.words to authenticated;
