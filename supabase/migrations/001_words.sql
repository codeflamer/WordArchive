create table public.words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word text not null check (char_length(word) between 1 and 64),
  created_at timestamptz not null default now()
);

create index words_user_created_idx on public.words (user_id, created_at desc);

alter table public.words enable row level security;

revoke all on public.words from anon, authenticated;
grant select, insert on public.words to authenticated;

create policy "Users read their own words"
  on public.words for select to authenticated
  using (auth.uid() = user_id);

create policy "Users add their own words"
  on public.words for insert to authenticated
  with check (auth.uid() = user_id);
