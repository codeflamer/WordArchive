-- One schedule per word, keyed by the word as shown (its base form), because repeat saves of a word share one review.
create table public.word_reviews (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word_key text not null check (char_length(word_key) >= 1),
  card jsonb not null,
  due timestamptz not null,
  last_review timestamptz not null,
  primary key (user_id, word_key)
);

create index word_reviews_user_due_idx on public.word_reviews (user_id, due);

alter table public.word_reviews enable row level security;

revoke all on public.word_reviews from anon, authenticated;
grant select, insert, update on public.word_reviews to authenticated;

create policy "Users read their own review schedule"
  on public.word_reviews for select to authenticated
  using (auth.uid() = user_id);

create policy "Users add to their own review schedule"
  on public.word_reviews for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users change their own review schedule"
  on public.word_reviews for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Every rating ever given. Rows can be added but never changed, so the history can be trusted.
create table public.word_review_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word_key text not null check (char_length(word_key) >= 1),
  rating integer not null check (rating between 1 and 4),
  reviewed_at timestamptz not null,
  next_due timestamptz not null
);

create index word_review_log_user_word_idx on public.word_review_log (user_id, word_key, reviewed_at);

alter table public.word_review_log enable row level security;

revoke all on public.word_review_log from anon, authenticated;
grant select, insert on public.word_review_log to authenticated;

create policy "Users read their own review history"
  on public.word_review_log for select to authenticated
  using (auth.uid() = user_id);

create policy "Users add to their own review history"
  on public.word_review_log for insert to authenticated
  with check (auth.uid() = user_id);

-- Saves the new schedule and the history row together, so one can't be saved without the other.
-- Runs as the signed-in user, so the access rules above still apply.
create function public.record_review(p_word_key text, p_rating integer, p_card jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.word_reviews (word_key, card, due, last_review)
  values (p_word_key, p_card, (p_card->>'due')::timestamptz, (p_card->>'last_review')::timestamptz)
  on conflict (user_id, word_key) do update
    set card = excluded.card, due = excluded.due, last_review = excluded.last_review;

  insert into public.word_review_log (word_key, rating, reviewed_at, next_due)
  values (p_word_key, p_rating, (p_card->>'last_review')::timestamptz, (p_card->>'due')::timestamptz);
$$;

revoke all on function public.record_review(text, integer, jsonb) from public, anon;
grant execute on function public.record_review(text, integer, jsonb) to authenticated;
