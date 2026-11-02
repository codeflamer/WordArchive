create table public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  author text not null check (char_length(author) between 1 and 300),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create index books_user_created_idx on public.books (user_id, created_at desc);

alter table public.books enable row level security;

revoke all on public.books from anon, authenticated;
grant select, insert on public.books to authenticated;

create policy "Users read their own books"
  on public.books for select to authenticated
  using (auth.uid() = user_id);

create policy "Users add their own books"
  on public.books for insert to authenticated
  with check (auth.uid() = user_id);

create table public.reader_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  current_book_id uuid,
  foreign key (current_book_id, user_id) references public.books (id, user_id)
);

alter table public.reader_settings enable row level security;

revoke all on public.reader_settings from anon, authenticated;
grant select, insert, update on public.reader_settings to authenticated;

create policy "Users read their own settings"
  on public.reader_settings for select to authenticated
  using (auth.uid() = user_id);

create policy "Users add their own settings"
  on public.reader_settings for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users change their own settings"
  on public.reader_settings for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Words saved before this feature keep an empty book.
alter table public.words
  add column book_id uuid,
  add foreign key (book_id, user_id) references public.books (id, user_id);

create index words_book_idx on public.words (book_id);
