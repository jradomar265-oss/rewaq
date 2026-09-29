create type public.difficulty_level as enum ('low', 'medium', 'high');
create type public.student_level as enum ('weak', 'medium', 'high');
create type public.submission_status as enum ('not_started', 'in_progress', 'submitted', 'late', 'completed');
create type public.assignment_state as enum ('draft', 'published', 'archived');

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  color text not null default '#087b77',
  created_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete restrict,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  class_name text,
  created_at timestamptz not null default now()
);

create table public.enrollments (
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  primary key (course_id, student_id)
);

create table public.student_course_progress (
  student_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  average_score numeric(5,2) check (average_score between 0 and 100),
  level public.student_level not null default 'medium',
  updated_at timestamptz not null default now(),
  primary key (student_id, course_id)
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  description text,
  difficulty public.difficulty_level not null default 'medium',
  due_at timestamptz,
  state public.assignment_state not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assignment_students (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (assignment_id, student_id)
);

create table public.submissions (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status public.submission_status not null default 'not_started',
  submission_url text,
  submitted_at timestamptz,
  grade numeric(5,2) check (grade between 0 and 100),
  teacher_feedback text,
  private_note text,
  updated_at timestamptz not null default now(),
  primary key (assignment_id, student_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index assignments_course_id_idx on public.assignments(course_id);
create index assignment_students_student_id_idx on public.assignment_students(student_id);
create index notifications_student_id_idx on public.notifications(student_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

create trigger assignments_updated_at before update on public.assignments for each row execute procedure public.set_updated_at();
create trigger progress_updated_at before update on public.student_course_progress for each row execute procedure public.set_updated_at();
create trigger submissions_updated_at before update on public.submissions for each row execute procedure public.set_updated_at();

alter table public.subjects enable row level security;
alter table public.courses enable row level security;
alter table public.enrollments enable row level security;
alter table public.student_course_progress enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_students enable row level security;
alter table public.submissions enable row level security;
alter table public.notifications enable row level security;

-- All learning data is served through Fastify with the service key. No browser
-- role receives direct table access, keeping private notes off the client.
