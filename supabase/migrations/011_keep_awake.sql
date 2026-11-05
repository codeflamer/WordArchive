-- One row recording when the scheduled job last ran. It holds no reader data.
create table public.keep_awake (
  id boolean primary key default true check (id),
  last_run timestamptz not null default now()
);

alter table public.keep_awake enable row level security;

revoke all on public.keep_awake from anon, authenticated;
grant select on public.keep_awake to authenticated;

create policy "Signed-in readers see the last run"
  on public.keep_awake for select to authenticated
  using (true);

-- The job only has the public key, so this function is the one thing that key can do here.
-- It can only update the time, so the worst misuse is a wrong "last checked" date.
create function public.record_keep_awake()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.keep_awake (id, last_run) values (true, now())
  on conflict (id) do update set last_run = now();
$$;

revoke all on function public.record_keep_awake() from public, authenticated;
grant execute on function public.record_keep_awake() to anon;
