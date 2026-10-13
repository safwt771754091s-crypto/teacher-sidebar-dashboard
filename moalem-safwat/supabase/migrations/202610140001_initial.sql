-- Moalem Safwat initial schema.
-- Apply only to a dedicated Supabase project for this app; never apply to Alfaeq Yemen.
create extension if not exists pgcrypto;

create table if not exists public.student_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  grade_level smallint null check (grade_level is null or grade_level between 1 and 12),
  academic_track text null check (academic_track is null or academic_track in ('scientific','literary')),
  school_name text null check (school_name is null or char_length(school_name) <= 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  subject_name text not null check (char_length(trim(subject_name)) between 1 and 100),
  lesson_title text null check (lesson_title is null or char_length(lesson_title) <= 180),
  start_time time not null,
  created_at timestamptz not null default now()
);
create index if not exists timetable_entries_user_day_time_idx
  on public.timetable_entries(user_id, day_of_week, start_time);

-- Curriculum records are added only after verified books are imported and reviewed.
create table if not exists public.curriculum_lessons (
  id uuid primary key default gen_random_uuid(),
  grade_level smallint not null check (grade_level between 1 and 12),
  academic_track text null check (academic_track is null or academic_track in ('scientific','literary')),
  subject_name text not null check (char_length(trim(subject_name)) between 1 and 120),
  unit_title text null,
  lesson_title text not null check (char_length(trim(lesson_title)) between 1 and 240),
  lesson_content text not null default '',
  source_book text not null,
  source_edition text null,
  page_start integer null check (page_start is null or page_start > 0),
  page_end integer null check (page_end is null or page_end >= page_start),
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists curriculum_lessons_lookup_idx
  on public.curriculum_lessons(grade_level, subject_name, published, review_status);

create table if not exists public.curriculum_exercises (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.curriculum_lessons(id) on delete cascade,
  prompt text not null,
  exercise_type text not null default 'short_answer'
    check (exercise_type in ('multiple_choice','true_false','short_answer','math')),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  explanation text not null default '',
  source_page integer null check (source_page is null or source_page > 0),
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists curriculum_exercises_lesson_idx
  on public.curriculum_exercises(lesson_id, published, review_status);

create table if not exists public.student_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid null references public.curriculum_lessons(id) on delete set null,
  exercise_id uuid null references public.curriculum_exercises(id) on delete set null,
  activity_type text not null check (activity_type in ('math_game','english_game','quiz','lesson_check')),
  is_correct boolean not null,
  score numeric(5,2) null check (score is null or score between 0 and 100),
  created_at timestamptz not null default now()
);
create index if not exists student_attempts_user_created_idx
  on public.student_attempts(user_id, created_at desc);

-- Create a minimal student profile at signup without requiring any sample/student data.
create or replace function public.handle_new_student()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.student_profiles (user_id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_student on auth.users;
create trigger on_auth_user_created_student
  after insert on auth.users
  for each row execute procedure public.handle_new_student();

alter table public.student_profiles enable row level security;
alter table public.timetable_entries enable row level security;
alter table public.curriculum_lessons enable row level security;
alter table public.curriculum_exercises enable row level security;
alter table public.student_attempts enable row level security;

drop policy if exists "students read own profile" on public.student_profiles;
create policy "students read own profile" on public.student_profiles
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "students create own profile" on public.student_profiles;
create policy "students create own profile" on public.student_profiles
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "students update own profile" on public.student_profiles;
create policy "students update own profile" on public.student_profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "students read own timetable" on public.timetable_entries;
create policy "students read own timetable" on public.timetable_entries
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "students add own timetable" on public.timetable_entries;
create policy "students add own timetable" on public.timetable_entries
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "students delete own timetable" on public.timetable_entries;
create policy "students delete own timetable" on public.timetable_entries
  for delete to authenticated using (auth.uid() = user_id);
drop policy if exists "students update own timetable" on public.timetable_entries;
create policy "students update own timetable" on public.timetable_entries
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "students read published lessons" on public.curriculum_lessons;
create policy "students read published lessons" on public.curriculum_lessons
  for select to authenticated using (published = true and review_status = 'approved');
drop policy if exists "students read published exercises" on public.curriculum_exercises;
create policy "students read published exercises" on public.curriculum_exercises
  for select to authenticated using (
    published = true and review_status = 'approved'
    and exists (
      select 1 from public.curriculum_lessons l
      where l.id = lesson_id and l.published = true and l.review_status = 'approved'
    )
  );

drop policy if exists "students read own attempts" on public.student_attempts;
create policy "students read own attempts" on public.student_attempts
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "students add own attempts" on public.student_attempts;
create policy "students add own attempts" on public.student_attempts
  for insert to authenticated with check (auth.uid() = user_id);

grant select, insert, update on public.student_profiles to authenticated;
grant select, insert, update, delete on public.timetable_entries to authenticated;
grant select on public.curriculum_lessons, public.curriculum_exercises to authenticated;
grant select, insert on public.student_attempts to authenticated;
