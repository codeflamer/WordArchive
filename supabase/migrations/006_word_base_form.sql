-- The typed word stays in "word". The base form sits beside it, for example mitigated and mitigate.
alter table public.words
  add column base_form text check (char_length(base_form) between 1 and 64);

grant update (base_form) on public.words to authenticated;
