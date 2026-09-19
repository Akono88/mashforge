-- MashForge: mashup session history
-- Run in the Supabase SQL editor or via `supabase db push`.

create table if not exists public.mashup_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  track_a_name text not null,
  track_b_name text not null,
  genre text not null,
  target_bpm numeric(6,2) not null,
  semitones_b integer not null default 0,
  stretch_b numeric(6,3) not null default 1,
  bars integer not null,
  summary text not null
);

-- Public insert (anon key) so the static frontend can save sessions;
-- reads open too so history can be listed. Tighten as needed.
alter table public.mashup_sessions enable row level security;

create policy "anyone can insert mashup sessions"
  on public.mashup_sessions for insert
  to anon, authenticated
  with check (true);

create policy "anyone can read mashup sessions"
  on public.mashup_sessions for select
  to anon, authenticated
  using (true);
