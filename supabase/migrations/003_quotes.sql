create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id uuid,
  body text not null check (body ~ '\S' and char_length(body) <= 20000),
  created_at timestamptz not null default now(),
  foreign key (book_id, user_id) references public.books (id, user_id)
);

create index quotes_user_created_idx on public.quotes (user_id, created_at desc);
create index quotes_book_idx on public.quotes (book_id);

alter table public.quotes enable row level security;

revoke all on public.quotes from anon, authenticated;
grant select, insert on public.quotes to authenticated;

create policy "Users read their own quotes"
  on public.quotes for select to authenticated
  using (auth.uid() = user_id);

create policy "Users add their own quotes"
  on public.quotes for insert to authenticated
  with check (auth.uid() = user_id);
