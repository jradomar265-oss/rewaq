create type public.user_role as enum ('student', 'teacher', 'parent', 'activities');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.user_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  requested_role public.user_role;
begin
  requested_role := case new.raw_user_meta_data ->> 'role'
    when 'teacher' then 'teacher'::public.user_role
    when 'parent' then 'parent'::public.user_role
    when 'activities' then 'activities'::public.user_role
    else 'student'::public.user_role
  end;

  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data ->> 'full_name', requested_role);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
