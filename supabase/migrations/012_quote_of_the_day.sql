alter table public.quotes
  add column last_shown_on date;

-- Only this column can change, so a quote's words stay exactly as saved.
grant update (last_shown_on) on public.quotes to authenticated;

create policy "Users mark their own quotes as shown"
  on public.quotes for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keeps today's quote if one was already chosen. Otherwise picks the quote that has waited longest,
-- with never-shown quotes first, so none repeats until the others have been shown.
-- The app sends the reader's own date, as the day changes at their midnight, not the server's.
-- Runs as the signed-in user, so the access rules above still apply.
create function public.quote_of_the_day(p_today date)
returns setof public.quotes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  chosen uuid;
begin
  select id into chosen from public.quotes where last_shown_on = p_today limit 1;
  if chosen is null then
    select id into chosen from public.quotes order by last_shown_on asc nulls first, random() limit 1;
    if chosen is null then
      return;
    end if;
    update public.quotes set last_shown_on = p_today where id = chosen;
  end if;
  return query select * from public.quotes where id = chosen;
end;
$$;

revoke all on function public.quote_of_the_day(date) from public, anon;
grant execute on function public.quote_of_the_day(date) to authenticated;
