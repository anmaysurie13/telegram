-- Run once in Supabase: Project -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: every statement checks whether the object already exists.

create table if not exists public.notes (
  id            bigint generated always as identity primary key,
  content       text        not null,
  score         smallint    check (score between 0 and 10),
  score_reason  text,
  created_at    timestamptz not null default now()
);

create table if not exists public.drafts (
  id                   bigint generated always as identity primary key,
  note_id              bigint      not null references public.notes (id),
  -- Needed so an APPROVE/REJECT reply finds the right draft in the right chat.
  chat_id              bigint      not null,
  telegram_message_id  bigint,
  content              text        not null,
  status               text        not null default 'pending'
                                   check (status in ('pending', 'approved', 'rejected')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists drafts_pending_by_chat
  on public.drafts (chat_id, created_at desc) where status = 'pending';

create table if not exists public.voice_skill (
  id          bigint generated always as identity primary key,
  content     text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Keep updated_at current on every update.
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists drafts_updated_at on public.drafts;
create trigger drafts_updated_at before update on public.drafts
  for each row execute function public.set_updated_at();

drop trigger if exists voice_skill_updated_at on public.voice_skill;
create trigger voice_skill_updated_at before update on public.voice_skill
  for each row execute function public.set_updated_at();

-- Lock the tables to the server. Row level security with no policies means the
-- public anon key can read or write nothing; the bot uses the service role key,
-- which bypasses RLS.
alter table public.notes       enable row level security;
alter table public.drafts      enable row level security;
alter table public.voice_skill enable row level security;
