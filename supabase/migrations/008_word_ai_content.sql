alter table public.words
  add column ai_content jsonb;

grant update (ai_content) on public.words to authenticated;
