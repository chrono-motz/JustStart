-- JustStart's browser client uses only the public Supabase publishable key.
-- The policies below make every row and object private to its authenticated user.

create table if not exists public.workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_workspace_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_workspace_updated_at on public.workspaces;
create trigger set_workspace_updated_at
before update on public.workspaces
for each row execute function public.set_workspace_updated_at();

alter table public.workspaces enable row level security;

drop policy if exists "Users can read their workspace" on public.workspaces;
create policy "Users can read their workspace"
on public.workspaces for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their workspace" on public.workspaces;
create policy "Users can insert their workspace"
on public.workspaces for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their workspace" on public.workspaces;
create policy "Users can update their workspace"
on public.workspaces for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their workspace" on public.workspaces;
create policy "Users can delete their workspace"
on public.workspaces for delete
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public)
values ('workspace-files', 'workspace-files', false)
on conflict (id) do update set public = false;

drop policy if exists "Users can read their workspace files" on storage.objects;
create policy "Users can read their workspace files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'workspace-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users can upload their workspace files" on storage.objects;
create policy "Users can upload their workspace files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'workspace-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users can update their workspace files" on storage.objects;
create policy "Users can update their workspace files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'workspace-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'workspace-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users can remove their workspace files" on storage.objects;
create policy "Users can remove their workspace files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'workspace-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
