alter table public.words
  add column pronunciation jsonb;

grant update (pronunciation) on public.words to authenticated;
